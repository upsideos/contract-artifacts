/**
 * Drift gate for a packed release and for consumer copies
 * (docs static assets and vendor/abi).
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadJson, resolveReleaseDir } from './artifacts'
import {
  findConfigRoot,
  getRelease,
  listReleases,
  type ReleaseCatalogEntry,
} from './config'
import { parseManifest, sha256Canonical } from './manifest'
import { diffGeneratedAbis, generateAbisForRelease } from './generate_abis'
import { generateTypedAbisForRelease } from './typed_abis'

export interface AuditFinding {
  path: string
  ok: boolean
  message: string
}

export interface AuditReport {
  releaseId: string
  ok: boolean
  findings: AuditFinding[]
}

function auditPackedRelease(entry: ReleaseCatalogEntry): AuditFinding[] {
  const releaseDir = resolveReleaseDir(entry)
  if (releaseDir === undefined) {
    return [
      {
        path: entry.releaseId,
        ok: false,
        message: 'release has no packed directory',
      },
    ]
  }
  const manifestPath = join(releaseDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    return [
      {
        path: manifestPath,
        ok: false,
        message: 'missing manifest.json',
      },
    ]
  }
  const manifest = parseManifest(loadJson(manifestPath))
  const findings: AuditFinding[] = []

  // The config is the one catalog of pins and audit claims. A release
  // packed before a claim changed keeps serving the old one, and the
  // hashes below all still match, so nothing else here would notice.
  const pinned = manifest.source.commit === entry.source.commit
  findings.push({
    path: manifestPath,
    ok: pinned,
    message: pinned
      ? 'manifest holds the pinned commit'
      : `manifest holds ${manifest.source.commit} but the config pins ` +
        `${entry.source.commit}, so this release needs packing again`,
  })

  const claimed =
    sha256Canonical(manifest.audit) === sha256Canonical(entry.audit) &&
    manifest.releasedAt === entry.releasedAt
  findings.push({
    path: manifestPath,
    ok: claimed,
    message: claimed
      ? 'manifest holds the audit claim of the config'
      : 'audit claim differs from the config',
  })

  const bundlePath = join(
    releaseDir,
    manifest.build.kind === 'solc-standard-json'
      ? manifest.build.standardJson.path
      : 'verification-source-codes.json',
  )
  if (manifest.build.kind === 'solc-standard-json') {
    if (!existsSync(bundlePath)) {
      findings.push({
        path: bundlePath,
        ok: false,
        message: 'missing verification bundle',
      })
    } else {
      const match =
        sha256Canonical(loadJson(bundlePath)) ===
        manifest.build.standardJson.sha256
      findings.push({
        path: bundlePath,
        ok: match,
        message: match
          ? 'verification bundle matches the manifest hash'
          : 'verification bundle hash differs from the manifest',
      })
    }
  }

  for (const artifact of manifest.artifacts) {
    const abiPath = join(releaseDir, artifact.abi.path)
    if (!existsSync(abiPath)) {
      findings.push({ path: abiPath, ok: false, message: 'missing ABI' })
      continue
    }
    const match = sha256Canonical(loadJson(abiPath)) === artifact.abi.sha256
    findings.push({
      path: abiPath,
      ok: match,
      message: match ? 'ABI hash matches' : 'ABI hash differs',
    })
  }

  for (const surface of manifest.callSurfaces) {
    const path = join(releaseDir, surface.abi.path)
    if (!existsSync(path)) {
      findings.push({ path, ok: false, message: 'missing merged ABI' })
      continue
    }
    const match = sha256Canonical(loadJson(path)) === surface.abi.sha256
    findings.push({
      path,
      ok: match,
      message: match ? 'merged ABI hash matches' : 'merged ABI hash differs',
    })
  }

  return findings
}

function auditConsumerCopies(entry: ReleaseCatalogEntry): AuditFinding[] {
  if (entry.vendorCopies.length === 0) {
    return []
  }
  return diffGeneratedAbis(generateAbisForRelease(entry), entry.configRoot).map(
    diff => ({
      path: diff.path,
      ok: diff.status === 'match',
      message:
        diff.status === 'match'
          ? 'generated ABI matches the working tree'
          : `generated ABI ${diff.status}`,
    }),
  )
}

// The typed modules carry the ABI a second time, as a literal type. A
// consumer reads the names off that type and the bytes off the JSON, so a
// declaration left behind by a repack would typecheck against an ABI the
// contract no longer has.
function auditTypedAbis(entry: ReleaseCatalogEntry): AuditFinding[] {
  return diffGeneratedAbis(
    generateTypedAbisForRelease(entry),
    entry.configRoot,
  ).map(diff => ({
    path: diff.path,
    ok: diff.status === 'match',
    message:
      diff.status === 'match'
        ? 'typed ABI matches the shipped JSON'
        : `typed ABI ${diff.status}`,
  }))
}

export function auditRelease(
  releaseId: string,
  configRoot?: string,
): AuditReport {
  const root = configRoot ?? findConfigRoot()
  const entry = getRelease(releaseId, root)
  const findings = [
    ...auditPackedRelease(entry),
    ...auditConsumerCopies(entry),
    ...auditTypedAbis(entry),
  ]
  return {
    releaseId,
    ok: findings.every(f => f.ok),
    findings,
  }
}

export function auditAll(configRoot?: string): AuditReport[] {
  const root = configRoot ?? findConfigRoot()
  return listReleases(root).map(entry => auditRelease(entry.releaseId, root))
}
