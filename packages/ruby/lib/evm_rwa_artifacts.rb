# frozen_string_literal: true

require 'json'
require 'pathname'

require_relative 'evm_rwa_artifacts/version'

# ABIs and verification sources for audited EVM contract releases.
#
# The gem carries data only. It has no dependencies and runs no code at
# load time beyond reading the release directory.
module EvmRwaArtifacts
  RELEASES = %w[v5 v5.1 recallable-payment].freeze

  class Error < StandardError; end

  # The release name is not one this gem carries.
  class UnknownRelease < Error; end

  # The release carries no such file.
  class UnknownFile < Error; end

  DATA_ROOT = Pathname.new(File.expand_path('../data', __dir__)).freeze

  CACHE = {}
  CACHE_MUTEX = Mutex.new
  private_constant :CACHE, :CACHE_MUTEX

  class << self
    def releases
      RELEASES
    end

    def release_dir(release)
      name = release.to_s
      unless RELEASES.include?(name)
        raise UnknownRelease,
              "Unknown release #{name}. Known: #{RELEASES.join(', ')}"
      end

      DATA_ROOT.join(name)
    end

    # Callers that hand a file to another tool, such as an explorer
    # verification request, need the path rather than the content.
    def path(release, file)
      full = release_dir(release).join(file)
      raise UnknownFile, "#{file} is not in release #{release}" unless full.file?

      full
    end

    def abi_path(release, contract)
      path(release, "abi/#{contract}.json")
    end

    # The token forwards unknown selectors into its extensions, so a caller
    # that talks to the token address needs the merged call surface rather
    # than the token ABI alone.
    def merged_abi_path(release, contract)
      path(release, "abi/merged/#{contract}.json")
    end

    def verification_source_codes_path(release)
      path(release, 'verification-source-codes.json')
    end

    def manifest_path(release)
      path(release, 'manifest.json')
    end

    def abi(release, contract)
      read_json(abi_path(release, contract))
    end

    def merged_abi(release, contract)
      read_json(merged_abi_path(release, contract))
    end

    def verification_source_codes(release)
      read_json(verification_source_codes_path(release))
    end

    def manifest(release)
      read_json(manifest_path(release))
    end

    def contracts(release)
      manifest(release).fetch('artifacts').map { |artifact| artifact.fetch('name') }
    end

    def call_surfaces(release)
      manifest(release).fetch('callSurfaces', []).map { |surface| surface.fetch('name') }
    end

    def commit(release)
      manifest(release).fetch('source').fetch('commit')
    end

    def compiler_version(release)
      manifest(release).fetch('build').fetch('compilerLongVersion')
    end

    private

    # Parsed files are shared and frozen, because a release never changes
    # once it is published.
    def read_json(path)
      key = path.to_s
      cached = CACHE[key]
      return cached unless cached.nil?

      CACHE_MUTEX.synchronize do
        CACHE[key] ||= JSON.parse(path.read).freeze
      end
    end
  end
end
