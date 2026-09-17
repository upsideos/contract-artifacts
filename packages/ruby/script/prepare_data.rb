#!/usr/bin/env ruby
# frozen_string_literal: true

# Copy the data the gem ships out of the release directories.
#
# The gem carries ABIs, manifests and verification sources. It leaves out
# the bytecode in artifacts/, because a Ruby consumer reads contracts and
# verifies them but does not deploy them.

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

  FileUtils.mkdir_p(target.join('abi'))
  Dir[source.join('abi', '*.json')].each do |abi|
    FileUtils.cp(abi, target.join('abi', File.basename(abi)))
  end

  merged = source.join('abi', 'merged')
  return unless merged.directory?

  FileUtils.mkdir_p(target.join('abi', 'merged'))
  Dir[merged.join('*.json')].each do |abi|
    FileUtils.cp(abi, target.join('abi', 'merged', File.basename(abi)))
  end
end

RELEASES.each do |release|
  copy_release(release)
  puts "prepared #{release}"
end

count = Dir[DATA_ROOT.join('**', '*.json')].length
puts "#{count} files in #{DATA_ROOT}"
