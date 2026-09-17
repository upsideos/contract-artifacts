/**
 * Read contract artifacts from a packed release dir or a flat
 * artifacts directory (Hardhat export / public/contracts layout).
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { ArtifactInput } from './adapters/types'
import type { ReleaseCatalogEntry } from './config'

export interface LoadedArtifact extends ArtifactInput {
  path: string
  raw: Record<string, unknown>
}

const VERIFICATION_NAMES = [
  'verification-source-codes.json',
  'verification_source_codes.json',
]

export function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

export function loadArtifactFile(path: string, name: string): LoadedArtifact {
  const raw = loadJson(path) as Record<string, unknown>
  if (!Array.isArray(raw.abi) || typeof raw.bytecode !== 'string') {
    throw new Error(`${path} is not a {abi, bytecode} artifact`)
  }
  const deployed =
    typeof raw.deployedBytecode === 'string' ? raw.deployedBytecode : undefined
  const refs =
    raw.immutableReferences !== undefined &&
    raw.immutableReferences !== null &&
    typeof raw.immutableReferences === 'object'
      ? (raw.immutableReferences as ArtifactInput['immutableReferences'])
      : undefined
  return {
    name,
    fullyQualifiedName: `contracts/${name}.sol:${name}`,
    abi: raw.abi,
    bytecode: raw.bytecode,
    deployedBytecode: deployed,
    immutableReferences: refs,
    path,
    raw,
  }
}

function resolveMaybeAbsolute(root: string, path: string): string {
  return path.startsWith('/') ? path : join(root, path)
}

export function resolveReleaseDir(
  entry: ReleaseCatalogEntry,
): string | undefined {
  if (entry.releaseDir !== undefined) {
    return resolveMaybeAbsolute(entry.configRoot, entry.releaseDir)
  }
  if (entry.packageName !== undefined && entry.packageRelease !== undefined) {
    return resolvePackageReleaseDir(
      entry.packageName,
      entry.packageRelease,
      entry.configRoot,
    )
  }
  return undefined
}

export function resolvePackageReleaseDir(
  packageName: string,
  packageRelease: string,
  fromDir: string,
): string {
  const requireFrom = createRequire(join(fromDir, 'package.json'))
  const pkgJson = requireFrom.resolve(`${packageName}/package.json`)
  return join(dirname(pkgJson), 'releases', packageRelease)
}

export function resolveArtifactsDir(entry: ReleaseCatalogEntry): string {
  const packed = resolveReleaseDir(entry)
  if (packed !== undefined) {
    const nested = join(packed, 'artifacts')
    if (existsSync(nested)) {
      return nested
    }
    return packed
  }
  if (entry.artifactsDir !== undefined) {
    return resolveMaybeAbsolute(entry.configRoot, entry.artifactsDir)
  }
  throw new Error(
    `Release ${entry.releaseId} has no releaseDir, artifactsDir, or packageRelease`,
  )
}

export function loadReleaseArtifacts(
  entry: ReleaseCatalogEntry,
): LoadedArtifact[] {
  const dir = resolveArtifactsDir(entry)
  return entry.artifacts.map(name => {
    const path = join(dir, `${name}.json`)
    if (!existsSync(path)) {
      throw new Error(`Missing artifact ${path}`)
    }
    return loadArtifactFile(path, name)
  })
}

export function findVerificationBundlePath(dir: string): string {
  for (const name of VERIFICATION_NAMES) {
    const path = join(dir, name)
    if (existsSync(path)) {
      return path
    }
  }
  throw new Error(
    `Missing verification bundle in ${dir} (looked for ${VERIFICATION_NAMES.join(', ')})`,
  )
}

export function loadVerificationBundle(
  entry: ReleaseCatalogEntry,
): Record<string, unknown> {
  const packed = resolveReleaseDir(entry)
  const dir =
    packed !== undefined
      ? packed
      : entry.artifactsDir !== undefined
        ? resolveMaybeAbsolute(entry.configRoot, entry.artifactsDir)
        : undefined
  if (dir === undefined) {
    throw new Error(`Release ${entry.releaseId} has no verification bundle dir`)
  }
  const path = findVerificationBundlePath(dir)
  const raw = loadJson(path) as Record<string, unknown>
  if (raw.input === undefined || raw.solcLongVersion === undefined) {
    throw new Error(
      `${path} must contain input and solcLongVersion (solc standard-json)`,
    )
  }
  return raw
}
