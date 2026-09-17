#!/usr/bin/env node
/**
 * evm-verify-explorer — submit a deployed contract for source verification.
 */

import { readFileSync } from 'node:fs'

import {
  loadReleaseBundle,
  loadReleaseContract,
  RELEASES,
  type ReleaseKey,
} from './release'
import type { VerificationBundle } from './standard_json'
import {
  isAlreadyVerified,
  isVerificationSuccess,
  submitSourceVerification,
  verifyContract,
} from './submit'

const USAGE = `evm-verify-explorer

  --release <${RELEASES.join('|')}>  release in @upsideos/evm-rwa-artifacts
  --contract <Name>                  contract to verify
  --address <0x...>                  deployed address
  --chain-id <id>                    chain the contract is deployed on
  --api-key <key>                    explorer API key (or EXPLORER_API_KEY)

Optional:
  --constructor-args <json>          JSON array of constructor arguments
  --constructor-arguments <hex>      already-encoded arguments, no 0x
  --bundle <path>                    standard-json bundle instead of --release
  --abi <path>                       ABI file instead of --release
  --contract-name <fq>               fully qualified name, with --bundle
  --releases-dir <path>              release directories, when not installed
  --api-url <url>                    explorer endpoint, overrides --chain-id
  --poll-delay <seconds>             default 120
  --max-attempts <n>                 default 15
  --no-wait                          submit and print the GUID, do not poll
`

type Flags = Record<string, string | boolean>

export function parseArgs(argv: string[]): Flags {
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }
  return flags
}

function required(flags: Flags, name: string): string {
  const value = flags[name]
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing --${name}`)
  }
  return value
}

function optional(flags: Flags, name: string): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

interface Target {
  bundle: VerificationBundle
  contractName: string
  abi: readonly unknown[]
}

function resolveTarget(flags: Flags): Target {
  const bundlePath = optional(flags, 'bundle')
  if (bundlePath !== undefined) {
    const abiPath = optional(flags, 'abi')
    return {
      bundle: JSON.parse(
        readFileSync(bundlePath, 'utf8'),
      ) as VerificationBundle,
      contractName: required(flags, 'contract-name'),
      abi:
        abiPath === undefined
          ? []
          : (JSON.parse(readFileSync(abiPath, 'utf8')) as unknown[]),
    }
  }

  const release = required(flags, 'release') as ReleaseKey
  if (!RELEASES.includes(release)) {
    throw new Error(`Unknown release ${release}. Known: ${RELEASES.join(', ')}`)
  }
  const source = { releasesDir: optional(flags, 'releases-dir') }
  const contract = loadReleaseContract(
    release,
    required(flags, 'contract'),
    source,
  )
  return {
    bundle: loadReleaseBundle(release, source),
    contractName: contract.fullyQualifiedName,
    abi: contract.abi,
  }
}

export async function main(argv: string[]): Promise<number> {
  const flags = parseArgs(argv)
  if (flags.help === true || argv.length === 0) {
    console.log(USAGE)
    return 0
  }

  const target = resolveTarget(flags)
  const constructorArgsJson = optional(flags, 'constructor-args')
  const pollDelay = optional(flags, 'poll-delay')
  const maxAttempts = optional(flags, 'max-attempts')

  const params = {
    apiKey: optional(flags, 'api-key') ?? process.env.EXPLORER_API_KEY ?? '',
    chainId: required(flags, 'chain-id'),
    contractAddress: required(flags, 'address'),
    contractName: target.contractName,
    bundle: target.bundle,
    abi: target.abi,
    constructorArgs:
      constructorArgsJson === undefined
        ? undefined
        : (JSON.parse(constructorArgsJson) as unknown[]),
    constructorArguments: optional(flags, 'constructor-arguments'),
    apiUrl: optional(flags, 'api-url'),
  }

  if (flags['no-wait'] === true) {
    const submitted = await submitSourceVerification(params)
    const ok = isAlreadyVerified(submitted) || isVerificationSuccess(submitted)
    console.log(
      ok
        ? `OK: ${submitted.result ?? submitted.message ?? 'verified'}`
        : `submitted, guid: ${submitted.result ?? '(none)'}`,
    )
    return 0
  }

  const result = await verifyContract({
    ...params,
    pollDelaySeconds: pollDelay === undefined ? undefined : Number(pollDelay),
    maxAttempts: maxAttempts === undefined ? undefined : Number(maxAttempts),
    onStatus: (status, attempt) => {
      console.log(`poll ${attempt}: ${status.result ?? status.message ?? ''}`)
    },
  })

  console.log(result.ok ? `OK: ${result.message}` : `FAILED: ${result.message}`)
  if (result.guid !== undefined) {
    console.log(`guid: ${result.guid}`)
  }
  return result.ok ? 0 : 1
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then(code => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
