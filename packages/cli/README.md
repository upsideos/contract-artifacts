# @upsideos/contract-artifacts-cli

Verify audited contract artifact releases and check deployed contracts.

```bash
npm install -D @upsideos/contract-artifacts-cli
```

## Check a deployed contract

No compiler needed. The manifest ships inside
[`@upsideos/evm-rwa-artifacts`](https://www.npmjs.com/package/@upsideos/evm-rwa-artifacts).

```bash
npx contract-artifacts verify-onchain \
  --release evm/comakery_security_token_v5/2026-09-17-quantstamp \
  --manifest node_modules/@upsideos/evm-rwa-artifacts/releases/v5/manifest.json \
  --contract AccessControl \
  --address 0x... \
  --rpc https://...
```

## Recompile and compare

`verify` recompiles the published standard-json input with solc-js and compares
the result to the published bytecode. This needs no git checkout, because the
bundle inlines every source.

```bash
npx contract-artifacts verify --release <id>
```

Point `--contracts-repo` at a checkout to also compare each inlined source
against the commit recorded in the manifest. Without a checkout that
comparison cannot run: `verify` then reports `Proof A: SKIPPED` and exits
non-zero, because a proof that did not run is not a proof that passed. Add
`--skip-proof-a` to accept a release on the recompile alone.

## Build and pack a release

`build` reads a Hardhat `artifacts/` directory and writes a packed release
directory: artifacts, per-contract ABIs, merged call-surface ABIs, the
standard-json bundle and `manifest.json`.

```bash
npx contract-artifacts build --release <id> --artifacts-dir artifacts --out-dir ./release
npx contract-artifacts pack --release <id> --out-dir ./release
```

Both read `contract-artifacts.config.json` from the nearest parent directory,
or from `--config-root`. It lists each release, its source commit, audit status,
contract names and call surfaces.

## Other commands

```bash
npx contract-artifacts audit                              # hashes match the manifest
npx contract-artifacts generate-abis --release <id> --write
```

## Chain families

EVM is implemented. The `ChainFamilyAdapter` interface and the manifest envelope
already cover Solana and Sui; those adapters throw until they land.
