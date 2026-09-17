# frozen_string_literal: true

require_relative 'lib/upsideos_evm_rwa_artifacts/version'

Gem::Specification.new do |spec|
  spec.name = 'upsideos_evm_rwa_artifacts'
  spec.version = UpsideosEvmRwaArtifacts::VERSION
  spec.authors = ['Upside']
  spec.summary = 'ABIs and verification sources for audited EVM contract releases'
  spec.description = <<~TEXT.strip
    Contract ABIs, merged call-surface ABIs, release manifests and solc
    standard-json verification bundles for the audited EVM Security Token
    releases. Data only, with no dependencies.
  TEXT
  spec.homepage = 'https://github.com/upsideos/contract-artifacts'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.1'

  spec.metadata = {
    'homepage_uri' => spec.homepage,
    'source_code_uri' => "#{spec.homepage}/tree/main/packages/ruby",
    'bug_tracker_uri' => "#{spec.homepage}/issues",
    'rubygems_mfa_required' => 'true'
  }

  # script/prepare_data.rb writes data/ from the release directories.
  spec.files = Dir['lib/**/*.rb'] + Dir['data/**/*.json'] + %w[README.md]
  spec.require_paths = ['lib']
end
