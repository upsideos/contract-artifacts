export interface ContractArtifact {
  abi: unknown[]
  bytecode: string
  deployedBytecode?: string | null
  immutableReferences?: Record<string, Array<{ start: number; length: number }>>
}
export const AccessControl: ContractArtifact
export const RecallablePayment: ContractArtifact
export const artifacts: Record<string, ContractArtifact>
declare const _default: Record<string, ContractArtifact>
export default _default
