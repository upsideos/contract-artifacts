import {
  canonicalize,
  extractMetadataHash,
  hexToBytes,
  maskImmutableRanges,
  parseManifest,
  SCHEMA_VERSION,
  sha256Canonical,
  sha256Hex,
  sha256HexBytes,
  sha256MaskedRuntime,
} from '../src/manifest'

const sampleManifest = {
  schemaVersion: SCHEMA_VERSION,
  releaseId: 'evm/comakery_security_token_v5/2026-09-17-quantstamp',
  chainFamily: 'evm' as const,
  audit: { status: 'audited' as const, auditor: 'Quantstamp' },
  source: {
    repository: 'https://github.com/example/contracts',
    commit: '45b32eaeea1d96f1f64ef0d74796a5a80ec154ce',
  },
  build: {
    kind: 'solc-standard-json' as const,
    compilerLongVersion: '0.8.28+commit.7893614a',
    standardJson: {
      path: 'verification_source_codes.json',
      sha256: 'a'.repeat(64),
    },
  },
  artifacts: [
    {
      name: 'AccessControl',
      fullyQualifiedName: 'contracts/AccessControl.sol:AccessControl',
      abi: {
        path: 'abi/AccessControl.json',
        sha256: 'b'.repeat(64),
        entryCount: 1,
      },
      creationCode: { sha256: 'c'.repeat(64), length: 10 },
      runtimeCode: {
        sha256: 'd'.repeat(64),
        length: 10,
        immutableReferences: { '1': [{ start: 1, length: 2 }] },
      },
      reproduced: true,
    },
  ],
  callSurfaces: [],
}

describe('canonicalize', () => {
  it('sorts object keys', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('is stable for nested objects and arrays', () => {
    const left = { z: [{ b: 1, a: 2 }], y: true }
    const right = { y: true, z: [{ a: 2, b: 1 }] }
    expect(sha256Canonical(left)).toBe(sha256Canonical(right))
  })
})

describe('hex helpers', () => {
  it('hashes bytecode bytes, not the hex string', () => {
    expect(sha256HexBytes('0x0a0b')).toBe(sha256Hex(Buffer.from([10, 11])))
  })

  it('rejects odd-length hex', () => {
    expect(() => hexToBytes('0xabc')).toThrow(/even length/)
  })
})

describe('maskImmutableRanges', () => {
  it('zeros the given byte ranges', () => {
    expect(
      maskImmutableRanges('0x1122334455', { x: [{ start: 1, length: 2 }] }),
    ).toBe('1100004455')
  })

  it('returns the original bytes when no refs are given', () => {
    expect(maskImmutableRanges('aabb', undefined)).toBe('aabb')
  })

  it('rejects a range past the end of the bytecode', () => {
    expect(() =>
      maskImmutableRanges('0xaa', { x: [{ start: 0, length: 4 }] }),
    ).toThrow(/exceeds/)
  })

  it('hashes the masked runtime', () => {
    const masked = sha256MaskedRuntime('0x112233', {
      x: [{ start: 0, length: 1 }],
    })
    expect(masked).toBe(sha256Hex(Buffer.from('002233', 'hex')))
  })
})

describe('extractMetadataHash', () => {
  it('returns undefined for short or unmarked bytecode', () => {
    expect(extractMetadataHash('0xaa')).toBeUndefined()
    expect(extractMetadataHash('0xaabbccdd')).toBeUndefined()
  })

  it('reads the IPFS hash from a CBOR suffix', () => {
    const ipfs = 'a264697066735822' + '11'.repeat(34)
    const cbor = ipfs
    const len = (cbor.length / 2).toString(16).padStart(4, '0')
    const runtime = 'deadbeef' + cbor + len + '0033'
    const hash = extractMetadataHash(runtime)
    expect(hash).toBe('0x' + '11'.repeat(34))
  })

  it('returns the CBOR hex when the IPFS marker is absent', () => {
    const cbor = 'aabb'
    const len = '0002'
    expect(extractMetadataHash('00' + cbor + len + '0033')).toBe('0xaabb')
  })
})

describe('manifest schema', () => {
  it('accepts a valid EVM manifest', () => {
    const parsed = parseManifest(sampleManifest)
    expect(parsed.chainFamily).toBe('evm')
    expect(parsed.artifacts).toHaveLength(1)
  })

  it('rejects a bad commit', () => {
    expect(() =>
      parseManifest({
        ...sampleManifest,
        source: { ...sampleManifest.source, commit: 'xyz' },
      }),
    ).toThrow()
  })
})
