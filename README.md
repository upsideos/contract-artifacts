# Contract artifacts

Bytecode, ABIs and verification sources for audited Upside contract releases.

| Package | Contents |
| --- | --- |
| [`@upsideos/evm-rwa-artifacts`](https://www.npmjs.com/package/@upsideos/evm-rwa-artifacts) | EVM Security Token v5, v5.1 and Recallable Payment |
| [`@upsideos/contract-artifacts-cli`](./packages/cli) | Verify a release and check a deployed contract |
| [`@upsideos/evm-explorer-verify`](./packages/explorer-verify) | Submit a deployment for source verification on a block explorer |
| [`evm_rwa_artifacts`](./packages/ruby) | Ruby gem with the same ABIs and verification sources |

Every release directory in [`releases/`](./releases) is committed here, so the
published bytes are reviewable in git as well as in the npm tarball.

## Install

```bash
npm install @upsideos/evm-rwa-artifacts
```

## Use

```js
const { AccessControl } = require('@upsideos/evm-rwa-artifacts/v5')
const manifest = require('@upsideos/evm-rwa-artifacts/v5/manifest.json')
const sources = require('@upsideos/evm-rwa-artifacts/v5/verification-source-codes.json')
```

`AccessControl.abi` and `AccessControl.bytecode` are the fields a deployer
needs. The verification bundle is about 1 MB, so it stays on its own export and
loads only when you ask for it.

Available exports:

| Export | Contents |
| --- | --- |
| `/v5`, `/v5.1`, `/recallable-payment` | Artifacts keyed by contract name |
| `/v5/manifest.json` | Release record, source commit and per-artifact hashes |
| `/v5/artifacts/<Name>.json` | ABI, creation code, runtime code, immutable slots |
| `/v5/abis/<Name>.json` | Per-contract ABI |
| `/v5/verification-source-codes.json` | solc standard-json input |

`manifest.json` also lists `callSurfaces`. The token forwards unknown selectors
into its extensions, so a client that talks to the token address needs the
merged ABI, not the token ABI alone.

## Ruby

The [`evm_rwa_artifacts`](./packages/ruby) gem carries the same ABIs and
verification sources, built from the same audited commit. It ships no bytecode
and no tooling, because a Ruby consumer reads contracts and verifies them but
does not deploy them.

```ruby
require 'evm_rwa_artifacts'

EvmRwaArtifacts.merged_abi('v5', 'RestrictedLockupToken')
EvmRwaArtifacts.verification_source_codes_path('v5')
```

## Check a deployed contract

Constructor-set immutables, such as the trusted forwarder address, differ per
deployment. Zero those ranges before you hash.

```js
const manifest = require('@upsideos/evm-rwa-artifacts/v5/manifest.json')

async function check(rpcUrl, address, name) {
  const expected = manifest.artifacts.find(a => a.name === name)
  const body = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getCode',
      params: [address, 'latest'],
    }),
  }).then(r => r.json())

  const hex = body.result.slice(2)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  const refs = expected.runtimeCode.immutableReferences || {}
  for (const ranges of Object.values(refs)) {
    for (const { start, length } of ranges) {
      bytes.fill(0, start, start + length)
    }
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const actual = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return actual === expected.runtimeCode.sha256
}
```

The CLI does the same check:

```bash
npx @upsideos/contract-artifacts-cli verify-onchain \
  --release evm/comakery_security_token_v5/2026-09-17-quantstamp \
  --manifest node_modules/@upsideos/evm-rwa-artifacts/releases/v5/manifest.json \
  --contract AccessControl \
  --address 0x... \
  --rpc https://...
```

## Recompile the sources

1. Load `verification-source-codes.json`.
2. Check its canonical SHA-256 against `build.standardJson.sha256` in the
   manifest.
3. Compile with the `solcLongVersion` from the bundle.
4. Compare the creation bytecode to `artifacts/<Name>.json`.

The bundle inlines every source, so this needs no git checkout and no Hardhat.
`npx @upsideos/contract-artifacts-cli verify --release <id>` runs it for you.

## What you can verify

- The published sources recompile to the published bytecode.
- The published bytecode matches `eth_getCode` after masking immutable ranges.
- The npm tarball matches this repository, through the Sigstore provenance
  attestation that npm records for each published version.

`manifest.json` records the audit status, the auditor and the source commit for
each release.

## Verify a deployment on a block explorer

Explorer verification is bound to a deployed address, so it happens after
deployment rather than at publish time.
[`@upsideos/evm-explorer-verify`](./packages/explorer-verify) submits the
published bundle for you:

```bash
npx evm-verify-explorer --release v5 --contract AccessControl \
  --address 0x... --chain-id 84532 --api-key "$EXPLORER_API_KEY"
```

## Releases

Pushing a tag publishes through OIDC trusted publishing, so no long-lived
registry credentials exist in this repository:

- `evm@x.y.z` publishes `@upsideos/evm-rwa-artifacts` to npm
- `cli@x.y.z` publishes `@upsideos/contract-artifacts-cli` to npm
- `explorer@x.y.z` publishes `@upsideos/evm-explorer-verify` to npm
- `ruby@x.y.z` publishes `evm_rwa_artifacts` to RubyGems

## Solana and Sui

The manifest envelope already accepts `solana-verifiable-build` and `sui-move`.
Adapters for those chain families are not in this release. The generated Solana
client is [`@upsideos/solana-rwa`](https://www.npmjs.com/package/@upsideos/solana-rwa).
