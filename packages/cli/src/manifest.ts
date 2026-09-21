/**
 * Canonical JSON hashing and the chain-agnostic release manifest.
 *
 * Publisher, CI audit, and the client verifier must use this module so
 * they cannot disagree on a hash.
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  canonicalize,
  hexToUint8Array,
  maskImmutableRanges,
  normalizeHex,
  stripHexPrefix,
} from './canonical'

export {
  canonicalize,
  hexToUint8Array,
  maskImmutableRanges,
  normalizeHex,
  stripHexPrefix,
}

export const SCHEMA_VERSION = '1.0'

export function sha256Bytes(data: Uint8Array | Buffer | string): Buffer {
  return createHash('sha256').update(data).digest()
}

export function sha256Hex(data: Uint8Array | Buffer | string): string {
  return sha256Bytes(data).toString('hex')
}

export function sha256Canonical(value: unknown): string {
  return sha256Hex(canonicalize(value))
}

export function hexToBytes(hex: string): Buffer {
  return Buffer.from(hexToUint8Array(hex))
}

export function sha256HexBytes(hex: string): string {
  return sha256Hex(hexToBytes(hex))
}

const immutableRef = z.object({
  start: z.number().int().nonnegative(),
  length: z.number().int().positive(),
})

export const fileRef = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  entryCount: z.number().int().nonnegative().optional(),
})

export const codeRef = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  length: z.number().int().nonnegative(),
  immutableReferences: z.record(z.string(), z.array(immutableRef)).optional(),
})

export const artifactRecord = z.object({
  name: z.string().min(1),
  fullyQualifiedName: z.string().min(1),
  abi: fileRef,
  creationCode: codeRef,
  runtimeCode: codeRef,
  metadataHash: z.string().optional(),
  reproduced: z.boolean(),
})

export const callSurface = z.object({
  name: z.string().min(1),
  abi: fileRef,
  mergedFrom: z.array(z.string().min(1)).min(1),
})

export const evmBuild = z.object({
  kind: z.literal('solc-standard-json'),
  compilerLongVersion: z.string().min(1),
  standardJson: fileRef,
})

export const solanaBuild = z.object({
  kind: z.literal('solana-verifiable-build'),
  dockerImage: z.string().min(1),
  anchorVersion: z.string().min(1),
  rustVersion: z.string().min(1),
})

export const suiBuild = z.object({
  kind: z.literal('sui-move'),
  toolchain: z.string().min(1),
})

export const buildDescriptor = z.discriminatedUnion('kind', [
  evmBuild,
  solanaBuild,
  suiBuild,
])

export const manifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  releaseId: z.string().min(1),
  chainFamily: z.enum(['evm', 'solana', 'sui']),
  releasedAt: z.string().optional(),
  audit: z.object({
    status: z.enum(['audited', 'unaudited']),
    auditor: z.string().optional(),
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
    reportSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    completedAt: z.string().optional(),
  }),
  source: z.object({
    repository: z.string().url().optional(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    treeSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  }),
  build: buildDescriptor,
  artifacts: z.array(artifactRecord).min(1),
  callSurfaces: z.array(callSurface).default([]),
})

export type Manifest = z.infer<typeof manifestSchema>
export type ArtifactRecord = z.infer<typeof artifactRecord>
export type CallSurface = z.infer<typeof callSurface>
export type ImmutableRef = z.infer<typeof immutableRef>

export function parseManifest(value: unknown): Manifest {
  return manifestSchema.parse(value)
}

export function manifestBytes(manifest: Manifest): Buffer {
  return Buffer.from(canonicalize(manifest), 'utf8')
}

export function manifestDigest(manifest: Manifest): Buffer {
  return sha256Bytes(manifestBytes(manifest))
}

export function sha256MaskedRuntime(
  runtimeHex: string,
  refs: Record<string, Array<{ start: number; length: number }>> | undefined,
): string {
  return sha256Hex(Buffer.from(maskImmutableRanges(runtimeHex, refs), 'hex'))
}

/**
 * Read the Solidity metadata hash from the CBOR suffix of runtime code.
 */
export function extractMetadataHash(runtimeHex: string): string | undefined {
  const body = normalizeHex(runtimeHex)
  if (body.length < 4) {
    return undefined
  }
  if (body.slice(-4) !== '0033') {
    return undefined
  }
  const cborLen = parseInt(body.slice(-8, -4), 16)
  if (!Number.isFinite(cborLen) || cborLen <= 0) {
    return undefined
  }
  const cborHex = body.slice(-(8 + cborLen * 2), -8)
  const ipfsMarker = 'a264697066735822'
  const idx = cborHex.indexOf(ipfsMarker)
  if (idx >= 0) {
    return (
      '0x' +
      cborHex.slice(idx + ipfsMarker.length, idx + ipfsMarker.length + 68)
    )
  }
  return '0x' + cborHex
}
