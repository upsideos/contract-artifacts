import {
  abiSignature,
  mergeAbis,
  removeDuplicateFunctions,
  reorderOverloadedFunctions,
  type AbiEntry,
} from '../src/abi_merge'

describe('removeDuplicateFunctions', () => {
  it('drops transfer with a value parameter and keeps amount', () => {
    const abi: AbiEntry[] = [
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      },
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ]
    const cleaned = removeDuplicateFunctions(abi)
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0].inputs?.[1]?.name).toBe('amount')
  })

  it('drops exact signature duplicates', () => {
    const entry: AbiEntry = {
      type: 'event',
      name: 'Transfer',
      inputs: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
      ],
    }
    expect(removeDuplicateFunctions([entry, { ...entry }])).toHaveLength(1)
  })

  it('keeps constructor fallback and receive', () => {
    const abi: AbiEntry[] = [
      { type: 'constructor', inputs: [] },
      { type: 'fallback', stateMutability: 'payable' },
      { type: 'receive', stateMutability: 'payable' },
    ]
    expect(removeDuplicateFunctions(abi)).toHaveLength(3)
  })
})

describe('reorderOverloadedFunctions', () => {
  it('puts calculateUnlocked with scheduleId_ first', () => {
    const struct: AbiEntry = {
      type: 'function',
      name: 'calculateUnlocked',
      inputs: [{ name: 'holding', type: 'tuple', components: [] }],
    }
    const schedule: AbiEntry = {
      type: 'function',
      name: 'calculateUnlocked',
      inputs: [
        { name: 'who', type: 'address' },
        { name: 'scheduleId_', type: 'uint256' },
      ],
    }
    const other: AbiEntry = { type: 'function', name: 'name', inputs: [] }
    const ordered = reorderOverloadedFunctions([other, struct, schedule])
    expect(ordered[0]).toBe(schedule)
    expect(ordered[1]).toBe(struct)
    expect(ordered[2]).toBe(other)
  })
})

describe('mergeAbis', () => {
  it('concatenates parts and drops value-named transfers', () => {
    const token: AbiEntry[] = [
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ]
    const extension: AbiEntry[] = [
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      },
      { type: 'function', name: 'lock', inputs: [] },
    ]
    const merged = mergeAbis([token, extension])
    expect(merged.map(abiSignature)).toEqual([
      'function:transfer(address,uint256)',
      'function:lock()',
    ])
  })
})
