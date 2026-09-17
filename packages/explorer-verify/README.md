# @upsideos/evm-explorer-verify

Submit an Etherscan-compatible source verification for a deployed contract.

Verification is bound to a deployed address, so it cannot happen when a release
is published. This package holds the part that every deployer would otherwise
write again: the explorer endpoint per chain, the standard-json request shape,
constructor-argument encoding, and reading the explorer's reply.

```bash
npm install @upsideos/evm-explorer-verify @upsideos/evm-rwa-artifacts
```

## Command line

```bash
npx evm-verify-explorer \
  --release v5 \
  --contract AccessControl \
  --address 0x... \
  --chain-id 84532 \
  --api-key "$EXPLORER_API_KEY"
```

It submits, then polls until the explorer settles. Add `--no-wait` to submit
and print the GUID. Add `--constructor-args '["0x...",42]'` when the contract
takes constructor arguments, or `--constructor-arguments <hex>` if you encoded
them yourself. Run with `--help` for the rest.

## Library

```js
const {
  loadReleaseBundle,
  loadReleaseContract,
  verifyContract,
} = require('@upsideos/evm-explorer-verify')

const contract = loadReleaseContract('v5', 'RestrictedLockupToken')

const result = await verifyContract({
  apiKey: process.env.EXPLORER_API_KEY,
  chainId: 84532,
  contractAddress: '0x...',
  contractName: contract.fullyQualifiedName,
  bundle: loadReleaseBundle('v5'),
  abi: contract.abi,
  constructorArgs: [forwarder, accessControl /* ... */],
})
```

A queue worker should drive `submitSourceVerification` and
`checkVerificationStatus` itself, so that waiting for the explorer does not
hold an execution open.

## Chains

Etherscan v2 serves most chains from one multichain endpoint, which is the
default. Sei and Avalanche have their own Etherscan-compatible APIs and are
built in. For anything else, including a self-hosted Blockscout, pass
`apiUrl`, or `explorerApiUrls` keyed by chain id.

## Loading releases

`loadReleaseBundle`, `loadReleaseManifest` and `loadReleaseContract` resolve
`@upsideos/evm-rwa-artifacts` when it is installed. When the release
directories are copied somewhere the resolver cannot see, such as next to a
Lambda handler, pass `releasesDir` or set `EVM_RWA_ARTIFACTS_DIR`.

The submit path never touches the filesystem, so you can also load the bundle
yourself and pass it in.

## Constructor arguments

Encoding needs an ABI coder. `ethers` is an optional peer dependency and is
used when present. Otherwise call `setAbiCoder` with your own, or encode the
arguments yourself and pass `constructorArguments` as hex without `0x`.
`constructorArgTypes(abi)` returns the flattened type list if you want to
encode with viem.
