import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceSchema } from '../../config/schema';
import registry from '../../config/sources.json';
import fixture from '../fixtures/vega.json';
import { parseVega, searchVega } from '../../modern/src/search/vega';
import type { VegaSource } from '../../modern/src/search/vega';
import { searchSource } from '../../modern/src/search/adapters';

const parsed = sourceSchema.parse(registry.goteborg);
if (parsed.adapter !== 'vega') throw new Error('Expected Vega fixture source');
const source: VegaSource = { ...parsed, id: 'goteborg' };
const proxy = { url: 'https://proxy.example.org/', protocol: 'legacy-jsonp', timeoutMs: 30000 } as const;
const signal = () => new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Vega result parsing', () => {
  it('normalizes metadata, partial totals and catalogue/card URLs', () => {
    const result = parseVega(fixture, source, 'räv & bok +');
    expect(result.totalHits).toBe(7);
    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]).toEqual({
      title: 'Vinterboken',
      author: 'Exempel, Anna',
      year: '2002',
      type: 'Book, E-book',
      url: 'https://bibliotek.goteborg.se/search/card?id=example-winter&entityType=FormatGroup',
      sourceId: 'goteborg',
    });
    expect(new URL(result.catalogueUrl).searchParams.get('query')).toBe('räv & bok +');
    expect(result.hits[1].author).toBeUndefined();
  });

  it('supports empty results and null/absent optional metadata', () => {
    expect(parseVega({ totalResults: 0, data: [] }, source, 'book').hits).toEqual([]);
    const result = parseVega({
      totalResults: 1,
      data: [{ id: 'one', title: 'Example', entityType: 'FormatGroup', primaryAgent: null,
        publicationDate: null, materialTabs: null }],
    }, source, 'book');
    expect(result.hits[0].author).toBeUndefined();
    expect(result.hits[0].year).toBeUndefined();
    expect(result.hits[0].type).toBeUndefined();
  });

  it('escapes card parameters and uses the correct tenant catalogue', () => {
    const malmo: VegaSource = { ...source, id: 'malmo', ...registry.malmo, adapter: 'vega' };
    const result = parseVega({
      totalResults: 1,
      data: [{ id: 'id & query=bad', title: 'Example', entityType: 'FormatGroup&other=1' }],
    }, malmo, 'book');
    const url = new URL(result.hits[0].url);
    expect(url.origin).toBe('https://malin.malmo.se');
    expect([...url.searchParams]).toEqual([['id', 'id & query=bad'], ['entityType', 'FormatGroup&other=1']]);
  });

  it.each([
    null, {}, { totalResults: 0 }, { data: [] }, { totalResults: -1, data: [] },
    { totalResults: '7', data: [] },
    { totalResults: 1, data: [{ title: 'Missing identifiers' }] },
    { totalResults: 0, data: fixture.data },
    { totalResults: 1, data: [{ id: 'one', title: ' ', entityType: 'FormatGroup' }] },
  ])('reports unexpected API data explicitly: %j', (data) => {
    expect(() => parseVega(data, source, 'book')).toThrow('oväntat svarsformat');
  });
});

describe('Vega requests', () => {
  it('dispatches through direct CORS POST with tenant headers and raw Unicode query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchSource(source, 'räv & bok +', proxy, signal())).resolves.toMatchObject({ totalHits: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(source.apiUrl);
    expect(init).toMatchObject({
      method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/json', 'Accept': 'application/json', 'Api-Version': '2',
        'iii-customer-domain': 'gsb.eu.iiivega.com', 'iii-host-domain': 'bibliotek.goteborg.se',
      },
    });
    expect(JSON.parse(init.body)).toEqual({
      searchText: 'räv & bok +', sorting: 'relevance', sortOrder: 'asc', searchType: 'everything',
      pageNum: 0, pageSize: 40, resourceType: 'FormatGroup',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('honors configured result limits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"totalResults":0,"data":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    await searchVega({ ...source, pageSize: 10 }, 'book', 30000, signal());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).pageSize).toBe(10);
  });

  it('reports HTTP, network, JSON and response-schema failures distinctly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('<html>Error</html>'))
      .mockResolvedValueOnce(new Response('{"error":"unavailable"}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchVega(source, 'book', 30000, signal())).rejects.toThrow('HTTP 503');
    await expect(searchVega(source, 'book', 30000, signal())).rejects.toThrow('Kunde inte kontakta Vega');
    await expect(searchVega(source, 'book', 30000, signal())).rejects.toThrow('inte giltig JSON');
    await expect(searchVega(source, 'book', 30000, signal())).rejects.toThrow('oväntat svarsformat');
  });

  it('aborts an in-flight request when the caller cancels', async () => {
    let onStart!: (signal: AbortSignal) => void;
    const started = new Promise<AbortSignal>((resolve) => { onStart = resolve; });
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init.signal!;
      onStart(signal);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })));
    const controller = new AbortController();
    const pending = searchVega(source, 'book', 30000, controller.signal);
    const requestSignal = await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal.aborted).toBe(true);
  });

  it('applies the deadline to reading the response body as well as receiving headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      }),
    })));
    await expect(searchVega(source, 'book', 20, signal())).rejects.toThrow('svarade inte i tid');
  });
});
