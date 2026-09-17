# evm_rwa_artifacts

ABIs and verification sources for the audited EVM Security Token releases.

The gem carries data only. It has no dependencies, and it ships the same
files as the `@upsideos/evm-rwa-artifacts` npm package, built from the
same audited commit.

## Install

```ruby
gem 'evm_rwa_artifacts'
```

## Releases

| Release              | Contents                                   |
| -------------------- | ------------------------------------------ |
| `v5`                 | Security Token v5                          |
| `v5.1`               | Security Token v5.1                        |
| `recallable-payment` | Recallable Payment                         |

## Read an ABI

```ruby
require 'evm_rwa_artifacts'

EvmRwaArtifacts.abi('v5', 'TransferRules')
EvmRwaArtifacts.abi('v5.1', 'IdentityRegistry')
```

The token forwards unknown selectors into its extensions. Use the merged
call surface when you talk to the token address:

```ruby
EvmRwaArtifacts.merged_abi('v5', 'RestrictedLockupToken')
```

## Verify a deployment

`verification_source_codes` returns the solc standard-json bundle that an
explorer accepts. Most explorer clients want a file, so there is a path
reader too:

```ruby
EvmRwaArtifacts.verification_source_codes('v5')
EvmRwaArtifacts.verification_source_codes_path('v5')
```

## Provenance

The manifest records the audited source commit, the compiler, and a
SHA-256 digest for every file in the release:

```ruby
EvmRwaArtifacts.commit('v5')             # => "45b32ea..."
EvmRwaArtifacts.compiler_version('v5')   # => "0.8.28+commit.7893614a"
EvmRwaArtifacts.manifest('v5')
```

To confirm that a file is the one the manifest describes:

```ruby
require 'digest'

path = EvmRwaArtifacts.abi_path('v5', 'TransferRules')
Digest::SHA256.hexdigest(path.binread)
```

## What the gem leaves out

The gem ships no bytecode and no tooling, because a Ruby consumer reads
contracts and verifies them but does not compile or deploy them. Use the
npm package for deployment bytecode, and `@upsideos/evm-explorer-verify`
to submit a verification to an explorer.

## Notes

Parsed files are cached and frozen, because a published release never
changes.

The gem is published from tag `ruby@<version>` with RubyGems trusted
publishing, so every version is traceable to the workflow run that built
it.

## Development

`data/` is generated, not committed. Copy it out of the release
directories before you build or test:

```bash
rake prepare
rake test
rake build
```
