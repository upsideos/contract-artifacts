/**
 * Merge per-contract ABIs into the call-surface ABI a client needs at
 * a deployed token address.
 *
 * Rules match process_security_token_artifacts.py:
 * - drop transfer/transferFrom whose amount input is named `value`
 * - drop exact (type, name, input types) duplicates, keep first
 * - put calculateUnlocked(..., uint256 scheduleId_) first
 * - keep constructor, fallback, and receive
 */

export interface AbiInput {
  name?: string
  type?: string
  components?: AbiInput[]
  [key: string]: unknown
}

export interface AbiEntry {
  type?: string
  name?: string
  inputs?: AbiInput[]
  [key: string]: unknown
}

function inputType(input: AbiInput): string {
  const type = input.type ?? ''
  if (type.startsWith('tuple') && input.components !== undefined) {
    const inner = input.components.map(inputType).join(',')
    return `(${inner})${type.slice('tuple'.length)}`
  }
  return type
}

export function abiSignature(entry: AbiEntry): string {
  const type = entry.type ?? ''
  if (type === 'constructor' || type === 'fallback' || type === 'receive') {
    const inputs = (entry.inputs ?? []).map(inputType).join(',')
    return `${type}(${inputs})`
  }
  const inputs = (entry.inputs ?? []).map(inputType).join(',')
  return `${type}:${entry.name ?? ''}(${inputs})`
}

function hasValueAmount(entry: AbiEntry): boolean {
  if (entry.type !== 'function') {
    return false
  }
  if (entry.name !== 'transfer' && entry.name !== 'transferFrom') {
    return false
  }
  return (entry.inputs ?? []).some(input => input.name === 'value')
}

export function removeDuplicateFunctions(abi: AbiEntry[]): AbiEntry[] {
  const cleaned: AbiEntry[] = []
  const seen = new Set<string>()

  for (const item of abi) {
    const type = item.type ?? ''
    if (type === 'function' || type === 'event' || type === 'error') {
      if (hasValueAmount(item)) {
        continue
      }
      const signature = abiSignature(item)
      if (seen.has(signature)) {
        continue
      }
      seen.add(signature)
      cleaned.push(item)
      continue
    }
    const exact = JSON.stringify(sortKeys(item))
    if (seen.has(exact)) {
      continue
    }
    seen.add(exact)
    cleaned.push(item)
  }
  return cleaned
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

export function reorderOverloadedFunctions(abi: AbiEntry[]): AbiEntry[] {
  const withScheduleId: AbiEntry[] = []
  const withStruct: AbiEntry[] = []
  const other: AbiEntry[] = []

  for (const item of abi) {
    if (item.type === 'function' && item.name === 'calculateUnlocked') {
      const inputs = item.inputs ?? []
      const last = inputs[inputs.length - 1]
      if (last?.name === 'scheduleId_' && last.type === 'uint256') {
        withScheduleId.push(item)
      } else {
        withStruct.push(item)
      }
    } else {
      other.push(item)
    }
  }
  return [...withScheduleId, ...withStruct, ...other]
}

export function mergeAbis(parts: AbiEntry[][]): AbiEntry[] {
  const concatenated: AbiEntry[] = []
  for (const part of parts) {
    concatenated.push(...part)
  }
  return reorderOverloadedFunctions(removeDuplicateFunctions(concatenated))
}
