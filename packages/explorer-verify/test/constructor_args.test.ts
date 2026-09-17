import { ethers } from 'ethers'

import {
  constructorArgTypes,
  encodeConstructorArguments,
  flattenAbiType,
  setAbiCoder,
} from '../src/constructor_args'

describe('constructor encoding', () => {
  it('flattens a tuple type', () => {
    expect(
      flattenAbiType({
        type: 'tuple',
        components: [
          { type: 'address' },
          { type: 'uint256' },
          { type: 'bool' },
        ],
      }),
    ).toBe('(address,uint256,bool)')
  })

  it('flattens nested tuples', () => {
    expect(
      flattenAbiType({
        type: 'tuple',
        components: [
          { type: 'address' },
          { type: 'tuple', components: [{ type: 'uint8' }, { type: 'bytes' }] },
        ],
      }),
    ).toBe('(address,(uint8,bytes))')
  })

  it('reads the constructor types off an ABI', () => {
    const abi = [
      { type: 'function', name: 'transfer', inputs: [{ type: 'address' }] },
      {
        type: 'constructor',
        inputs: [{ type: 'address' }, { type: 'uint256' }],
      },
    ]
    expect(constructorArgTypes(abi)).toEqual(['address', 'uint256'])
    expect(constructorArgTypes([])).toEqual([])
  })

  it('encodes constructor args without the 0x prefix', () => {
    const abi = [
      {
        type: 'constructor',
        inputs: [
          { type: 'address', name: 'admin' },
          { type: 'uint256', name: 'value' },
        ],
      },
    ]
    const encoded = encodeConstructorArguments(abi, [
      '0x1111111111111111111111111111111111111111',
      42,
    ])
    expect(encoded).toBeDefined()
    expect(encoded!.startsWith('0x')).toBe(false)
    const [admin, value] = ethers.AbiCoder.defaultAbiCoder().decode(
      ['address', 'uint256'],
      `0x${encoded!}`,
    )
    expect(admin.toLowerCase()).toBe(
      '0x1111111111111111111111111111111111111111',
    )
    expect(value).toBe(42n)
  })

  it('returns undefined when there are no args', () => {
    expect(encodeConstructorArguments([], [])).toBeUndefined()
  })

  it('throws when the argument count does not match the ABI', () => {
    const abi = [{ type: 'constructor', inputs: [{ type: 'address' }] }]
    expect(() => encodeConstructorArguments(abi, [])).toThrow(/Expected 1/)
  })

  it('uses an injected coder instead of ethers', () => {
    setAbiCoder({ encode: () => '0xdeadbeef' })
    const abi = [{ type: 'constructor', inputs: [{ type: 'address' }] }]
    expect(encodeConstructorArguments(abi, ['0x00'])).toBe('deadbeef')
    setAbiCoder(ethers.AbiCoder.defaultAbiCoder())
  })
})
