/**
 * Constructor argument encoding.
 *
 * Explorers want the ABI-encoded arguments as hex without the 0x prefix.
 * `ethers` is an optional peer: install it, inject another coder with
 * `setAbiCoder`, or pass `constructorArguments` already encoded.
 */

export interface AbiInput {
  type: string
  components?: AbiInput[]
}

export interface AbiCoderLike {
  encode: (types: readonly string[], values: readonly unknown[]) => string
}

let injectedCoder: AbiCoderLike | undefined

export function setAbiCoder(coder: AbiCoderLike): void {
  injectedCoder = coder
}

function abiCoder(): AbiCoderLike {
  if (injectedCoder !== undefined) {
    return injectedCoder
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ethers = require('ethers') as {
      AbiCoder: { defaultAbiCoder: () => AbiCoderLike }
    }
    injectedCoder = ethers.AbiCoder.defaultAbiCoder()
    return injectedCoder
  } catch {
    throw new Error(
      'Encoding constructor arguments needs `ethers` installed. Install it, ' +
        'call setAbiCoder() with your own coder, or pass constructorArguments ' +
        'already encoded.',
    )
  }
}

/** Explorers want tuples spelled out, so `tuple` becomes `(address,uint256)`. */
export function flattenAbiType(input: AbiInput): string {
  if (input.type === 'tuple' && input.components !== undefined) {
    return `(${input.components.map(flattenAbiType).join(',')})`
  }
  return input.type
}

export function constructorArgTypes(abi: readonly unknown[]): string[] {
  const constructorAbi = (
    abi as Array<{ type?: string; inputs?: AbiInput[] }>
  ).find(item => item.type === 'constructor')
  return (constructorAbi?.inputs ?? []).map(flattenAbiType)
}

export function encodeConstructorArguments(
  abi: readonly unknown[],
  args: readonly unknown[],
): string | undefined {
  const types = constructorArgTypes(abi)
  if (types.length === 0) {
    return undefined
  }
  if (types.length !== args.length) {
    throw new Error(
      `Expected ${types.length} constructor arguments, got ${args.length}`,
    )
  }
  const encoded = abiCoder().encode(types, args)
  return encoded.startsWith('0x') ? encoded.slice(2) : encoded
}
