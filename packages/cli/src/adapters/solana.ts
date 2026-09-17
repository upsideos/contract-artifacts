/**
 * Solana adapter stub. The manifest envelope already accepts
 * solana-verifiable-build. A later pass adds docker-based
 * verifiable builds.
 */

import type {
  ChainFamilyAdapter,
  ReproduceArtifactResult,
  ReproduceInput,
  VerifyDeployedInput,
  VerifyDeployedResult,
} from './types'

export class SolanaAdapter implements ChainFamilyAdapter {
  family = 'solana' as const

  async reproduce(_input: ReproduceInput): Promise<ReproduceArtifactResult[]> {
    throw new Error(
      'Solana adapter is not implemented. Use solana-verifiable-build in a later release.',
    )
  }

  verifyDeployed(_input: VerifyDeployedInput): VerifyDeployedResult {
    throw new Error(
      'Solana adapter is not implemented. Use solana-verifiable-build in a later release.',
    )
  }
}

export const solanaAdapter = new SolanaAdapter()
