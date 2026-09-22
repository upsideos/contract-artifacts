#!/usr/bin/env ruby
# frozen_string_literal: true

# Copy the data the gem ships out of the release directories.
#
# The gem carries ABIs, artifacts, manifests and verification sources. A
# Ruby consumer hands the creation code to a browser that deploys the set,
# so the artifacts come along with the ABIs.

require 'fileutils'
require 'pathname'

GEM_ROOT = Pathname.new(File.expand_path('..', __dir__))
RELEASES_ROOT = GEM_ROOT.join('..', '..', 'releases').cleanpath
DATA_ROOT = GEM_ROOT.join('data')

RELEASES = %w[v5 v5.1 recallable-payment].freeze
FILES = %w[manifest.json verification-source-codes.json].freeze

def copy_release(release)
  source = RELEASES_ROOT.join(release)
  raise "Missing release directory #{source}" unless source.directory?

  target = DATA_ROOT.join(release)
  FileUtils.rm_rf(target)
  FileUtils.mkdir_p(target)

  FILES.each do |file|
    FileUtils.cp(source.join(file), target.join(file))
  end

  copy_json_dir(source.join('abi'), target.join('abi'))
  copy_json_dir(source.join('artifacts'), target.join('artifacts'))
  copy_json_dir(source.join('abi', 'merged'), target.join('abi', 'merged'))
end

def copy_json_dir(source, target)
  return unless source.directory?

  FileUtils.mkdir_p(target)
  Dir[source.join('*.json')].each do |file|
    FileUtils.cp(file, target.join(File.basename(file)))
  end
end

RELEASES.each do |release|
  copy_release(release)
  puts "prepared #{release}"
end

count = Dir[DATA_ROOT.join('**', '*.json')].length
puts "#{count} files in #{DATA_ROOT}"
