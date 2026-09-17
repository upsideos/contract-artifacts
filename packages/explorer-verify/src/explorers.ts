/**
 * Explorer API endpoints.
 *
 * Etherscan v2 serves most chains from one multichain endpoint. Sei and
 * Avalanche run their own Etherscan-compatible APIs.
 */

export type ChainId = string | number

export type ExplorerApiUrls = Record<string, string>

export const KNOWN_EXPLORER_API_URLS: ExplorerApiUrls = {
  '1328': 'https://seitrace.com/atlantic-2/api',
  '1329': 'https://seitrace.com/pacific-1/api',
  '43113': 'https://api.routescan.io/v2/network/testnet/evm/43113/etherscan',
  '43114': 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan',
}

export function etherscanV2Url(chainId: ChainId): string {
  return `https://api.etherscan.io/v2/api?chainid=${String(chainId)}`
}

/**
 * Pass `overrides` to reach an explorer this package does not know, or to
 * point a chain at a self-hosted Blockscout.
 */
export function explorerApiUrl(
  chainId: ChainId,
  overrides: ExplorerApiUrls = {},
): string {
  const key = String(chainId)
  return overrides[key] ?? KNOWN_EXPLORER_API_URLS[key] ?? etherscanV2Url(key)
}
