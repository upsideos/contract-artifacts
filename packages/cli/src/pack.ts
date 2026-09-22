/**
 * Write a packed release directory from verified artifacts.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeAbis, type AbiEntry } from './abi_merge'
import type { LoadedArtifact } from './artifacts'
import { canonicalize } from './canonical'
import { writeTypedAbiModules } from './typed_abis'
import type { VerifyReport } from './verify'

export function writeReleaseFiles(
  outDir: string,
  report: VerifyReport,
  artifacts: LoadedArtifact[],
  bundle: Record<string, unknown>,
): void {
  mkdirSync(join(outDir, 'abi', 'merged'), { recursive: true })
  mkdirSync(join(outDir, 'artifacts'), { recursive: true })
  writeFileSync(
    join(outDir, 'manifest.json'),
    canonicalize(report.manifest),
    'utf8',
  )
  writeFileSync(
    join(outDir, 'verification-source-codes.json'),
    canonicalize(bundle),
    'utf8',
  )
  const byName = new Map(artifacts.map(a => [a.name, a]))
  for (const artifact of artifacts) {
    writeFileSync(
      join(outDir, 'abi', `${artifact.name}.json`),
      canonicalize(artifact.abi),
      'utf8',
    )
    writeFileSync(
      join(outDir, 'artifacts', `${artifact.name}.json`),
      canonicalize({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        deployedBytecode: artifact.deployedBytecode ?? null,
        immutableReferences: artifact.immutableReferences ?? {},
      }),
      'utf8',
    )
  }
  for (const surface of report.manifest.callSurfaces) {
    const parts = surface.mergedFrom.map(name => {
      const artifact = byName.get(name)
      if (artifact === undefined) {
        throw new Error(`missing ${name}`)
      }
      return artifact.abi as AbiEntry[]
    })
    writeFileSync(
      join(outDir, surface.abi.path),
      canonicalize(mergeAbis(parts)),
      'utf8',
    )
  }

  // The typed modules read the files above, so they go out with them. A
  // release that shipped one without the other would let a consumer
  // typecheck against an ABI the contract does not have.
  writeTypedAbiModules(outDir)
}

export function writeReleaseIndex(outDir: string, names: string[]): void {
  const requires = names
    .map(name => `  ${name}: require('./artifacts/${name}.json'),`)
    .join('\n')
  writeFileSync(
    join(outDir, 'index.js'),
    `'use strict'
const artifacts = {
${requires}
}
module.exports = Object.assign({ artifacts: artifacts }, artifacts)
module.exports.default = artifacts
`,
    'utf8',
  )
  const typeFields = names
    .map(name => `export const ${name}: ContractArtifact`)
    .join('\n')
  writeFileSync(
    join(outDir, 'index.d.ts'),
    `export interface ContractArtifact {
  abi: unknown[]
  bytecode: string
  deployedBytecode?: string | null
  immutableReferences?: Record<string, Array<{ start: number; length: number }>>
}
${typeFields}
export const artifacts: Record<string, ContractArtifact>
declare const _default: Record<string, ContractArtifact>
export default _default
`,
    'utf8',
  )
}
