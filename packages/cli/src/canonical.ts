/**
 * Canonical JSON and hex helpers with no Node imports.
 * The browser verifier and the Node publisher share this file.
 */

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    )
    const out: Record<string, unknown> = {}
    for (const [key, child] of entries) {
      out[key] = sortValue(child)
    }
    return out
  }
  return value
}

export function stripHexPrefix(hex: string): string {
  const trimmed = hex.trim()
  return trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? trimmed.slice(2)
    : trimmed
}

export function normalizeHex(hex: string): string {
  return stripHexPrefix(hex).toLowerCase()
}

export function hexToUint8Array(hex: string): Uint8Array {
  const body = normalizeHex(hex)
  if (body.length % 2 !== 0) {
    throw new Error('Hex string must have an even length')
  }
  const out = new Uint8Array(body.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function maskImmutableRanges(
  runtimeHex: string,
  refs: Record<string, Array<{ start: number; length: number }>> | undefined,
): string {
  const bytes = hexToUint8Array(runtimeHex)
  if (refs === undefined) {
    return uint8ToHex(bytes)
  }
  for (const ranges of Object.values(refs)) {
    for (const range of ranges) {
      const end = range.start + range.length
      if (end > bytes.length) {
        throw new Error(
          `Immutable range ${range.start}+${range.length} exceeds bytecode length ${bytes.length}`,
        )
      }
      bytes.fill(0, range.start, end)
    }
  }
  return uint8ToHex(bytes)
}
