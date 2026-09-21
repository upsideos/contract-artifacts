import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultReleaseId,
  findConfigRoot,
  getRelease,
  listReleases,
  loadConfig,
} from '../src/config'
import { parseArgs, run } from '../src/cli'
import { checkSourcesAgainstCommit } from '../src/verify'
import {
  convertHardhatArtifact,
  normalizeBytecode,
  selectVerificationBundle,
} from '../src/build'
import { solanaAdapter } from '../src/adapters/solana'
import { suiAdapter } from '../src/adapters/sui'
import { writeReleaseIndex } from '../src/pack'

const COMMIT = '45b32eaeea1d96f1f64ef0d74796a5a80ec154ce'

function writeFixture(dir: string): void {
  writeFileSync(
    join(dir, 'contract-artifacts.config.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      defaultRelease: 'evm/test/1',
      releases: {
        'evm/test/1': {
          chainFamily: 'evm',
          artifactsDir: 'artifacts-flat',
          source: {
            repository: 'https://github.com/example/contracts',
            commit: COMMIT,
          },
          audit: { status: 'unaudited' },
          artifacts: ['AccessControl'],
          callSurfaces: [],
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
  mkdirSync(join(dir, 'artifacts-flat'), { recursive: true })
  writeFileSync(
    join(dir, 'artifacts-flat', 'AccessControl.json'),
    JSON.stringify({
      abi: [{ type: 'function', name: 'admin', inputs: [] }],
      bytecode: '0x1122',
      deployedBytecode: '0x3344',
    }),
  )
  writeFileSync(
    join(dir, 'artifacts-flat', 'verification_source_codes.json'),
    JSON.stringify({
      solcLongVersion: '0.8.28+commit.7893614a',
      input: {
        language: 'Solidity',
        sources: {
          'contracts/AccessControl.sol': { content: 'pragma solidity ^0.8.0;' },
        },
        settings: {},
      },
    }),
  )
}

describe('config', () => {
  it('loads a config file and lists releases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
    writeFixture(dir)
    const config = loadConfig(dir)
    expect(defaultReleaseId(dir)).toBe('evm/test/1')
    expect(getRelease('evm/test/1', dir).artifacts).toEqual(['AccessControl'])
    expect(listReleases(dir)).toHaveLength(1)
    expect(findConfigRoot(join(dir, 'artifacts-flat'))).toBe(dir)
    expect(config.schemaVersion).toBe('1.0')
    expect(() => getRelease('missing', dir)).toThrow(/Unknown release/)
    expect(() => findConfigRoot('/tmp')).toThrow(/Cannot find/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('CLI parseArgs', () => {
  it('parses flags and repeated allow-unreproduced', () => {
    const { command, flags } = parseArgs([
      'verify',
      '--release',
      'evm/x',
      '--skip-compile',
      '--allow-unreproduced',
      'Foo',
      '--allow-unreproduced',
      'Bar',
    ])
    expect(command).toBe('verify')
    expect(flags.release).toBe('evm/x')
    expect(flags['skip-compile']).toBe(true)
    expect(flags['allow-unreproduced']).toEqual(['Foo', 'Bar'])
  })
})

describe('CLI run', () => {
  it('prints help', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(await run(['help'])).toBe(0)
    expect(await run(['verify', '--help'])).toBe(0)
    log.mockRestore()
  })

  it('rejects unknown commands and missing flags', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-'))
    writeFixture(dir)
    const cwd = process.cwd()
    process.chdir(dir)
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await run(['nope'])).toBe(1)
    expect(await run(['generate-abis'])).toBe(1)
    expect(await run(['pack'])).toBe(1)
    expect(await run(['build'])).toBe(1)
    expect(await run(['verify-onchain'])).toBe(1)
    err.mockRestore()
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('prints usage when no command is given', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    const code = await run([])
    expect(code).toBe(1)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('lists generate-abis files without writing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-abi-'))
    writeFixture(dir)
    const cwd = process.cwd()
    process.chdir(dir)
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    const code = await run(['generate-abis', '--release', 'evm/test/1'])
    expect(code).toBe(0)
    log.mockRestore()
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('checkSourcesAgainstCommit', () => {
  it('compares bundle sources to a fake git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cst-src-'))
    try {
      const { execFileSync } =
        require('node:child_process') as typeof import('node:child_process')
      execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' })
      execFileSync('git', ['config', 'user.email', 'dev@example.com'], {
        cwd: dir,
        stdio: 'pipe',
      })
      execFileSync('git', ['config', 'user.name', 'Dev'], {
        cwd: dir,
        stdio: 'pipe',
      })
      mkdirSync(join(dir, 'contracts'), { recursive: true })
      writeFileSync(join(dir, 'contracts', 'A.sol'), 'pragma solidity ^0.8.0;')
      execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'pipe' })
      execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'pipe' })
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: dir,
        encoding: 'utf8',
      }).trim()
      const checks = checkSourcesAgainstCommit(
        {
          input: {
            sources: {
              'contracts/A.sol': { content: 'pragma solidity ^0.8.0;' },
              'contracts/Missing.sol': { content: 'x' },
              '@openzeppelin/x.sol': { content: 'ignored' },
            },
          },
        },
        dir,
        commit,
      )
      expect(checks.find(c => c.path === 'contracts/A.sol')?.match).toBe(true)
      expect(checks.find(c => c.path === 'contracts/Missing.sol')?.match).toBe(
        false,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('build helpers', () => {
  it('normalizes Hardhat bytecode objects', () => {
    expect(normalizeBytecode('0xab')).toBe('0xab')
    expect(normalizeBytecode({ object: '0xcd' })).toBe('0xcd')
    expect(normalizeBytecode(undefined)).toBe('')
  })

  it('converts a Hardhat artifact', () => {
    const converted = convertHardhatArtifact({
      abi: [],
      bytecode: { object: '0x11' },
      deployedBytecode: {
        object: '0x22',
        immutableReferences: { '1': [{ start: 0, length: 1 }] },
      },
      metadata: '{}',
    })
    expect(converted.bytecode).toBe('0x11')
    expect(converted.deployedBytecode).toBe('0x22')
    expect(converted.metadata).toBe('{}')
  })

  it('selects a build-info from dbg.json mapping', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hh-'))
    mkdirSync(join(dir, 'build-info'), { recursive: true })
    mkdirSync(join(dir, 'contracts', 'AccessControl.sol'), { recursive: true })
    writeFileSync(
      join(dir, 'build-info', 'aaa.json'),
      JSON.stringify({
        solcLongVersion: '0.8.28+commit.7893614a',
        input: {
          sources: {
            'contracts/AccessControl.sol': { content: 'correct' },
            'test/x.sol': { content: 'drop' },
          },
        },
        output: { ignored: true },
      }),
    )
    writeFileSync(
      join(dir, 'build-info', 'bbb.json'),
      JSON.stringify({
        solcLongVersion: '0.8.28+commit.7893614a',
        input: {
          sources: {
            'contracts/AccessControl.sol': { content: 'stale' },
            extra: { content: 'more' },
          },
        },
      }),
    )
    writeFileSync(
      join(dir, 'contracts', 'AccessControl.sol', 'AccessControl.dbg.json'),
      JSON.stringify({ buildInfo: '../../build-info/aaa.json' }),
    )
    const bundle = selectVerificationBundle(dir)
    expect(
      (bundle.input as { sources: Record<string, { content: string }> })
        .sources['contracts/AccessControl.sol'].content,
    ).toBe('correct')
    expect(
      (bundle.input as { sources: Record<string, unknown> }).sources[
        'test/x.sol'
      ],
    ).toBeUndefined()
    expect(bundle.output).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps a mock out of the bundle even when it has its own dbg.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hh-'))
    mkdirSync(join(dir, 'build-info'), { recursive: true })
    mkdirSync(join(dir, 'contracts', 'AccessControl.sol'), { recursive: true })
    mkdirSync(join(dir, 'contracts', 'mocks', 'ConsoleMock.sol'), {
      recursive: true,
    })
    writeFileSync(
      join(dir, 'build-info', 'aaa.json'),
      JSON.stringify({
        solcLongVersion: '0.8.28+commit.7893614a',
        input: {
          sources: {
            'contracts/AccessControl.sol': { content: 'correct' },
            'contracts/mocks/ConsoleMock.sol': { content: 'mock' },
            'hardhat/console.sol': { content: 'console' },
          },
        },
      }),
    )
    writeFileSync(
      join(dir, 'contracts', 'AccessControl.sol', 'AccessControl.dbg.json'),
      JSON.stringify({ buildInfo: '../../build-info/aaa.json' }),
    )
    writeFileSync(
      join(dir, 'contracts', 'mocks', 'ConsoleMock.sol', 'ConsoleMock.dbg.json'),
      JSON.stringify({ buildInfo: '../../../build-info/aaa.json' }),
    )

    const sources = (
      selectVerificationBundle(dir) as {
        input: { sources: Record<string, unknown> }
      }
    ).input.sources
    // The mock imports hardhat/console.sol, which no release ships. Keeping
    // the mock would leave that import unresolvable and solc would refuse
    // the whole input.
    expect(sources['contracts/mocks/ConsoleMock.sol']).toBeUndefined()
    expect(sources['hardhat/console.sol']).toBeUndefined()
    expect(sources['contracts/AccessControl.sol']).toBeDefined()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('multichain stubs', () => {
  it('throws until Solana and Sui adapters are implemented', async () => {
    expect(solanaAdapter.family).toBe('solana')
    expect(suiAdapter.family).toBe('sui')
    await expect(
      solanaAdapter.reproduce({
        standardJson: {},
        compilerLongVersion: 'x',
        artifacts: [],
      }),
    ).rejects.toThrow(/not implemented/)
    expect(() =>
      suiAdapter.verifyDeployed({
        runtimeHex: '0x',
        expected: {
          name: 'x',
          fullyQualifiedName: 'x',
          abi: { path: 'x', sha256: 'a'.repeat(64) },
          creationCode: { sha256: 'b'.repeat(64), length: 0 },
          runtimeCode: { sha256: 'c'.repeat(64), length: 0 },
          reproduced: false,
        },
      }),
    ).toThrow(/not implemented/)
  })
})

describe('writeReleaseIndex', () => {
  it('writes CommonJS and declaration files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'idx-'))
    writeReleaseIndex(dir, ['AccessControl'])
    expect(require('node:fs').existsSync(join(dir, 'index.js'))).toBe(true)
    expect(
      require('node:fs').readFileSync(join(dir, 'index.d.ts'), 'utf8'),
    ).toMatch(/AccessControl/)
    rmSync(dir, { recursive: true, force: true })
  })
})
