import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findConfigRoot, getRelease } from '../src/config'
import {
  exportName,
  generateTypedAbisForRelease,
  literalType,
} from '../src/typed_abis'

describe('exportName', () => {
  it('lowercases the first word', () => {
    expect(exportName('RestrictedLockupToken')).toBe('restrictedLockupTokenAbi')
    expect(exportName('TransferRules')).toBe('transferRulesAbi')
  })

  // A leading run of capitals is one word, so the next word keeps its own.
  it('treats a leading acronym as one word', () => {
    expect(exportName('ERC2771CustomForwarder')).toBe(
      'erc2771CustomForwarderAbi',
    )
  })

  it('lowercases a name that is all capitals', () => {
    expect(exportName('ERC20')).toBe('erc20Abi')
  })
})

describe('literalType', () => {
  // abitype reads the names off this type, so a widened string or a
  // non-tuple array loses them.
  it('keeps strings literal and arrays fixed length', () => {
    const abi = [
      { type: 'event', name: 'Transfer', inputs: [], anonymous: false },
    ]

    expect(literalType(abi)).toBe(
      [
        'readonly [',
        '  {',
        '    readonly type: "event";',
        '    readonly name: "Transfer";',
        '    readonly inputs: readonly [];',
        '    readonly anonymous: false;',
        '  }',
        ']',
      ].join('\n'),
    )
  })

  it('writes numbers and nulls as they are', () => {
    expect(literalType({ start: 1, deployedBytecode: null })).toBe(
      [
        '{',
        '  readonly start: 1;',
        '  readonly deployedBytecode: null;',
        '}',
      ].join('\n'),
    )
  })

  it('quotes a key that is not an identifier', () => {
    expect(literalType({ 'not-an-identifier': 'x' })).toContain(
      'readonly "not-an-identifier": "x"',
    )
  })
})

describe('generateTypedAbisForRelease', () => {
  const configRoot = findConfigRoot(join(__dirname, '..'))

  it('writes a declaration and a runtime file per module', () => {
    const files = generateTypedAbisForRelease(
      getRelease('evm/comakery_security_token_v5_1/unreleased', configRoot),
    )

    expect(files.map(f => f.path)).toEqual([
      'releases/v5.1/typed/abis.d.ts',
      'releases/v5.1/typed/abis.js',
      'releases/v5.1/typed/merged.d.ts',
      'releases/v5.1/typed/merged.js',
    ])
  })

  // The runtime file reads the JSON the release already ships, so the ABI
  // bytes are in the package once however many modules name them.
  it('reads the shipped JSON at run time rather than inlining it', () => {
    const files = generateTypedAbisForRelease(
      getRelease('evm/comakery_security_token_v5_1/unreleased', configRoot),
    )
    const runtime = files.find(f => f.path.endsWith('merged.js'))

    expect(runtime?.contents).toContain(
      "exports.restrictedLockupTokenAbi = require('../abi/merged/RestrictedLockupToken.json')",
    )
  })

  it('leaves out the merged module for a release with no call surfaces', () => {
    const files = generateTypedAbisForRelease(
      getRelease('evm/recallable_payment/v1.0.0', configRoot),
    )

    expect(files.map(f => f.path)).toEqual([
      'releases/recallable-payment/typed/abis.d.ts',
      'releases/recallable-payment/typed/abis.js',
    ])
  })

  // The point of these modules is that abitype can read the names. Only
  // the compiler can say whether it can, so ask it.
  it('emits a declaration abitype accepts', () => {
    const files = generateTypedAbisForRelease(
      getRelease('evm/comakery_security_token_v5_1/unreleased', configRoot),
    )
    const declaration = files.find(f => f.path.endsWith('merged.d.ts'))
    // Inside the package, so that `abitype` resolves the way it does for
    // a consumer rather than from a temp directory with no node_modules
    // above it.
    const dir = mkdtempSync(join(__dirname, '..', 'typed-abis-check-'))

    try {
      writeFileSync(join(dir, 'abi.d.ts'), declaration?.contents ?? '', 'utf8')
      writeFileSync(
        join(dir, 'check.ts'),
        [
          "import type { Abi, ExtractAbiEventNames } from 'abitype'",
          "import { restrictedLockupTokenAbi } from './abi'",
          'const abi = restrictedLockupTokenAbi satisfies Abi',
          'type Events = ExtractAbiEventNames<typeof restrictedLockupTokenAbi>',
          "const transfer: Events = 'Transfer'",
          '// @ts-expect-error not an event on the token',
          "const missing: Events = 'NoSuchEvent'",
          'export { abi, transfer, missing }',
        ].join('\n'),
        'utf8',
      )

      // No output means every assertion above held, the negative included.
      const output = execFileSync(
        join(__dirname, '..', 'node_modules', '.bin', 'tsc'),
        [
          '--noEmit',
          '--strict',
          '--target',
          'es2022',
          '--module',
          'esnext',
          '--moduleResolution',
          'bundler',
          '--skipLibCheck',
          join(dir, 'check.ts'),
        ],
        { cwd: join(__dirname, '..'), encoding: 'utf8' },
      )

      expect(output).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)
})
