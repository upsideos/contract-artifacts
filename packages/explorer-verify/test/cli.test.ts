import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main, parseArgs } from '../src/cli'

const releasesDir = join(__dirname, '..', '..', '..', 'releases')

describe('parseArgs', () => {
  it('reads values and boolean flags', () => {
    expect(
      parseArgs([
        '--release',
        'v5',
        '--contract',
        'AccessControl',
        '--no-wait',
        '--chain-id',
        '1',
      ]),
    ).toEqual({
      release: 'v5',
      contract: 'AccessControl',
      'no-wait': true,
      'chain-id': '1',
    })
  })

  it('treats a trailing flag as a boolean', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true })
  })
})

describe('main', () => {
  const logs: string[] = []
  let fetchCalls = 0
  let response: Record<string, string> = {}

  beforeEach(() => {
    logs.length = 0
    fetchCalls = 0
    jest.spyOn(console, 'log').mockImplementation(line => {
      logs.push(String(line))
    })
    globalThis.fetch = (async () => {
      fetchCalls++
      return {
        ok: true,
        status: 200,
        json: async () => response,
      }
    }) as unknown as typeof fetch
  })

  it('prints usage with no arguments', async () => {
    expect(await main([])).toBe(0)
    expect(logs.join('\n')).toContain('evm-verify-explorer')
    expect(fetchCalls).toBe(0)
  })

  it('submits a release contract and stops when asked not to wait', async () => {
    response = { status: '1', result: 'guid-abc' }
    const code = await main([
      '--release',
      'v5',
      '--releases-dir',
      releasesDir,
      '--contract',
      'AccessControl',
      '--address',
      '0xabc',
      '--chain-id',
      '84532',
      '--api-key',
      'key',
      '--no-wait',
    ])
    expect(code).toBe(0)
    expect(fetchCalls).toBe(1)
    expect(logs.join('\n')).toContain('guid-abc')
  })

  it('verifies from an explicit bundle and reports success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'explorer-verify-'))
    const bundlePath = join(dir, 'bundle.json')
    writeFileSync(
      bundlePath,
      JSON.stringify({
        solcLongVersion: '0.8.28+commit.7893614a',
        input: {
          language: 'Solidity',
          sources: { 'contracts/Token.sol': { content: 'ok' } },
        },
      }),
    )

    response = { result: 'Already Verified' }
    const code = await main([
      '--bundle',
      bundlePath,
      '--contract-name',
      'contracts/Token.sol:Token',
      '--address',
      '0xabc',
      '--chain-id',
      '1',
      '--api-key',
      'key',
      '--api-url',
      'https://explorer.test/api',
    ])
    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('OK:')
  })

  it('reports a rejected submission', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'explorer-verify-'))
    const bundlePath = join(dir, 'bundle.json')
    writeFileSync(
      bundlePath,
      JSON.stringify({
        solcLongVersion: '0.8.28+commit.7893614a',
        input: { language: 'Solidity', sources: {} },
      }),
    )

    response = { message: 'bad request' }
    const code = await main([
      '--bundle',
      bundlePath,
      '--contract-name',
      'contracts/Token.sol:Token',
      '--address',
      '0xabc',
      '--chain-id',
      '1',
      '--api-key',
      'key',
    ])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('FAILED: bad request')
  })

  it('rejects an unknown release', async () => {
    await expect(
      main(['--release', 'v9', '--contract', 'X', '--chain-id', '1']),
    ).rejects.toThrow(/Unknown release v9/)
  })
})
