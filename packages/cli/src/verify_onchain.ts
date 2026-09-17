/**
 * Client-side on-chain check. This file has no Node imports so a
 * browser can load it. It hashes the masked runtime bytecode and
 * compares it to the published manifest.
 */

import { hexToUint8Array, maskImmutableRanges, uint8ToHex } from './canonical'
import type { Manifest } from './manifest'

export interface OnchainCheckInput {
  runtimeHex: string
  expected: Manifest['artifacts'][number]
}

export interface OnchainCheckResult {
  name: string
  match: boolean
  expectedSha256: string
  actualSha256: string
  message: string
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return uint8ToHex(new Uint8Array(digest))
}

export async function hashMaskedRuntime(
  runtimeHex: string,
  refs: Manifest['artifacts'][number]['runtimeCode']['immutableReferences'],
): Promise<string> {
  const masked = maskImmutableRanges(runtimeHex, refs)
  return sha256Hex(hexToUint8Array(masked))
}

export async function verifyDeployedBytecode(
  input: OnchainCheckInput,
): Promise<OnchainCheckResult> {
  const actual = await hashMaskedRuntime(
    input.runtimeHex,
    input.expected.runtimeCode.immutableReferences,
  )
  const expected = input.expected.runtimeCode.sha256
  const match = actual === expected
  return {
    name: input.expected.name,
    match,
    expectedSha256: expected,
    actualSha256: actual,
    message: match
      ? 'on-chain runtime matches the audited release'
      : 'on-chain runtime does not match the audited release',
  }
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`)
  }
  return response.json() as Promise<unknown>
}

export async function ethGetCode(
  rpcUrl: string,
  address: string,
): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getCode',
      params: [address, 'latest'],
    }),
  })
  if (!response.ok) {
    throw new Error(`RPC ${rpcUrl} failed: ${response.status}`)
  }
  const body = (await response.json()) as {
    result?: string
    error?: { message?: string }
  }
  if (body.error?.message !== undefined) {
    throw new Error(body.error.message)
  }
  if (typeof body.result !== 'string') {
    throw new Error('eth_getCode returned no result')
  }
  return body.result
}

export function releaseBaseUrl(registryUrl: string, releaseId: string): string {
  return `${registryUrl.replace(/\/$/, '')}/v1/releases/${releaseId}`
}

export async function loadPublishedManifest(
  registryUrl: string,
  releaseId: string,
): Promise<Manifest> {
  const url = `${releaseBaseUrl(registryUrl, releaseId)}/manifest.json`
  return (await fetchJson(url)) as Manifest
}

export async function verifyOnchain(options: {
  rpcUrl: string
  address: string
  contractName: string
  manifest: Manifest
}): Promise<OnchainCheckResult> {
  const expected = options.manifest.artifacts.find(
    a => a.name === options.contractName,
  )
  if (expected === undefined) {
    throw new Error(
      `Contract ${options.contractName} is not in release ${options.manifest.releaseId}`,
    )
  }
  const runtime = await ethGetCode(options.rpcUrl, options.address)
  return verifyDeployedBytecode({ runtimeHex: runtime, expected })
}

export async function verifyOnchainFromUrl(options: {
  registryUrl: string
  releaseId: string
  rpcUrl: string
  address: string
  contractName: string
}): Promise<OnchainCheckResult> {
  const manifest = await loadPublishedManifest(
    options.registryUrl,
    options.releaseId,
  )
  return verifyOnchain({
    rpcUrl: options.rpcUrl,
    address: options.address,
    contractName: options.contractName,
    manifest,
  })
}
