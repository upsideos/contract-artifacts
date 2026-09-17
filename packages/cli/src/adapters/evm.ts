/**
 * EVM adapter: recompile a solc standard-json input and compare the
 * result with the checked-in artifacts.
 */

import {
  extractMetadataHash,
  normalizeHex,
  sha256HexBytes,
  sha256MaskedRuntime,
} from '../manifest'
import type {
  ArtifactInput,
  ChainFamilyAdapter,
  ReproduceArtifactResult,
  ReproduceInput,
  VerifyDeployedInput,
  VerifyDeployedResult,
} from './types'

interface SolcContract {
  abi?: unknown[]
  evm?: {
    bytecode?: { object?: string }
    deployedBytecode?: {
      object?: string
      immutableReferences?: Record<
        string,
        Array<{ start: number; length: number }>
      >
    }
  }
  metadata?: string
}

interface SolcOutput {
  errors?: Array<{ severity?: string; formattedMessage?: string }>
  contracts?: Record<string, Record<string, SolcContract>>
}

export interface SolcLike {
  compile: (input: string) => string
  version?: () => string
}

let cachedSolc: SolcLike | undefined

export async function loadSolc(): Promise<SolcLike> {
  if (cachedSolc !== undefined) {
    return cachedSolc
  }
  const mod = (await import('solc')) as { default?: SolcLike } & SolcLike
  cachedSolc = mod.default ?? mod
  return cachedSolc
}

export function setSolcForTests(solc: SolcLike | undefined): void {
  cachedSolc = solc
}

function compiledIndex(
  output: SolcOutput,
): Map<string, { source: string; contract: SolcContract }> {
  const index = new Map<string, { source: string; contract: SolcContract }>()
  for (const [source, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [name, contract] of Object.entries(contracts)) {
      index.set(name, { source, contract })
      index.set(`${source}:${name}`, { source, contract })
    }
  }
  return index
}

function toHex(object: string | undefined): string {
  if (object === undefined || object === '') {
    return '0x'
  }
  return object.startsWith('0x') ? object : `0x${object}`
}

export function compareArtifact(
  artifact: ArtifactInput,
  compiled: SolcContract | undefined,
): ReproduceArtifactResult {
  const creation = toHex(compiled?.evm?.bytecode?.object)
  const runtime = toHex(compiled?.evm?.deployedBytecode?.object)
  const refs = compiled?.evm?.deployedBytecode?.immutableReferences ?? {}
  const expectedCreation = toHex(artifact.bytecode)
  const expectedRuntime = artifact.deployedBytecode
    ? toHex(artifact.deployedBytecode)
    : undefined

  let reproduced = normalizeHex(creation) === normalizeHex(expectedCreation)
  let message: string | undefined
  if (!reproduced) {
    message = `creation bytecode mismatch (expected ${expectedCreation.length} hex chars, got ${creation.length})`
  } else if (
    expectedRuntime !== undefined &&
    normalizeHex(runtime) !== normalizeHex(expectedRuntime)
  ) {
    reproduced = false
    message = `runtime bytecode mismatch (expected ${expectedRuntime.length} hex chars, got ${runtime.length})`
  }

  return {
    name: artifact.name,
    fullyQualifiedName: artifact.fullyQualifiedName,
    abi: compiled?.abi ?? artifact.abi,
    creationCode: creation,
    runtimeCode: runtime,
    immutableReferences: refs,
    metadataHash: extractMetadataHash(runtime),
    reproduced,
    message,
  }
}

export class EvmAdapter implements ChainFamilyAdapter {
  family = 'evm' as const

  async reproduce(input: ReproduceInput): Promise<ReproduceArtifactResult[]> {
    const solc = await loadSolc()
    const raw = solc.compile(JSON.stringify(input.standardJson))
    const output = JSON.parse(raw) as SolcOutput
    const errors = (output.errors ?? []).filter(e => e.severity === 'error')
    if (errors.length > 0) {
      throw new Error(
        `solc failed: ${errors
          .slice(0, 3)
          .map(e => e.formattedMessage ?? 'unknown error')
          .join('\n')}`,
      )
    }
    const index = compiledIndex(output)
    return input.artifacts.map(artifact => {
      const hit =
        index.get(artifact.fullyQualifiedName) ?? index.get(artifact.name)
      if (hit === undefined) {
        return {
          name: artifact.name,
          fullyQualifiedName: artifact.fullyQualifiedName,
          abi: artifact.abi,
          creationCode: '0x',
          runtimeCode: '0x',
          immutableReferences: {},
          reproduced: false,
          message: `contract ${artifact.fullyQualifiedName} is not in the compiler output`,
        }
      }
      return compareArtifact(artifact, hit.contract)
    })
  }

  verifyDeployed(input: VerifyDeployedInput): VerifyDeployedResult {
    const actual = sha256MaskedRuntime(
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
        ? 'runtime bytecode matches the audited release'
        : 'runtime bytecode does not match the audited release',
    }
  }
}

export const evmAdapter = new EvmAdapter()

export function creationCodeSha256(hex: string): string {
  return sha256HexBytes(hex)
}
