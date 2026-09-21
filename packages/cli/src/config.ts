/**
 * Load contract-artifacts.config.json. Each contract repo and each
 * artifacts package holds one of these files.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'

export const vendorAbiCopySchema = z.object({
  source: z.string().min(1),
  vendorFile: z.string().nullable(),
  docsFile: z.string().min(1),
  merged: z.boolean(),
})

export const releaseConfigSchema = z.object({
  chainFamily: z.enum(['evm', 'solana', 'sui']),
  tokenType: z.string().min(1).optional(),
  artifactsDir: z.string().min(1).optional(),
  releaseDir: z.string().min(1).optional(),
  docsDir: z.string().min(1).optional(),
  vendorDir: z.string().min(1).optional(),
  packageName: z.string().min(1).optional(),
  packageRelease: z.string().min(1).optional(),
  // The day this release went out, which is not the day the audit ended.
  releasedAt: z.string().optional(),
  source: z.object({
    repository: z.string().url().optional(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
  }),
  audit: z.object({
    status: z.enum(['audited', 'unaudited']),
    auditor: z.string().optional(),
    // The commit the report reviewed. Findings get fixed after a review,
    // so this sits behind source.commit rather than on it.
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
    // The report that backs the claim, so a reader can check the claim
    // against the file instead of taking the word of this config.
    reportSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    completedAt: z.string().optional(),
  }),
  artifacts: z.array(z.string().min(1)).min(1),
  callSurfaces: z
    .array(
      z.object({
        name: z.string().min(1),
        mergedFrom: z.array(z.string().min(1)).min(1),
      }),
    )
    .default([]),
  vendorCopies: z.array(vendorAbiCopySchema).default([]),
})

export const artifactsConfigSchema = z.object({
  schemaVersion: z.literal('1.0'),
  defaultRelease: z.string().min(1).optional(),
  releases: z.record(z.string(), releaseConfigSchema),
})

export type VendorAbiCopy = z.infer<typeof vendorAbiCopySchema>
export type ReleaseConfig = z.infer<typeof releaseConfigSchema>
export type ArtifactsConfig = z.infer<typeof artifactsConfigSchema>

export interface ReleaseCatalogEntry extends ReleaseConfig {
  releaseId: string
  configRoot: string
}

const CONFIG_NAME = 'contract-artifacts.config.json'

export function findConfigRoot(start = process.cwd()): string {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, CONFIG_NAME))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        `Cannot find ${CONFIG_NAME} above ${start}. Pass --config-root.`,
      )
    }
    dir = parent
  }
}

export function loadConfig(configRoot: string): ArtifactsConfig {
  const path = join(configRoot, CONFIG_NAME)
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}`)
  }
  return artifactsConfigSchema.parse(
    JSON.parse(readFileSync(path, 'utf8')) as unknown,
  )
}

export function getRelease(
  releaseId: string,
  configRoot?: string,
): ReleaseCatalogEntry {
  const root = configRoot ?? findConfigRoot()
  const config = loadConfig(root)
  const entry = config.releases[releaseId]
  if (entry === undefined) {
    throw new Error(
      `Unknown release '${releaseId}'. Known: ${Object.keys(config.releases).join(', ')}`,
    )
  }
  return { ...entry, releaseId, configRoot: root }
}

export function listReleases(configRoot?: string): ReleaseCatalogEntry[] {
  const root = configRoot ?? findConfigRoot()
  const config = loadConfig(root)
  return Object.entries(config.releases).map(([releaseId, entry]) => ({
    ...entry,
    releaseId,
    configRoot: root,
  }))
}

export function defaultReleaseId(configRoot?: string): string {
  const root = configRoot ?? findConfigRoot()
  const config = loadConfig(root)
  if (config.defaultRelease !== undefined) {
    return config.defaultRelease
  }
  const ids = Object.keys(config.releases)
  if (ids.length === 0) {
    throw new Error('No releases in contract-artifacts.config.json')
  }
  return ids[0]
}
