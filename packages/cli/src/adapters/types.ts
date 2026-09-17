/**
 * Chain-family adapter interface. EVM is implemented now. Solana and
 * Sui keep the same envelope and add an adapter later.
 */

import type { Manifest } from '../manifest'

export interface ArtifactInput {
  name: string
  fullyQualifiedName: string
  abi: unknown[]
  bytecode: string
  deployedBytecode?: string
  immutableReferences?: Record<string, Array<{ start: number; length: number }>>
}

export interface ReproduceInput {
  standardJson: Record<string, unknown>
  compilerLongVersion: string
  artifacts: ArtifactInput[]
}

export interface ReproduceArtifactResult {
  name: string
  fullyQualifiedName: string
  abi: unknown[]
  creationCode: string
  runtimeCode: string
  immutableReferences: Record<string, Array<{ start: number; length: number }>>
  metadataHash?: string
  reproduced: boolean
  message?: string
}

export interface VerifyDeployedInput {
  runtimeHex: string
  expected: Manifest['artifacts'][number]
}

export interface VerifyDeployedResult {
  name: string
  match: boolean
  expectedSha256: string
  actualSha256: string
  message: string
}

export interface ChainFamilyAdapter {
  family: 'evm' | 'solana' | 'sui'
  reproduce(input: ReproduceInput): Promise<ReproduceArtifactResult[]>
  verifyDeployed(input: VerifyDeployedInput): VerifyDeployedResult
}
