import {
  evmAdapter,
  setSolcForTests,
  compareArtifact,
} from '../src/adapters/evm'
import type { ArtifactInput } from '../src/adapters/types'

const artifact: ArtifactInput = {
  name: 'AccessControl',
  fullyQualifiedName: 'contracts/AccessControl.sol:AccessControl',
  abi: [],
  bytecode: '0x1122',
}

describe('compareArtifact', () => {
  it('marks a creation-code match as reproduced', () => {
    const result = compareArtifact(artifact, {
      evm: {
        bytecode: { object: '1122' },
        deployedBytecode: { object: '3344' },
      },
    })
    expect(result.reproduced).toBe(true)
    expect(result.creationCode).toBe('0x1122')
  })

  it('detects a creation mismatch', () => {
    const result = compareArtifact(artifact, {
      evm: { bytecode: { object: 'ffff' } },
    })
    expect(result.reproduced).toBe(false)
    expect(result.message).toMatch(/creation bytecode mismatch/)
  })

  it('detects a runtime mismatch when deployedBytecode is present', () => {
    const result = compareArtifact(
      { ...artifact, deployedBytecode: '0xaabb' },
      {
        evm: {
          bytecode: { object: '1122' },
          deployedBytecode: { object: 'ccdd' },
        },
      },
    )
    expect(result.reproduced).toBe(false)
    expect(result.message).toMatch(/runtime bytecode mismatch/)
  })
})

describe('EvmAdapter.reproduce', () => {
  afterEach(() => {
    setSolcForTests(undefined)
  })

  it('compiles a mocked standard-json and reports a missing contract', async () => {
    setSolcForTests({
      compile: () =>
        JSON.stringify({
          contracts: {
            'contracts/Other.sol': {
              Other: { evm: { bytecode: { object: 'aa' } } },
            },
          },
        }),
    })
    const results = await evmAdapter.reproduce({
      standardJson: { language: 'Solidity', sources: {}, settings: {} },
      compilerLongVersion: '0.8.28+commit.7893614a',
      artifacts: [artifact],
    })
    expect(results[0].reproduced).toBe(false)
    expect(results[0].message).toMatch(/not in the compiler output/)
  })

  it('throws when solc reports errors', async () => {
    setSolcForTests({
      compile: () =>
        JSON.stringify({
          errors: [{ severity: 'error', formattedMessage: 'boom' }],
        }),
    })
    await expect(
      evmAdapter.reproduce({
        standardJson: { language: 'Solidity', sources: {}, settings: {} },
        compilerLongVersion: '0.8.28+commit.7893614a',
        artifacts: [artifact],
      }),
    ).rejects.toThrow(/solc failed/)
  })

  it('matches a compiled contract by fully qualified name', async () => {
    setSolcForTests({
      compile: () =>
        JSON.stringify({
          contracts: {
            'contracts/AccessControl.sol': {
              AccessControl: { evm: { bytecode: { object: '1122' } } },
            },
          },
        }),
    })
    const results = await evmAdapter.reproduce({
      standardJson: { language: 'Solidity', sources: {}, settings: {} },
      compilerLongVersion: '0.8.28+commit.7893614a',
      artifacts: [artifact],
    })
    expect(results[0].reproduced).toBe(true)
  })
})

describe('EvmAdapter.verifyDeployed', () => {
  it('compares masked runtime hashes', () => {
    const runtime = '0x112233'
    const expectedHash = require('../src/manifest').sha256MaskedRuntime(
      runtime,
      {
        x: [{ start: 0, length: 1 }],
      },
    )
    const result = evmAdapter.verifyDeployed({
      runtimeHex: runtime,
      expected: {
        name: 'AccessControl',
        fullyQualifiedName: 'contracts/AccessControl.sol:AccessControl',
        abi: { path: 'abi/AccessControl.json', sha256: 'a'.repeat(64) },
        creationCode: { sha256: 'b'.repeat(64), length: 2 },
        runtimeCode: {
          sha256: expectedHash,
          length: 3,
          immutableReferences: { x: [{ start: 0, length: 1 }] },
        },
        reproduced: true,
      },
    })
    expect(result.match).toBe(true)
  })
})
