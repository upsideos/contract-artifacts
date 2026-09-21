#!/usr/bin/env node
/**
 * contract-artifacts CLI
 *
 * build | verify | pack | audit | generate-abis | verify-onchain
 */

import { join } from 'node:path'
import { auditAll, auditRelease } from './audit'
import { buildRelease } from './build'
import { defaultReleaseId, findConfigRoot, getRelease } from './config'
import { generateAbis, writeGeneratedAbis } from './generate_abis'
import { loadJson } from './artifacts'
import { parseManifest } from './manifest'
import { writeReleaseFiles, writeReleaseIndex } from './pack'
import { loadReleaseArtifacts, loadVerificationBundle } from './artifacts'
import { verifyOnchain, verifyOnchainFromUrl } from './verify_onchain'
import { verifyRelease } from './verify'

export function parseArgs(argv: string[]): {
  command: string
  flags: Record<string, string | boolean | string[]>
} {
  const [command, ...rest] = argv
  const flags: Record<string, string | boolean | string[]> = {}
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (!token.startsWith('--')) {
      continue
    }
    const key = token.slice(2)
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
      continue
    }
    if (key === 'allow-unreproduced') {
      const current = flags[key]
      const list = Array.isArray(current) ? current : []
      list.push(next)
      flags[key] = list
      i++
      continue
    }
    flags[key] = next
    i++
  }
  return { command: command ?? '', flags }
}

function flagString(
  flags: Record<string, string | boolean | string[]>,
  name: string,
): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

function usage(): string {
  return `Usage:
  contract-artifacts build --release <id> --artifacts-dir <path> --out-dir <path>
  contract-artifacts verify --release <id> [--commit <sha>] [--contracts-repo <path>] [--skip-compile] [--skip-proof-a] [--allow-unreproduced <name>]
  contract-artifacts pack --release <id> --out-dir <path> [--skip-compile]
  contract-artifacts audit [--release <id>]
  contract-artifacts generate-abis --release <id> [--write]
  contract-artifacts verify-onchain --release <id> --address <addr> --rpc <url> --contract <name> [--manifest <path> | --registry-url <url>]
`
}

function configRootFrom(
  flags: Record<string, string | boolean | string[]>,
): string {
  return flagString(flags, 'config-root') ?? findConfigRoot()
}

function printVerify(report: {
  proofA: {
    ok: boolean
    skipped: boolean
    sources: Array<{ path: string; match: boolean; message: string }>
  }
  proofB: {
    ok: boolean
    artifacts: Array<{ name: string; reproduced: boolean; message?: string }>
  }
}): void {
  if (report.proofA.skipped) {
    console.log(
      'Proof A: SKIPPED (no contracts checkout to compare the sources ' +
        'against, pass --contracts-repo)',
    )
  } else {
    console.log(
      `Proof A: ${report.proofA.ok ? 'PASS' : 'FAIL'} (${report.proofA.sources.filter(s => s.match).length}/${report.proofA.sources.length} sources)`,
    )
  }
  for (const source of report.proofA.sources.filter(s => !s.match)) {
    console.log(`  ${source.path}: ${source.message}`)
  }
  if (report.proofB.artifacts.length > 0) {
    console.log(
      `Proof B: ${report.proofB.ok ? 'PASS' : 'FAIL'} (${report.proofB.artifacts.filter(a => a.reproduced).length}/${report.proofB.artifacts.length} artifacts)`,
    )
    for (const artifact of report.proofB.artifacts.filter(a => !a.reproduced)) {
      console.log(`  ${artifact.name}: ${artifact.message ?? 'mismatch'}`)
    }
  }
}

// A proof that did not run is not a proof that passed. Only a caller who
// asked for --skip-proof-a gets a release without one.
function proofAAccepted(
  proofA: { ok: boolean; skipped: boolean },
  flags: Record<string, string | boolean | string[]>,
): boolean {
  return proofA.skipped ? flags['skip-proof-a'] === true : proofA.ok
}

const PROOF_A_MISSING =
  'The sources were not compared against the pinned commit. Pass ' +
  '--contracts-repo <path>, or --skip-proof-a to accept the release without it.'

export async function run(argv: string[]): Promise<number> {
  const { command, flags } = parseArgs(argv)

  if (command === '' || command === 'help' || flags.help === true) {
    console.log(usage())
    return command === 'help' || flags.help === true ? 0 : 1
  }

  const configRoot = configRootFrom(flags)

  if (command === 'verify') {
    const releaseId =
      flagString(flags, 'release') ?? defaultReleaseId(configRoot)
    getRelease(releaseId, configRoot)
    const report = await verifyRelease({
      releaseId,
      commit: flagString(flags, 'commit'),
      configRoot,
      skipCompile: flags['skip-compile'] === true,
      skipProofA: flags['skip-proof-a'] === true,
      contractsRepo: flagString(flags, 'contracts-repo'),
      allowUnreproduced: Array.isArray(flags['allow-unreproduced'])
        ? flags['allow-unreproduced']
        : undefined,
    })
    printVerify(report)
    if (report.proofA.skipped && flags['skip-proof-a'] !== true) {
      console.error(PROOF_A_MISSING)
    }
    return proofAAccepted(report.proofA, flags) && report.proofB.ok ? 0 : 1
  }

  if (command === 'pack') {
    const releaseId = flagString(flags, 'release')
    const outDir = flagString(flags, 'out-dir')
    if (releaseId === undefined || outDir === undefined) {
      console.error('--release and --out-dir are required')
      return 1
    }
    const entry = getRelease(releaseId, configRoot)
    const report = await verifyRelease({
      releaseId,
      commit: flagString(flags, 'commit'),
      configRoot,
      skipCompile: flags['skip-compile'] === true,
      skipProofA: flags['skip-proof-a'] === true,
      contractsRepo: flagString(flags, 'contracts-repo'),
      allowUnreproduced: Array.isArray(flags['allow-unreproduced'])
        ? flags['allow-unreproduced']
        : undefined,
    })
    if (!proofAAccepted(report.proofA, flags) || !report.proofB.ok) {
      printVerify(report)
      console.error(
        report.proofA.skipped
          ? `Refusing to pack: ${PROOF_A_MISSING}`
          : 'Refusing to pack: proofs failed',
      )
      return 1
    }
    const artifacts = loadReleaseArtifacts(entry)
    writeReleaseFiles(outDir, report, artifacts, loadVerificationBundle(entry))
    writeReleaseIndex(outDir, entry.artifacts)
    console.log(`Wrote release to ${outDir}`)
    return 0
  }

  if (command === 'build') {
    const releaseId = flagString(flags, 'release')
    const artifactsDir = flagString(flags, 'artifacts-dir')
    const outDir = flagString(flags, 'out-dir')
    if (
      releaseId === undefined ||
      artifactsDir === undefined ||
      outDir === undefined
    ) {
      console.error('--release, --artifacts-dir, and --out-dir are required')
      return 1
    }
    const result = await buildRelease({
      releaseId,
      artifactsDir,
      outDir,
      configRoot,
      skipCompile: flags['skip-compile'] === true,
      skipProofA: flags['skip-proof-a'] === true,
      contractsRepo: flagString(flags, 'contracts-repo'),
      commit: flagString(flags, 'commit'),
      allowUnreproduced: Array.isArray(flags['allow-unreproduced'])
        ? flags['allow-unreproduced']
        : undefined,
    })
    if (result.proofASkipped && flags['skip-proof-a'] !== true) {
      console.error(`Refusing the release: ${PROOF_A_MISSING}`)
      return 1
    }
    console.log(`Wrote release to ${result.outDir}`)
    return result.reproduced ? 0 : 1
  }

  if (command === 'audit') {
    const releaseId = flagString(flags, 'release')
    const reports =
      releaseId === undefined
        ? auditAll(configRoot)
        : [auditRelease(releaseId, configRoot)]
    let failed = false
    for (const report of reports) {
      console.log(`${report.releaseId}: ${report.ok ? 'PASS' : 'FAIL'}`)
      for (const finding of report.findings.filter(f => !f.ok)) {
        console.log(`  ${finding.path}: ${finding.message}`)
        failed = true
      }
    }
    return failed ? 1 : 0
  }

  if (command === 'generate-abis') {
    const releaseId = flagString(flags, 'release')
    if (releaseId === undefined) {
      console.error('--release is required')
      return 1
    }
    const files = generateAbis(releaseId, configRoot)
    if (flags.write === true) {
      writeGeneratedAbis(files, configRoot)
      console.log(`Wrote ${files.length} ABI files`)
    } else {
      console.log(
        `Would write ${files.length} ABI files. Pass --write to apply.`,
      )
    }
    return 0
  }

  if (command === 'verify-onchain') {
    const releaseId = flagString(flags, 'release')
    const address = flagString(flags, 'address')
    const rpc = flagString(flags, 'rpc')
    const contract = flagString(flags, 'contract')
    if (
      releaseId === undefined ||
      address === undefined ||
      rpc === undefined ||
      contract === undefined
    ) {
      console.error('--release, --address, --rpc, and --contract are required')
      return 1
    }
    const manifestPath = flagString(flags, 'manifest')
    const registryUrl = flagString(flags, 'registry-url')
    const result =
      manifestPath !== undefined
        ? await verifyOnchain({
            rpcUrl: rpc,
            address,
            contractName: contract,
            manifest: parseManifest(loadJson(manifestPath)),
          })
        : registryUrl !== undefined
          ? await verifyOnchainFromUrl({
              registryUrl,
              releaseId,
              rpcUrl: rpc,
              address,
              contractName: contract,
            })
          : await verifyOnchain({
              rpcUrl: rpc,
              address,
              contractName: contract,
              manifest: parseManifest(
                loadJson(
                  join(
                    getRelease(releaseId, configRoot).configRoot,
                    getRelease(releaseId, configRoot).releaseDir ?? '',
                    'manifest.json',
                  ),
                ),
              ),
            })
    console.log(
      `${result.name}: ${result.match ? 'PASS' : 'FAIL'} ${result.message}`,
    )
    return result.match ? 0 : 1
  }

  console.error(usage())
  return 1
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then(code => {
      process.exitCode = code
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
