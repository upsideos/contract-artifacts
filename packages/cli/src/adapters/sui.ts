/**
 * Sui adapter stub. The manifest envelope already accepts sui-move.
 * A later pass adds Move toolchain verification.
 */

import type {
  ChainFamilyAdapter,
  ReproduceArtifactResult,
  ReproduceInput,
  VerifyDeployedInput,
  VerifyDeployedResult,
} from './types'

export class SuiAdapter implements ChainFamilyAdapter {
  family = 'sui' as const

  async reproduce(_input: ReproduceInput): Promise<ReproduceArtifactResult[]> {
    throw new Error(
      'Sui adapter is not implemented. Use sui-move in a later release.',
    )
  }

  verifyDeployed(_input: VerifyDeployedInput): VerifyDeployedResult {
    throw new Error(
      'Sui adapter is not implemented. Use sui-move in a later release.',
    )
  }
}

export const suiAdapter = new SuiAdapter()
