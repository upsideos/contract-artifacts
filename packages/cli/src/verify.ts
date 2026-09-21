/**
 * Proof A (sources == git tree) and proof B (recompile == bytecode).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evmAdapter } from './adapters/evm'
import type { ReproduceArtifactResult } from './adapters/types'
import {
  loadReleaseArtifacts,
  loadVerificationBundle,
  type LoadedArtifact,
} from './artifacts'
import { findConfigRoot, getRelease, type ReleaseCatalogEntry } from './config'
import { mergeAbis, type AbiEntry } from './abi_merge'
import {
  extractMetadataHash,
  hexToBytes,
  sha256Canonical,
  sha256Hex,
  sha256HexBytes,
  sha256MaskedRuntime,
  type Manifest,
} from './manifest'

export interface SourceCheck {
  path: string
  match: boolean
  message: string
}

export interface VerifyReport {
  releaseId: string
  commit: string
  proofA: { ok: boolean; skipped: boolean; sources: SourceCheck[] }
  proofB: { ok: boolean; artifacts: ReproduceArtifactResult[] }
  manifest: Manifest
}

export interface VerifyOptions {
  releaseId: string
  commit?: string
  configRoot?: string
  skipCompile?: boolean
  skipProofA?: boolean
  allowUnreproduced?: string[]
  contractsRepo?: string
}

function gitShow(repo: string, commit: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return null
  }
}

export function cloneContractsRepo(url: string, commit: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'contract-artifacts-'))
  execFileSync('git', ['clone', '--quiet', url, dir], { stdio: 'pipe' })
  execFileSync('git', ['checkout', '--quiet', commit], {
    cwd: dir,
    stdio: 'pipe',
  })
  return dir
}

export function checkSourcesAgainstCommit(
  bundle: Record<string, unknown>,
  contractsRepo: string,
  commit: string,
): SourceCheck[] {
  const input = bundle.input as {
    sources?: Record<string, { content?: string }>
  }
  const sources = input.sources ?? {}
  const checks: SourceCheck[] = []
  for (const [path, entry] of Object.entries(sources)) {
    if (!path.startsWith('contracts/')) {
      continue
    }
    const want = entry.content ?? ''
    const got = gitShow(contractsRepo, commit, path)
    if (got === null) {
      checks.push({
        path,
        match: false,
        message: `path is absent at commit ${commit}`,
      })
      continue
    }
    const match = got === want
    checks.push({
      path,
      match,
      message: match ? 'matches commit tree' : 'differs from commit tree',
    })
  }
  return checks
}

function treeSha256(contractsRepo: string, commit: string): string {
  const tree = execFileSync('git', ['rev-parse', `${commit}^{tree}`], {
    cwd: contractsRepo,
    encoding: 'utf8',
  }).trim()
  return sha256Hex(tree)
}

function artifactRecordFrom(
  artifact: LoadedArtifact,
  reproduced: ReproduceArtifactResult | undefined,
): Manifest['artifacts'][number] {
  const creation = reproduced?.creationCode ?? artifact.bytecode
  const runtime =
    reproduced?.runtimeCode ?? artifact.deployedBytecode ?? artifact.bytecode
  const refs =
    reproduced?.immutableReferences ?? artifact.immutableReferences ?? {}
  return {
    name: artifact.name,
    fullyQualifiedName: artifact.fullyQualifiedName,
    abi: {
      path: `abi/${artifact.name}.json`,
      sha256: sha256Canonical(artifact.abi),
      entryCount: artifact.abi.length,
    },
    creationCode: {
      sha256: sha256HexBytes(creation),
      length: hexToBytes(creation).length,
    },
    runtimeCode: {
      sha256: sha256MaskedRuntime(runtime, refs),
      length: hexToBytes(runtime).length,
      immutableReferences: refs,
    },
    metadataHash: reproduced?.metadataHash ?? extractMetadataHash(runtime),
    reproduced: reproduced?.reproduced ?? false,
  }
}

export function buildCallSurfaces(
  entry: ReleaseCatalogEntry,
  artifacts: LoadedArtifact[],
): Manifest['callSurfaces'] {
  const byName = new Map(artifacts.map(a => [a.name, a]))
  return entry.callSurfaces.map(surface => {
    const parts = surface.mergedFrom.map(name => {
      const artifact = byName.get(name)
      if (artifact === undefined) {
        throw new Error(`call surface ${surface.name} missing part ${name}`)
      }
      return artifact.abi as AbiEntry[]
    })
    const merged = mergeAbis(parts)
    return {
      name: surface.name,
      abi: {
        path: `abi/merged/${surface.name}.json`,
        sha256: sha256Canonical(merged),
        entryCount: merged.length,
      },
      mergedFrom: surface.mergedFrom,
    }
  })
}

export async function verifyLoadedRelease(options: {
  entry: ReleaseCatalogEntry
  artifacts: LoadedArtifact[]
  bundle: Record<string, unknown>
  commit?: string
  skipCompile?: boolean
  skipProofA?: boolean
  allowUnreproduced?: string[]
  contractsRepo?: string
}): Promise<VerifyReport> {
  const commit = options.commit ?? options.entry.source.commit
  const repository = options.entry.source.repository
  let contractsRepo = options.contractsRepo
  let cloned = false
  const haveLocalRepo = contractsRepo !== undefined && existsSync(contractsRepo)
  // Without a source repository a caller can only compare against a checkout
  // it already has. The report says that this proof did not run, because a
  // proof nobody made must not read as a proof that passed.
  const skipProofA =
    options.skipProofA === true || (repository === undefined && !haveLocalRepo)
  if (!skipProofA && repository !== undefined && !haveLocalRepo) {
    contractsRepo = cloneContractsRepo(repository, commit)
    cloned = true
  }

  try {
    const proofASources =
      skipProofA || contractsRepo === undefined
        ? []
        : checkSourcesAgainstCommit(options.bundle, contractsRepo, commit)
    const proofAOk = skipProofA ? true : proofASources.every(s => s.match)

    let compiled: ReproduceArtifactResult[] = []
    if (options.skipCompile !== true) {
      const input = options.bundle.input as Record<string, unknown>
      compiled = await evmAdapter.reproduce({
        standardJson: input,
        compilerLongVersion: String(options.bundle.solcLongVersion),
        artifacts: options.artifacts,
      })
    }

    const allow = new Set(options.allowUnreproduced ?? [])
    const proofBOk =
      options.skipCompile === true
        ? true
        : compiled.every(a => a.reproduced || allow.has(a.name))

    const artifactRecords = options.artifacts.map(artifact =>
      artifactRecordFrom(
        artifact,
        compiled.find(c => c.name === artifact.name),
      ),
    )

    const tree =
      contractsRepo !== undefined
        ? treeSha256(contractsRepo, commit)
        : undefined

    const manifest: Manifest = {
      schemaVersion: '1.0',
      releaseId: options.entry.releaseId,
      chainFamily: options.entry.chainFamily,
      audit: { ...options.entry.audit },
      source: {
        repository: options.entry.source.repository,
        commit,
        treeSha256: tree,
      },
      build: {
        kind: 'solc-standard-json',
        compilerLongVersion: String(options.bundle.solcLongVersion),
        standardJson: {
          path: 'verification-source-codes.json',
          sha256: sha256Canonical(options.bundle),
        },
      },
      artifacts: artifactRecords,
      callSurfaces: buildCallSurfaces(options.entry, options.artifacts),
    }

    return {
      releaseId: options.entry.releaseId,
      commit,
      proofA: { ok: proofAOk, skipped: skipProofA, sources: proofASources },
      proofB: { ok: proofBOk, artifacts: compiled },
      manifest,
    }
  } finally {
    if (cloned && contractsRepo !== undefined) {
      rmSync(contractsRepo, { recursive: true, force: true })
    }
  }
}

export async function verifyRelease(
  options: VerifyOptions,
): Promise<VerifyReport> {
  const configRoot = options.configRoot ?? findConfigRoot()
  const entry = getRelease(options.releaseId, configRoot)
  return verifyLoadedRelease({
    entry,
    artifacts: loadReleaseArtifacts(entry),
    bundle: loadVerificationBundle(entry),
    commit: options.commit,
    skipCompile: options.skipCompile,
    skipProofA: options.skipProofA,
    allowUnreproduced: options.allowUnreproduced,
    contractsRepo: options.contractsRepo,
  })
}
