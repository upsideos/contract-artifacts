# frozen_string_literal: true

require 'digest'
require 'minitest/autorun'
require 'upsideos_evm_rwa_artifacts'

class UpsideosEvmRwaArtifactsTest < Minitest::Test
  def test_releases
    assert_equal %w[v5 v5.1 recallable-payment], UpsideosEvmRwaArtifacts.releases
  end

  def test_abi_is_a_list_of_entries
    abi = UpsideosEvmRwaArtifacts.abi('v5', 'TransferRules')

    assert_kind_of Array, abi
    assert abi.any? { |entry| entry['type'] == 'function' }
  end

  def test_merged_abi_is_larger_than_the_token_abi
    token = UpsideosEvmRwaArtifacts.abi('v5', 'RestrictedLockupToken')
    merged = UpsideosEvmRwaArtifacts.merged_abi('v5', 'RestrictedLockupToken')

    assert_operator merged.length, :>, token.length
  end

  def test_verification_source_codes
    bundle = UpsideosEvmRwaArtifacts.verification_source_codes('v5')

    assert_equal '0.8.28+commit.7893614a', bundle['solcLongVersion']
    assert bundle.dig('input', 'sources').is_a?(Hash)
  end

  def test_manifest_readers
    assert_equal '45b32eaeea1d96f1f64ef0d74796a5a80ec154ce', UpsideosEvmRwaArtifacts.commit('v5')
    assert_equal '0.8.28+commit.7893614a', UpsideosEvmRwaArtifacts.compiler_version('v5')
    assert_includes UpsideosEvmRwaArtifacts.contracts('v5'), 'RestrictedLockupToken'
    assert_equal %w[RestrictedLockupToken], UpsideosEvmRwaArtifacts.call_surfaces('v5')
  end

  def test_every_release_carries_abis_and_a_verification_bundle
    UpsideosEvmRwaArtifacts.releases.each do |release|
      UpsideosEvmRwaArtifacts.contracts(release).each do |contract|
        assert_kind_of Array, UpsideosEvmRwaArtifacts.abi(release, contract)
      end

      assert UpsideosEvmRwaArtifacts.verification_source_codes_path(release).file?
    end
  end

  # The manifest records a digest for every file the release ships, so a
  # bad copy into the gem shows up here.
  def test_shipped_files_match_the_manifest_digests
    UpsideosEvmRwaArtifacts.releases.each do |release|
      manifest = UpsideosEvmRwaArtifacts.manifest(release)

      manifest.fetch('artifacts').each do |artifact|
        abi = artifact.fetch('abi')
        path = UpsideosEvmRwaArtifacts.path(release, abi.fetch('path'))

        assert_equal abi.fetch('sha256'), Digest::SHA256.hexdigest(path.binread),
                     "#{release} #{artifact.fetch('name')} ABI digest"
      end

      standard_json = manifest.dig('build', 'standardJson')
      path = UpsideosEvmRwaArtifacts.path(release, standard_json.fetch('path'))

      assert_equal standard_json.fetch('sha256'), Digest::SHA256.hexdigest(path.binread),
                   "#{release} verification bundle digest"
    end
  end

  def test_parsed_files_are_shared_and_frozen
    first = UpsideosEvmRwaArtifacts.abi('v5', 'AccessControl')
    second = UpsideosEvmRwaArtifacts.abi('v5', 'AccessControl')

    assert_same first, second
    assert_predicate first, :frozen?
  end

  def test_unknown_release
    assert_raises(UpsideosEvmRwaArtifacts::UnknownRelease) { UpsideosEvmRwaArtifacts.abi('v4', 'TransferRules') }
  end

  def test_unknown_contract
    assert_raises(UpsideosEvmRwaArtifacts::UnknownFile) { UpsideosEvmRwaArtifacts.abi('v5', 'NoSuchContract') }
  end

  # The gem is data only. Bytecode belongs to the npm package, because a
  # Ruby consumer reads and verifies contracts but does not deploy them.
  def test_no_bytecode_ships
    assert_empty Dir[UpsideosEvmRwaArtifacts::DATA_ROOT.join('**', 'artifacts', '*')]
  end
end
