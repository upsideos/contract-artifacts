import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadArtifactFile,
  loadReleaseArtifacts,
  loadVerificationBundle,
} from '../src/artifacts'
import { getRelease } from '../src/config'
import {
  generateAbis,
  writeGeneratedAbis,
  diffGeneratedAbis,
} from '../src/generate_abis'
import { verifyLoadedRelease } from '../src/verify'
import { writeReleaseFiles, writeReleaseIndex } from '../src/pack'
import { auditRelease } from '../src/audit'

const COMMIT = '45b32eaeea1d96f1f64ef0d74796a5a80ec154ce'

function writePackedFixture(dir: string): void {
  writeFileSync(
    join(dir, 'contract-artifacts.config.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      defaultRelease: 'evm/test/1',
      releases: {
        'evm/test/1': {
          chainFamily: 'evm',
          releaseDir: 'releases/v5',
          source: {
            repository: 'https://github.com/example/contracts',
            commit: COMMIT,
          },
          audit: { status: 'unaudited' },
          artifacts: ['AccessControl'],
          callSurfaces: [
            { name: 'AccessControl', mergedFrom: ['AccessControl'] },
          ],
          vendorCopies: [
            {
              source: 'AccessControl',
              vendorFile: 'access_control.json',
              docsFile: 'AccessControl.json',
              merged: false,
            },
          ],
          docsDir: 'docs',
          vendorDir: 'vendor',
        },
      },
    }),
  )
  const rel = join(dir, 'releases', 'v5')
  mkdirSync(join(rel, 'artifacts'), { recursive: true })
  mkdirSync(join(rel, 'abi', 'merged'), { recursive: true })
  const abi = [{ type: 'function', name: 'admin', inputs: [] }]
  const artifact = {
    abi,
    bytecode: '0x1122',
    deployedBytecode: '0x3344',
    immutableReferences: {},
  }
  writeFileSync(
    join(rel, 'artifacts', 'AccessControl.json'),
    JSON.stringify(artifact),
  )
  writeFileSync(join(rel, 'abi', 'AccessControl.json'), JSON.stringify(abi))
  writeFileSync(
    join(rel, 'abi', 'merged', 'AccessControl.json'),
    JSON.stringify(abi),
  )
  const bundle = {
    solcLongVersion: '0.8.28+commit.7893614a',
    input: {
      language: 'Solidity',
      sources: {
        'contracts/AccessControl.sol': { content: 'pragma solidity ^0.8.0;' },
      },
      settings: {},
    },
  }
  writeFileSync(
    join(rel, 'verification-source-codes.json'),
    JSON.stringify(bundle),
  )
}

describe('artifacts', () => {
  it('loads a packed artifact and rejects a non-artifact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'art-'))
    writePackedFixture(dir)
    const entry = getRelease('evm/test/1', dir)
    const loaded = loadReleaseArtifacts(entry)
    expect(loaded[0].bytecode).toBe('0x1122')
    const bundle = loadVerificationBundle(entry)
    expect(bundle.solcLongVersion).toBe('0.8.28+commit.7893614a')
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{"nope": true}')
    expect(() => loadArtifactFile(bad, 'Bad')).toThrow(/not a/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('verifyLoadedRelease skipCompile', () => {
  it('builds a manifest from packed files and a local contracts clone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ver-'))
    writePackedFixture(dir)
    const repo = mkdtempSync(join(tmpdir(), 'cst-'))
    const { execFileSync } =
      require('node:child_process') as typeof import('node:child_process')
    execFileSync('git', ['init'], { cwd: repo, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.email', 'dev@example.com'], {
      cwd: repo,
      stdio: 'pipe',
    })
    execFileSync('git', ['config', 'user.name', 'Dev'], {
      cwd: repo,
      stdio: 'pipe',
    })
    mkdirSync(join(repo, 'contracts'), { recursive: true })
    writeFileSync(
      join(repo, 'contracts', 'AccessControl.sol'),
      'pragma solidity ^0.8.0;',
    )
    execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'pipe' })
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()

    const entry = getRelease('evm/test/1', dir)
    const artifacts = loadReleaseArtifacts(entry)
    const bundle = loadVerificationBundle(entry)
    const report = await verifyLoadedRelease({
      entry,
      artifacts,
      bundle,
      commit,
      skipCompile: true,
      contractsRepo: repo,
    })
    expect(report.manifest.artifacts).toHaveLength(1)
    expect(report.proofA.ok).toBe(true)
    const out = mkdtempSync(join(tmpdir(), 'rel-'))
    writeReleaseFiles(out, report, artifacts, bundle)
    writeReleaseIndex(out, entry.artifacts)
    rmSync(out, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('generateAbis and audit', () => {
  it('writes consumer ABI copies and reports hash drift', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aud-'))
    writePackedFixture(dir)
    const entry = getRelease('evm/test/1', dir)
    const artifacts = loadReleaseArtifacts(entry)
    const bundle = loadVerificationBundle(entry)
    const repo = mkdtempSync(join(tmpdir(), 'cst2-'))
    const { execFileSync } =
      require('node:child_process') as typeof import('node:child_process')
    execFileSync('git', ['init'], { cwd: repo, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.email', 'dev@example.com'], {
      cwd: repo,
      stdio: 'pipe',
    })
    execFileSync('git', ['config', 'user.name', 'Dev'], {
      cwd: repo,
      stdio: 'pipe',
    })
    mkdirSync(join(repo, 'contracts'), { recursive: true })
    writeFileSync(
      join(repo, 'contracts', 'AccessControl.sol'),
      'pragma solidity ^0.8.0;',
    )
    execFileSync('git', ['add', '.'], { cwd: repo, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, stdio: 'pipe' })
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
    const report = await verifyLoadedRelease({
      entry,
      artifacts,
      bundle,
      commit,
      skipCompile: true,
      contractsRepo: repo,
    })
    writeReleaseFiles(join(dir, 'releases', 'v5'), report, artifacts, bundle)

    const files = generateAbis('evm/test/1', dir)
    expect(files.some(f => f.path.endsWith('AccessControl.json'))).toBe(true)
    writeGeneratedAbis(files, dir)
    expect(diffGeneratedAbis(files, dir).every(d => d.status === 'match')).toBe(
      true,
    )
    const audit = auditRelease('evm/test/1', dir)
    expect(audit.ok).toBe(true)
    rmSync(repo, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  })
})
