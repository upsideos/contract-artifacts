/**
 * Write docs and vendor ABI trees from a packed or flat release.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mergeAbis, type AbiEntry } from './abi_merge'
import { loadReleaseArtifacts } from './artifacts'
import { findConfigRoot, getRelease, type ReleaseCatalogEntry } from './config'

export interface GeneratedFile {
  path: string
  contents: string
}

function prettyAbi(abi: unknown): string {
  return `${JSON.stringify(abi, null, 2)}\n`
}

export function generateAbisForRelease(
  entry: ReleaseCatalogEntry,
): GeneratedFile[] {
  const artifacts = loadReleaseArtifacts(entry)
  const byName = new Map(artifacts.map(a => [a.name, a]))
  const mergedByName = new Map<string, AbiEntry[]>()
  for (const surface of entry.callSurfaces) {
    const parts = surface.mergedFrom.map(name => {
      const artifact = byName.get(name)
      if (artifact === undefined) {
        throw new Error(`call surface ${surface.name} missing ${name}`)
      }
      return artifact.abi as AbiEntry[]
    })
    mergedByName.set(surface.name, mergeAbis(parts))
  }

  const files: GeneratedFile[] = []
  const vendorDir = entry.vendorDir ?? 'vendor/abi/coin_types'
  for (const copy of entry.vendorCopies) {
    const abi = copy.merged
      ? mergedByName.get(copy.source)
      : (byName.get(copy.source)?.abi as AbiEntry[] | undefined)
    if (abi === undefined) {
      throw new Error(`No ABI for ${copy.source}`)
    }
    const body = prettyAbi(abi)
    if (entry.docsDir !== undefined) {
      files.push({ path: join(entry.docsDir, copy.docsFile), contents: body })
    }
    if (copy.vendorFile !== null) {
      files.push({
        path: join(vendorDir, copy.vendorFile),
        contents: body,
      })
    }
  }
  return files
}

export function writeGeneratedAbis(
  files: GeneratedFile[],
  configRoot: string,
): void {
  for (const file of files) {
    const dest = join(configRoot, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, file.contents, 'utf8')
  }
}

export function diffGeneratedAbis(
  files: GeneratedFile[],
  configRoot: string,
): Array<{ path: string; status: 'match' | 'differ' | 'missing' }> {
  return files.map(file => {
    const dest = join(configRoot, file.path)
    try {
      const current = readFileSync(dest, 'utf8')
      return {
        path: file.path,
        status: current === file.contents ? 'match' : 'differ',
      }
    } catch {
      return { path: file.path, status: 'missing' }
    }
  })
}

export function generateAbis(
  releaseId: string,
  configRoot?: string,
): GeneratedFile[] {
  const root = configRoot ?? findConfigRoot()
  return generateAbisForRelease(getRelease(releaseId, root))
}
