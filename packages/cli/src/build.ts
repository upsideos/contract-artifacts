/**
 * Build a packed release from a Hardhat artifacts directory.
 *
 * Port of process_security_token_artifacts.py steps 1-4:
 * select build-info from .dbg.json, emit verification sources,
 * convert artifacts, and merge call-surface ABIs.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { findConfigRoot, getRelease } from './config'
import { loadArtifactFile, type LoadedArtifact } from './artifacts'
import { writeReleaseFiles, writeReleaseIndex } from './pack'
import { verifyLoadedRelease } from './verify'

export const FILTERED_SOURCE_PREFIXES = [
  'mocks/',
  'ds-test/',
  'forge-std/',
  'test/',
  'hardhat/',
  'script/',
  'contracts/mocks/',
]

export interface BuildOptions {
  releaseId: string
  artifactsDir: string
  outDir: string
  configRoot?: string
  skipCompile?: boolean
  skipProofA?: boolean
  contractsRepo?: string
  commit?: string
  allowUnreproduced?: string[]
}

interface BuildInfo {
  input?: {
    sources?: Record<string, unknown>
    [key: string]: unknown
  }
  solcLongVersion?: string
  [key: string]: unknown
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    return acc
  }
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      walkFiles(path, acc)
    } else {
      acc.push(path)
    }
  }
  return acc
}

function removeKeysWithPrefixes(
  obj: Record<string, unknown>,
  prefixes: string[],
): void {
  for (const key of Object.keys(obj)) {
    if (prefixes.some(prefix => key.startsWith(prefix))) {
      delete obj[key]
    } else {
      const child = obj[key]
      if (
        child !== null &&
        typeof child === 'object' &&
        !Array.isArray(child)
      ) {
        removeKeysWithPrefixes(child as Record<string, unknown>, prefixes)
      }
    }
  }
}

export function normalizeBytecode(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value !== null && typeof value === 'object' && 'object' in value) {
    const object = (value as { object?: unknown }).object
    return typeof object === 'string' ? object : ''
  }
  return ''
}

export function selectVerificationBundle(
  artifactsDir: string,
): Record<string, unknown> {
  const buildInfoDir = join(artifactsDir, 'build-info')
  if (!existsSync(buildInfoDir)) {
    throw new Error(`Missing build-info directory ${buildInfoDir}`)
  }
  const allBuildInfos = new Map<string, BuildInfo>()
  for (const file of readdirSync(buildInfoDir)) {
    if (!file.endsWith('.json') || file === 'verification_source_codes.json') {
      continue
    }
    const path = join(buildInfoDir, file)
    allBuildInfos.set(
      basename(file, '.json'),
      JSON.parse(readFileSync(path, 'utf8')) as BuildInfo,
    )
  }
  if (allBuildInfos.size === 0) {
    throw new Error(`No build-info files in ${buildInfoDir}`)
  }

  const dbgCounts = new Map<string, number>()
  const contractSourceFromDbg = new Map<string, string>()
  const contractsDir = join(artifactsDir, 'contracts')
  if (existsSync(contractsDir)) {
    for (const dbgFile of walkFiles(contractsDir).filter(p =>
      p.endsWith('.dbg.json'),
    )) {
      const dbg = JSON.parse(readFileSync(dbgFile, 'utf8')) as {
        buildInfo?: string
      }
      const dedicatedId = basename(dbg.buildInfo ?? '', '.json')
      if (!allBuildInfos.has(dedicatedId)) {
        continue
      }
      dbgCounts.set(dedicatedId, (dbgCounts.get(dedicatedId) ?? 0) + 1)
      const sourcePath = relative(artifactsDir, dirname(dbgFile))
      contractSourceFromDbg.set(sourcePath, dedicatedId)
    }
  }

  let baseId: string
  if (dbgCounts.size > 0) {
    baseId = [...dbgCounts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]
      }
      const aCount = Object.keys(
        allBuildInfos.get(a[0])?.input?.sources ?? {},
      ).length
      const bCount = Object.keys(
        allBuildInfos.get(b[0])?.input?.sources ?? {},
      ).length
      return bCount - aCount
    })[0][0]
  } else {
    baseId = [...allBuildInfos.entries()].sort((a, b) => {
      const aCount = Object.keys(a[1].input?.sources ?? {}).length
      const bCount = Object.keys(b[1].input?.sources ?? {}).length
      return bCount - aCount
    })[0][0]
  }

  const base = structuredClone(allBuildInfos.get(baseId) as BuildInfo)
  delete base.output
  if (base.input !== undefined) {
    removeKeysWithPrefixes(
      base.input as Record<string, unknown>,
      FILTERED_SOURCE_PREFIXES,
    )
  }
  const sources =
    (base.input?.sources as Record<string, unknown> | undefined) ?? {}
  for (const [sourcePath, dedicatedId] of contractSourceFromDbg) {
    const dedicated = allBuildInfos.get(dedicatedId)?.input?.sources ?? {}
    if (dedicated[sourcePath] !== undefined) {
      sources[sourcePath] = dedicated[sourcePath]
    }
  }
  if (base.input !== undefined) {
    base.input.sources = sources
  }
  return base
}

export function convertHardhatArtifact(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const simplified: Record<string, unknown> = {
    abi: raw.abi ?? [],
    bytecode: normalizeBytecode(raw.bytecode),
  }
  const deployed = raw.deployedBytecode
  if (deployed !== undefined && deployed !== null && deployed !== '') {
    simplified.deployedBytecode = normalizeBytecode(deployed)
    if (
      typeof deployed === 'object' &&
      deployed !== null &&
      'immutableReferences' in deployed
    ) {
      simplified.immutableReferences = (
        deployed as { immutableReferences?: unknown }
      ).immutableReferences
    }
  }
  if (raw.immutableReferences !== undefined) {
    simplified.immutableReferences = raw.immutableReferences
  }
  if (raw.metadata !== undefined) {
    simplified.metadata = raw.metadata
  }
  return simplified
}

function findNamedArtifact(
  artifactsDir: string,
  name: string,
): string | undefined {
  const exact = walkFiles(artifactsDir).find(
    path =>
      basename(path) === `${name}.json` &&
      !path.includes('build-info') &&
      !path.endsWith('.dbg.json'),
  )
  return exact
}

export async function buildRelease(options: BuildOptions): Promise<{
  outDir: string
  reproduced: boolean
  proofASkipped: boolean
}> {
  const configRoot = options.configRoot ?? findConfigRoot()
  const entry = getRelease(options.releaseId, configRoot)
  const bundle = selectVerificationBundle(options.artifactsDir)
  mkdirSync(options.outDir, { recursive: true })
  writeFileSync(
    join(options.outDir, 'verification-source-codes.json'),
    JSON.stringify(bundle),
    'utf8',
  )

  const converted: LoadedArtifact[] = []
  for (const name of entry.artifacts) {
    const path = findNamedArtifact(options.artifactsDir, name)
    if (path === undefined) {
      throw new Error(`Hardhat artifact for ${name} is missing`)
    }
    const simplified = convertHardhatArtifact(
      JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>,
    )
    const dest = join(options.outDir, 'artifacts', `${name}.json`)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, JSON.stringify(simplified), 'utf8')
    converted.push(loadArtifactFile(dest, name))
  }

  const report = await verifyLoadedRelease({
    entry,
    artifacts: converted,
    bundle,
    commit: options.commit,
    skipCompile: options.skipCompile === true,
    skipProofA: options.skipProofA === true,
    contractsRepo: options.contractsRepo,
    allowUnreproduced: options.allowUnreproduced,
  })

  writeReleaseFiles(options.outDir, report, converted, bundle)
  writeReleaseIndex(options.outDir, entry.artifacts)
  return {
    outDir: options.outDir,
    reproduced: report.proofA.ok && report.proofB.ok,
    proofASkipped: report.proofA.skipped,
  }
}
