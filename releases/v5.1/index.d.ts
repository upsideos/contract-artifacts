export interface ContractArtifact {
  abi: unknown[]
  bytecode: string
  deployedBytecode?: string | null
  immutableReferences?: Record<string, Array<{ start: number; length: number }>>
}
export const AccessControl: ContractArtifact
export const ERC2771CustomForwarder: ContractArtifact
export const IdentityRegistry: ContractArtifact
export const InterestPayment: ContractArtifact
export const PurchaseContract: ContractArtifact
export const RestrictedLockupToken: ContractArtifact
export const RestrictedLockupTokenExtension: ContractArtifact
export const RestrictedLockupTokenManagementExtension: ContractArtifact
export const RestrictedLockupTokenStandardsExtension: ContractArtifact
export const RestrictedSwap: ContractArtifact
export const SnapshotPeriods: ContractArtifact
export const TransferRules: ContractArtifact
export const artifacts: Record<string, ContractArtifact>
declare const _default: Record<string, ContractArtifact>
export default _default
