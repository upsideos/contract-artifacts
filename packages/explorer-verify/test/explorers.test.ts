import { etherscanV2Url, explorerApiUrl } from '../src/explorers'

describe('explorerApiUrl', () => {
  it('routes Sei, Avalanche and the Etherscan v2 default', () => {
    expect(explorerApiUrl(1329)).toBe('https://seitrace.com/pacific-1/api')
    expect(explorerApiUrl(1328)).toBe('https://seitrace.com/atlantic-2/api')
    expect(explorerApiUrl(43113)).toBe(
      'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan',
    )
    expect(explorerApiUrl(43114)).toBe(
      'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan',
    )
    expect(explorerApiUrl(84532)).toBe(
      'https://api.etherscan.io/v2/api?chainid=84532',
    )
  })

  it('accepts string and number chain ids alike', () => {
    expect(explorerApiUrl('1329')).toBe(explorerApiUrl(1329))
  })

  it('lets a caller override a known and an unknown chain', () => {
    const overrides = { '1329': 'https://example.test/api' }
    expect(explorerApiUrl(1329, overrides)).toBe('https://example.test/api')
    expect(explorerApiUrl(999, overrides)).toBe(etherscanV2Url(999))
  })
})
