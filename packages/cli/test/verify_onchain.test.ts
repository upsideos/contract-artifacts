import {
  hashMaskedRuntime,
  verifyDeployedBytecode,
  releaseBaseUrl,
  fetchJson,
  ethGetCode,
  loadPublishedManifest,
  verifyOnchain,
} from '../src/verify_onchain'
import { sha256MaskedRuntime } from '../src/manifest'

const expected = {
  name: 'AccessControl',
  fullyQualifiedName: 'contracts/AccessControl.sol:AccessControl',
  abi: { path: 'abi/AccessControl.json', sha256: 'a'.repeat(64) },
  creationCode: { sha256: 'b'.repeat(64), length: 2 },
  runtimeCode: {
    sha256: '',
    length: 3,
    immutableReferences: { x: [{ start: 0, length: 1 }] },
  },
  reproduced: true,
}

describe('verifyDeployedBytecode', () => {
  it('matches the masked runtime hash', async () => {
    const runtime = '0x112233'
    expected.runtimeCode.sha256 = sha256MaskedRuntime(
      runtime,
      expected.runtimeCode.immutableReferences,
    )
    const result = await verifyDeployedBytecode({
      runtimeHex: runtime,
      expected,
    })
    expect(result.match).toBe(true)
    const hashed = await hashMaskedRuntime(
      runtime,
      expected.runtimeCode.immutableReferences,
    )
    expect(hashed).toBe(expected.runtimeCode.sha256)
  })

  it('fails when the runtime differs', async () => {
    expected.runtimeCode.sha256 = 'f'.repeat(64)
    const result = await verifyDeployedBytecode({
      runtimeHex: '0x112233',
      expected,
    })
    expect(result.match).toBe(false)
  })
})

describe('releaseBaseUrl', () => {
  it('joins the origin and release id', () => {
    expect(releaseBaseUrl('https://example.com/', 'evm/v5/x')).toBe(
      'https://example.com/v1/releases/evm/v5/x',
    )
  })
})

describe('network helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('fetches JSON and runtime code', async () => {
    const fetchMock = jest.fn(
      async (_url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({ result: '0x112233' }),
          }
        }
        return {
          ok: true,
          json: async () => ({ artifacts: [] }),
        }
      },
    )
    global.fetch = fetchMock as unknown as typeof fetch
    await expect(fetchJson('https://example.com/x')).resolves.toEqual({
      artifacts: [],
    })
    await expect(ethGetCode('https://rpc.example', '0x1')).resolves.toBe(
      '0x112233',
    )
    await expect(
      loadPublishedManifest('https://reg.example', 'evm/v5/x'),
    ).resolves.toEqual({ artifacts: [] })
  })

  it('throws on failed HTTP and RPC errors', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch
    await expect(fetchJson('https://x')).rejects.toThrow(/500/)

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ error: { message: 'bad rpc' } }),
    })) as unknown as typeof fetch
    await expect(ethGetCode('https://rpc', '0x1')).rejects.toThrow(/bad rpc/)
  })

  it('verifyOnchain uses the published artifact', async () => {
    const expectedHash = sha256MaskedRuntime('0x112233', {})
    global.fetch = jest.fn(async (_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ result: '0x112233' }) }
      }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch
    const result = await verifyOnchain({
      rpcUrl: 'https://rpc',
      address: '0x1',
      contractName: 'AccessControl',
      manifest: {
        schemaVersion: '1.0',
        releaseId: 'evm/v5/x',
        chainFamily: 'evm',
        audit: { status: 'audited' },
        source: {
          repository: 'https://github.com/example/contracts',
          commit: '45b32eaeea1d96f1f64ef0d74796a5a80ec154ce',
        },
        build: {
          kind: 'solc-standard-json',
          compilerLongVersion: '0.8.28+commit.7893614a',
          standardJson: {
            path: 'verification-source-codes.json',
            sha256: 'a'.repeat(64),
          },
        },
        artifacts: [
          {
            name: 'AccessControl',
            fullyQualifiedName: 'contracts/AccessControl.sol:AccessControl',
            abi: { path: 'abi/AccessControl.json', sha256: 'b'.repeat(64) },
            creationCode: { sha256: 'c'.repeat(64), length: 2 },
            runtimeCode: { sha256: expectedHash, length: 3 },
            reproduced: true,
          },
        ],
        callSurfaces: [],
      },
    })
    expect(result.match).toBe(true)
  })
})
