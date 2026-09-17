import {
  filterVerificationInput,
  keepVerificationSource,
  parseVerificationBundle,
} from '../src/standard_json'

describe('source filter', () => {
  it('keeps OpenZeppelin, solidity-bits and contracts sources and drops mocks', () => {
    expect(
      keepVerificationSource('@openzeppelin/contracts/token/ERC20.sol'),
    ).toBe(true)
    expect(keepVerificationSource('@solidity-bits/BitMaps.sol')).toBe(true)
    expect(keepVerificationSource('contracts/AccessControl.sol')).toBe(true)
    expect(keepVerificationSource('contracts/mocks/MockToken.sol')).toBe(false)
    expect(keepVerificationSource('test/Helper.sol')).toBe(false)
  })

  it('filters the sources map on a copy', () => {
    const input = {
      language: 'Solidity',
      sources: {
        'contracts/Token.sol': { content: 'ok' },
        'contracts/mocks/X.sol': { content: 'drop' },
        'hardhat/console.sol': { content: 'drop' },
      },
    }
    const filtered = filterVerificationInput(input)
    expect(Object.keys(filtered.sources ?? {})).toEqual(['contracts/Token.sol'])
    expect(filtered.language).toBe('Solidity')
    expect(Object.keys(input.sources)).toHaveLength(3)
  })

  it('leaves an input without sources alone', () => {
    expect(filterVerificationInput({ language: 'Solidity' })).toEqual({
      language: 'Solidity',
    })
  })
})

describe('parseVerificationBundle', () => {
  const bundle = {
    solcLongVersion: '0.8.28+commit.7893614a',
    input: {
      language: 'Solidity',
      sources: {
        'contracts/Token.sol': { content: 'ok' },
        'contracts/mocks/X.sol': { content: 'drop' },
      },
    },
  }

  it('filters sources and returns the compiler version', () => {
    const parsed = parseVerificationBundle(bundle)
    expect(parsed.compilerVersion).toBe('0.8.28+commit.7893614a')
    expect(Object.keys(parsed.sourceCode.sources ?? {})).toEqual([
      'contracts/Token.sol',
    ])
  })

  it('accepts an input that is still a JSON string', () => {
    const parsed = parseVerificationBundle({
      solcLongVersion: '0.8.28+commit.7893614a',
      input: JSON.stringify(bundle.input),
    })
    expect(Object.keys(parsed.sourceCode.sources ?? {})).toEqual([
      'contracts/Token.sol',
    ])
  })

  it('rejects a bundle without a compiler version', () => {
    expect(() =>
      parseVerificationBundle({
        input: bundle.input,
      } as unknown as typeof bundle),
    ).toThrow(/missing input or solcLongVersion/)
  })
})
