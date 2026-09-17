/**
 * Submit and poll an Etherscan-compatible verification.
 *
 * Verification is bound to a deployed address, so it cannot happen when a
 * release is published. These primitives let every consumer share one
 * implementation of the request shape and the result classification.
 */

import { encodeConstructorArguments, type AbiInput } from './constructor_args'
import { explorerApiUrl, type ChainId, type ExplorerApiUrls } from './explorers'
import {
  parseVerificationBundle,
  type VerificationBundle,
} from './standard_json'

export const DEFAULT_POLL_DELAY_SECONDS = 120
export const DEFAULT_MAX_ATTEMPTS = 15

export type FetchLike = (
  input: string,
  init?: { method?: string; body?: FormData },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export interface ExplorerApiResult {
  status?: string
  message?: string
  result?: string
}

export interface ExplorerEndpoint {
  /** Overrides the chain-id lookup entirely. */
  apiUrl?: string
  explorerApiUrls?: ExplorerApiUrls
  fetchImpl?: FetchLike
}

export interface SubmitVerificationParams extends ExplorerEndpoint {
  apiKey: string
  chainId: ChainId
  contractAddress: string
  /** Fully qualified, for example `contracts/AccessControl.sol:AccessControl`. */
  contractName: string
  bundle: VerificationBundle
  /** Needed only when `constructorArguments` is absent. */
  abi?: readonly unknown[]
  constructorArgs?: readonly unknown[]
  /** Hex without the 0x prefix. Skips encoding when given. */
  constructorArguments?: string
}

export interface CheckStatusParams extends ExplorerEndpoint {
  apiKey: string
  chainId: ChainId
  guid: string
}

function resolveUrl(params: ExplorerEndpoint, chainId: ChainId): string {
  return params.apiUrl ?? explorerApiUrl(chainId, params.explorerApiUrls)
}

function resolveFetch(params: ExplorerEndpoint): FetchLike {
  return params.fetchImpl ?? (fetch as unknown as FetchLike)
}

function resolveConstructorArguments(
  params: SubmitVerificationParams,
): string | undefined {
  if (params.constructorArguments !== undefined) {
    return params.constructorArguments
  }
  if (params.abi === undefined || params.constructorArgs === undefined) {
    return undefined
  }
  return encodeConstructorArguments(params.abi, params.constructorArgs)
}

export async function submitSourceVerification(
  params: SubmitVerificationParams,
): Promise<ExplorerApiResult> {
  const parsed = parseVerificationBundle(params.bundle)
  const chainId = String(params.chainId)

  const form = new FormData()
  form.set('apikey', params.apiKey)
  form.set('module', 'contract')
  form.set('action', 'verifysourcecode')
  form.set('chainId', chainId)
  form.set('contractaddress', params.contractAddress)
  form.set('sourceCode', JSON.stringify(parsed.sourceCode))
  form.set('codeformat', 'solidity-standard-json-input')
  form.set('contractname', params.contractName)
  form.set('compilerversion', `v${parsed.compilerVersion}`)

  const encoded = resolveConstructorArguments(params)
  if (encoded !== undefined) {
    form.set('constructorArguments', encoded)
  }

  const response = await resolveFetch(params)(resolveUrl(params, chainId), {
    method: 'POST',
    body: form,
  })
  const result = (await response.json()) as ExplorerApiResult
  if (!response.ok) {
    throw new Error(
      `Verification request failed: ${result.message ?? response.status}`,
    )
  }
  return result
}

export async function checkVerificationStatus(
  params: CheckStatusParams,
): Promise<ExplorerApiResult> {
  const chainId = String(params.chainId)
  const url = new URL(resolveUrl(params, chainId))
  url.searchParams.set('chainId', chainId)
  url.searchParams.set('module', 'contract')
  url.searchParams.set('action', 'checkverifystatus')
  url.searchParams.set('guid', params.guid)
  url.searchParams.set('apikey', params.apiKey)

  const response = await resolveFetch(params)(url.toString())
  return (await response.json()) as ExplorerApiResult
}

export function isAlreadyVerified(result: ExplorerApiResult): boolean {
  const text = `${result.result ?? ''} ${result.message ?? ''}`
  return text.toLowerCase().includes('already verified')
}

export function isVerificationPending(result: ExplorerApiResult): boolean {
  const text = `${result.result ?? ''} ${result.message ?? ''}`.toLowerCase()
  return (
    text.includes('pending') ||
    text.includes('in progress') ||
    text.includes('queued')
  )
}

export function isVerificationSuccess(result: ExplorerApiResult): boolean {
  if (isAlreadyVerified(result)) {
    return true
  }
  return (
    result.status === '1' &&
    typeof result.result === 'string' &&
    result.result.toLowerCase().includes('pass')
  )
}

export interface VerifyContractParams extends SubmitVerificationParams {
  pollDelaySeconds?: number
  maxAttempts?: number
  onStatus?: (result: ExplorerApiResult, attempt: number) => void
  sleep?: (ms: number) => Promise<void>
}

export interface VerifyContractResult {
  ok: boolean
  guid?: string
  message: string
}

const wait = async (ms: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Submit, then poll until the explorer settles. Suitable for a script or a
 * CI job. A queue worker should drive the primitives itself so that waiting
 * does not hold an execution open.
 */
export async function verifyContract(
  params: VerifyContractParams,
): Promise<VerifyContractResult> {
  const submitted = await submitSourceVerification(params)
  if (isAlreadyVerified(submitted) || isVerificationSuccess(submitted)) {
    return {
      ok: true,
      message: submitted.result ?? submitted.message ?? 'verified',
    }
  }

  const guid = submitted.result
  if (guid === undefined || guid === '') {
    return {
      ok: false,
      message: submitted.message ?? 'Explorer did not return a GUID',
    }
  }

  const delayMs = (params.pollDelaySeconds ?? DEFAULT_POLL_DELAY_SECONDS) * 1000
  const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const sleep = params.sleep ?? wait

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(delayMs)
    const status = await checkVerificationStatus({ ...params, guid })
    params.onStatus?.(status, attempt)

    if (isVerificationSuccess(status) || isAlreadyVerified(status)) {
      return { ok: true, guid, message: status.result ?? 'verified' }
    }
    if (!isVerificationPending(status)) {
      return {
        ok: false,
        guid,
        message: status.result ?? status.message ?? 'Verification failed',
      }
    }
  }

  return {
    ok: false,
    guid,
    message: `Still pending after ${maxAttempts} polls`,
  }
}

export type { AbiInput, ChainId, ExplorerApiUrls, VerificationBundle }
