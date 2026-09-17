/**
 * Resolve a release from `@upsideos/evm-rwa-artifacts` when it is installed.
 *
 * Node only. The core submit path never touches the filesystem, so a browser
 * or a bundled worker can pass the bundle in directly.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { VerificationBundle } from './standard_json'

export const RELEASES = ['v5', 'v5.1', 'recallable-payment'] as const

export type ReleaseKey = (typeof RELEASES)[number]

export interface ReleaseManifestArtifact {
  name: string
  fullyQualifiedName: string
}

export interface ReleaseManifest {
  releaseId: string
  artifacts: ReleaseManifestArtifact[]
}

export interface ReleaseContract {
  name: string
  fullyQualifiedName: string
  abi: unknown[]
}

const ARTIFACTS_PACKAGE = '@upsideos/evm-rwa-artifacts'

export interface ReleaseSource {
  /**
   * Directory holding the release directories. Set it when the releases are
   * copied somewhere the package resolver cannot see, such as next to a
   * Lambda handler. `EVM_RWA_ARTIFACTS_DIR` does the same.
   */
  releasesDir?: string
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function resolveFile(
  release: ReleaseKey,
  file: string,
  source: ReleaseSource = {},
): string {
  const dir = source.releasesDir ?? process.env.EVM_RWA_ARTIFACTS_DIR
  if (dir !== undefined && dir !== '') {
    return join(dir, release, file)
  }
  try {
    return require.resolve(`${ARTIFACTS_PACKAGE}/${release}/${file}`)
  } catch {
    throw new Error(
      `Cannot resolve ${ARTIFACTS_PACKAGE}/${release}/${file}. Install ${ARTIFACTS_PACKAGE}, set releasesDir, or pass the file explicitly.`,
    )
  }
}

export function loadReleaseBundle(
  release: ReleaseKey,
  source?: ReleaseSource,
): VerificationBundle {
  return readJson<VerificationBundle>(
    resolveFile(release, 'verification-source-codes.json', source),
  )
}

export function loadReleaseManifest(
  release: ReleaseKey,
  source?: ReleaseSource,
): ReleaseManifest {
  return readJson<ReleaseManifest>(
    resolveFile(release, 'manifest.json', source),
  )
}

/**
 * Explorers want the fully qualified name, which only the manifest records.
 */
export function loadReleaseContract(
  release: ReleaseKey,
  contractName: string,
  source?: ReleaseSource,
): ReleaseContract {
  const manifest = loadReleaseManifest(release, source)
  const entry = manifest.artifacts.find(
    artifact =>
      artifact.name === contractName ||
      artifact.fullyQualifiedName === contractName,
  )
  if (entry === undefined) {
    throw new Error(
      `Contract ${contractName} is not in release ${release}. Known: ${manifest.artifacts
        .map(artifact => artifact.name)
        .join(', ')}`,
    )
  }

  const artifact = readJson<{ abi: unknown[] }>(
    resolveFile(release, `artifacts/${entry.name}.json`, source),
  )
  return {
    name: entry.name,
    fullyQualifiedName: entry.fullyQualifiedName,
    abi: artifact.abi,
  }
}
