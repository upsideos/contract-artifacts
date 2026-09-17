import { join } from 'node:path'

import {
  loadReleaseBundle,
  loadReleaseContract,
  loadReleaseManifest,
  RELEASES,
} from '../src/release'

const releasesDir = join(__dirname, '..', '..', '..', 'releases')

describe('release resolution', () => {
  it('lists the published releases', () => {
    expect(RELEASES).toEqual(['v5', 'v5.1', 'recallable-payment'])
  })

  it('loads a manifest from a release directory', () => {
    const manifest = loadReleaseManifest('v5', { releasesDir })
    expect(manifest.releaseId).toBe(
      'evm/comakery_security_token_v5/2026-09-17-quantstamp',
    )
    expect(manifest.artifacts.length).toBeGreaterThan(0)
  })

  it('loads the standard-json bundle', () => {
    const bundle = loadReleaseBundle('v5', { releasesDir })
    expect(bundle.solcLongVersion).toMatch(/^0\.8\./)
  })

  it('resolves a contract to its fully qualified name and ABI', () => {
    const contract = loadReleaseContract('v5', 'AccessControl', {
      releasesDir,
    })
    expect(contract.fullyQualifiedName).toBe(
      'contracts/AccessControl.sol:AccessControl',
    )
    expect(Array.isArray(contract.abi)).toBe(true)
  })

  it('accepts the fully qualified name too', () => {
    const contract = loadReleaseContract(
      'v5',
      'contracts/AccessControl.sol:AccessControl',
      { releasesDir },
    )
    expect(contract.name).toBe('AccessControl')
  })

  it('reads EVM_RWA_ARTIFACTS_DIR when no directory is passed', () => {
    const previous = process.env.EVM_RWA_ARTIFACTS_DIR
    process.env.EVM_RWA_ARTIFACTS_DIR = releasesDir
    try {
      expect(loadReleaseManifest('v5.1').releaseId).toContain('v5_1')
    } finally {
      if (previous === undefined) {
        delete process.env.EVM_RWA_ARTIFACTS_DIR
      } else {
        process.env.EVM_RWA_ARTIFACTS_DIR = previous
      }
    }
  })

  it('names the known contracts when one is missing', () => {
    expect(() =>
      loadReleaseContract('v5', 'NotAContract', { releasesDir }),
    ).toThrow(/Known: AccessControl/)
  })

  it('explains what to install when nothing resolves', () => {
    expect(() => loadReleaseContract('v5', 'AccessControl')).toThrow(
      /@upsideos\/evm-rwa-artifacts/,
    )
  })
})
