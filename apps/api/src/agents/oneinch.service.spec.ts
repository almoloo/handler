import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import { OneInchService } from './oneinch.service.js';

const WALLET: Address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';

function mockFetch(response: Partial<Response> & { json?: () => unknown }) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({}),
    ...response,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.RILEY_SESSION_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  process.env.ONEINCH_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.RILEY_SESSION_KEY;
  delete process.env.ONEINCH_API_KEY;
  vi.unstubAllGlobals();
});

describe('OneInchService', () => {
  it('builds the quote request from the wallet address, not a session key', async () => {
    const fetchMock = mockFetch({
      json: async () => ({
        tx: { to: '0xrouter', data: '0xdead', value: '1000' },
      }),
    });

    const service = new OneInchService();
    const quote = await service.getSwapQuote(WALLET);

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('from')).toBe(WALLET);
    expect(requestedUrl.pathname).toContain('/swap/v6.0/8453/swap');
    expect(quote).toEqual({
      to: '0xrouter',
      data: '0xdead',
      value: 1000n,
      raw: { tx: { to: '0xrouter', data: '0xdead', value: '1000' } },
    });
  });

  it('sends the API key as a bearer token', async () => {
    const fetchMock = mockFetch({ json: async () => ({ tx: { to: '0x', data: '0x', value: '0' } }) });
    await new OneInchService().getSwapQuote(WALLET);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key',
    );
  });

  it('throws on a non-2xx response, with no fallback quote', async () => {
    mockFetch({ ok: false, status: 400, text: async () => 'bad request' });
    const service = new OneInchService();
    await expect(service.getSwapQuote(WALLET)).rejects.toThrow(
      /1inch swap quote failed: 400/,
    );
  });
});
