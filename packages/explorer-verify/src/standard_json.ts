/**
 * The solc standard-JSON input that explorers accept.
 *
 * Packed releases already exclude test and mock sources, so the filter is a
 * no-op for them. It stays here because a bundle taken straight from a
 * Hardhat build-info file still carries them, and explorers reject inputs
 * that compile contracts the deployment does not contain.
 */

export interface StandardJsonInput {
  sources?: Record<string, unknown>
  [key: string]: unknown
}

export interface VerificationBundle {
  input: StandardJsonInput | string
  solcLongVersion: string
}

export interface ParsedVerificationBundle {
  sourceCode: StandardJsonInput
  compilerVersion: string
}

export function keepVerificationSource(key: string): boolean {
  return (
    (key.startsWith('@openzeppelin/') ||
      key.startsWith('@solidity-bits/') ||
      key.startsWith('contracts/')) &&
    !key.startsWith('contracts/mocks/')
  )
}

export function filterVerificationInput(
  input: StandardJsonInput,
): StandardJsonInput {
  if (input.sources === undefined) {
    return input
  }
  const sources: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input.sources)) {
    if (keepVerificationSource(key)) {
      sources[key] = value
    }
  }
  return { ...input, sources }
}

export function parseVerificationBundle(
  bundle: VerificationBundle,
): ParsedVerificationBundle {
  if (bundle.input === undefined || bundle.solcLongVersion === undefined) {
    throw new Error(
      'Invalid verification bundle: missing input or solcLongVersion',
    )
  }
  const input =
    typeof bundle.input === 'string'
      ? (JSON.parse(bundle.input) as StandardJsonInput)
      : bundle.input

  return {
    sourceCode: filterVerificationInput(input),
    compilerVersion: bundle.solcLongVersion,
  }
}
