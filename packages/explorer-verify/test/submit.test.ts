import {
  checkVerificationStatus,
  isAlreadyVerified,
  isVerificationPending,
  isVerificationSuccess,
  submitSourceVerification,
  verifyContract,
  type ExplorerApiResult,
  type FetchLike,
} from '../src/submit'

const bundle = {
  solcLongVersion: '0.8.28+commit.7893614a',
  input: {
    language: 'Solidity',
    sources: { 'contracts/Token.sol': { content: 'ok' } },
  },
}

const baseParams = {
  apiKey: 'key',
  chainId: '84532',
  contractAddress: '0xabc',
  contractName: 'contracts/Token.sol:Token',
  bundle,
}

interface Call {
  url: string
  body?: FormData
}

function stubFetch(
  responses: Array<{ ok?: boolean; status?: number; body: ExplorerApiResult }>,
): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  let index = 0
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body })
    const next = responses[Math.min(index, responses.length - 1)]
    index++
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.body,
    }
  }
  return { fetchImpl, calls }
}

describe('submitSourceVerification', () => {
  it('posts the standard-json form to the resolved explorer', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { status: '1', result: 'guid-1' } },
    ])
    const result = await submitSourceVerification({ ...baseParams, fetchImpl })

    expect(result.result).toBe('guid-1')
    expect(calls[0].url).toBe('https://api.etherscan.io/v2/api?chainid=84532')

    const form = calls[0].body!
    expect(form.get('action')).toBe('verifysourcecode')
    expect(form.get('codeformat')).toBe('solidity-standard-json-input')
    expect(form.get('contractname')).toBe('contracts/Token.sol:Token')
    expect(form.get('compilerversion')).toBe('v0.8.28+commit.7893614a')
    expect(form.get('constructorArguments')).toBeNull()
  })

  it('sends pre-encoded constructor arguments unchanged', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { result: 'guid-2' } }])
    await submitSourceVerification({
      ...baseParams,
      constructorArguments: 'beef',
      fetchImpl,
    })
    expect(calls[0].body!.get('constructorArguments')).toBe('beef')
  })

  it('encodes constructor arguments from the ABI', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { result: 'guid-3' } }])
    await submitSourceVerification({
      ...baseParams,
      abi: [{ type: 'constructor', inputs: [{ type: 'uint256' }] }],
      constructorArgs: [1],
      fetchImpl,
    })
    expect(calls[0].body!.get('constructorArguments')).toBe(
      '0000000000000000000000000000000000000000000000000000000000000001',
    )
  })

  it('honours an explicit api url', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { result: 'guid-4' } }])
    await submitSourceVerification({
      ...baseParams,
      apiUrl: 'https://blockscout.test/api',
      fetchImpl,
    })
    expect(calls[0].url).toBe('https://blockscout.test/api')
  })

  it('throws when the explorer rejects the request', async () => {
    const { fetchImpl } = stubFetch([
      { ok: false, status: 429, body: { message: 'rate limited' } },
    ])
    await expect(
      submitSourceVerification({ ...baseParams, fetchImpl }),
    ).rejects.toThrow(/rate limited/)
  })
})

describe('checkVerificationStatus', () => {
  it('builds the status query', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { status: '1', result: 'Pass - Verified' } },
    ])
    await checkVerificationStatus({
      apiKey: 'key',
      chainId: '1',
      guid: 'guid-1',
      fetchImpl,
    })
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('action')).toBe('checkverifystatus')
    expect(url.searchParams.get('guid')).toBe('guid-1')
    expect(url.searchParams.get('chainId')).toBe('1')
  })
})

describe('explorer result helpers', () => {
  it('treats Already Verified and Pass as success', () => {
    expect(isAlreadyVerified({ result: 'Already Verified' })).toBe(true)
    expect(
      isVerificationSuccess({ status: '1', result: 'Pass - Verified' }),
    ).toBe(true)
    expect(isVerificationSuccess({ result: 'Already Verified' })).toBe(true)
    expect(isVerificationPending({ result: 'Pending in queue' })).toBe(true)
    expect(isVerificationPending({ result: 'Fail - Unable to verify' })).toBe(
      false,
    )
    expect(isVerificationSuccess({ status: '0', result: 'Fail' })).toBe(false)
  })
})

describe('verifyContract', () => {
  const noSleep = async (): Promise<void> => {}

  it('returns straight away when the explorer already has the source', async () => {
    const { fetchImpl } = stubFetch([{ body: { result: 'Already Verified' } }])
    const result = await verifyContract({
      ...baseParams,
      fetchImpl,
      sleep: noSleep,
    })
    expect(result.ok).toBe(true)
  })

  it('polls until the explorer passes', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { status: '1', result: 'guid-5' } },
      { body: { result: 'Pending in queue' } },
      { body: { status: '1', result: 'Pass - Verified' } },
    ])
    const result = await verifyContract({
      ...baseParams,
      fetchImpl,
      sleep: noSleep,
    })
    expect(result.ok).toBe(true)
    expect(result.guid).toBe('guid-5')
    expect(calls).toHaveLength(3)
  })

  it('stops on a failure rather than burning the attempts', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { status: '1', result: 'guid-6' } },
      { body: { result: 'Fail - Unable to verify' } },
    ])
    const result = await verifyContract({
      ...baseParams,
      fetchImpl,
      sleep: noSleep,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Unable to verify/)
    expect(calls).toHaveLength(2)
  })

  it('gives up after the attempt cap', async () => {
    const { fetchImpl } = stubFetch([
      { body: { status: '1', result: 'guid-7' } },
      { body: { result: 'Pending in queue' } },
    ])
    const result = await verifyContract({
      ...baseParams,
      fetchImpl,
      sleep: noSleep,
      maxAttempts: 3,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Still pending after 3 polls/)
  })

  it('reports a missing GUID', async () => {
    const { fetchImpl } = stubFetch([{ body: { message: 'bad request' } }])
    const result = await verifyContract({
      ...baseParams,
      fetchImpl,
      sleep: noSleep,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('bad request')
  })
})
