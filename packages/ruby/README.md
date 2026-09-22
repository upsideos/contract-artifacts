# upsideos_evm_rwa_artifacts

ABIs, creation code and verification sources for the audited EVM Security
Token releases.

The gem carries data only. It has no dependencies, and it ships the same
files as the `@upsideos/evm-rwa-artifacts` npm package, built from the
same audited commit.

## Install

```ruby
gem 'upsideos_evm_rwa_artifacts'
```

## Releases

| Release              | Contents                                   |
| -------------------- | ------------------------------------------ |
| `v5`                 | Security Token v5                          |
| `v5.1`               | Security Token v5.1                        |
| `recallable-payment` | Recallable Payment                         |

## Read an ABI

```ruby
require 'upsideos_evm_rwa_artifacts'

UpsideosEvmRwaArtifacts.abi('v5', 'TransferRules')
UpsideosEvmRwaArtifacts.abi('v5.1', 'IdentityRegistry')
```

The token forwards unknown selectors into its extensions. Use the merged
call surface when you talk to the token address:

```ruby
UpsideosEvmRwaArtifacts.merged_abi('v5', 'RestrictedLockupToken')
```

## Deploy a contract

`artifact` returns the ABI together with the creation code, in the shape a
deployment front end reads. `bytecode` returns the creation code alone, as
the 0x-prefixed hex a deployment transaction carries:

```ruby
UpsideosEvmRwaArtifacts.artifact('v5.1', 'RestrictedLockupToken')
UpsideosEvmRwaArtifacts.bytecode('v5.1', 'RestrictedLockupToken')
```

## Verify a deployment

`verification_source_codes` returns the solc standard-json bundle that an
explorer accepts. Most explorer clients want a file, so there is a path
reader too:

```ruby
UpsideosEvmRwaArtifacts.verification_source_codes('v5')
UpsideosEvmRwaArtifacts.verification_source_codes_path('v5')
```

## Provenance

The manifest records the audited source commit, the compiler, and a
SHA-256 digest for every file in the release:

```ruby
UpsideosEvmRwaArtifacts.commit('v5')             # => "45b32ea..."
UpsideosEvmRwaArtifacts.compiler_version('v5')   # => "0.8.28+commit.7893614a"
UpsideosEvmRwaArtifacts.manifest('v5')
```

To confirm that a file is the one the manifest describes:

```ruby
require 'digest'

path = UpsideosEvmRwaArtifacts.abi_path('v5', 'TransferRules')
Digest::SHA256.hexdigest(path.binread)
```

## What the gem leaves out

The gem ships no tooling, because a Ruby consumer reads contracts and
hands them on but does not compile them. Use `@upsideos/evm-explorer-verify`
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
