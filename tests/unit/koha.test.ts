import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { sourceSchema } from '../../config/schema';
import registry from '../../config/sources.json';
import { inspectKoha, solveAnubis } from '../../modern/src/search/adapters/koha/koha-parser';
import { waitForChallenge } from '../../modern/src/search/adapters/koha/koha';

const config = sourceSchema.parse(registry.falkenberg);
if (config.adapter !== 'koha') throw new Error('Expected Koha fixture');
const source = { ...config, id: 'falkenberg' };
const url = 'https://bibliotekskatalog.falkenberg.se/cgi-bin/koha/opac-search.pl?q=book';
const results = readFileSync(new URL('../fixtures/koha-results.html', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../fixtures/koha-detail.html', import.meta.url), 'utf8');
const challenge = { rules: { algorithm: 'fast', difficulty: 1 }, challenge: { id: 'test-id', randomData: 'test-data' } } as const;
const challengeHtml = (data: unknown, prefix = '') =>
  `<script id="anubis_challenge" type="application/json">${JSON.stringify(data)}</script>
   <script id="anubis_base_prefix" type="application/json">${JSON.stringify(prefix)}</script>`;

describe('Koha HTML parsing', () => {
  it('extracts modern and legacy metadata, localized totals and relative URLs', () => {
    const page = inspectKoha(results, source, url);
    expect(page.kind).toBe('results');
    if (page.kind !== 'results') throw new Error('Expected results');
    expect(page.result.totalHits).toBe(1234);
    expect(page.result.hits).toEqual([
      { title: 'Vinter & vår', author: 'Anna Exempel; Bo Exempel', year: '2020', type: 'Text',
        sourceId: 'falkenberg', url: 'https://bibliotekskatalog.falkenberg.se/cgi-bin/koha/opac-detail.pl?biblionumber=12' },
      { title: 'Alfabetet', author: 'Bo Exempel', year: '2019', type: 'Bok',
        sourceId: 'falkenberg', url: 'https://bibliotekskatalog.falkenberg.se/cgi-bin/koha/opac-detail.pl?biblionumber=13' },
    ]);
  });
  it('parses detail pages and uses the resolved record URL', () => {
    const page = inspectKoha(detail, source, url);
    if (page.kind !== 'results') throw new Error('Expected results');
    expect(page.result.hits[0]).toMatchObject({ title: 'Vinterboken', author: 'Anna Exempel', type: 'Bok', year: '2020' });
    expect(page.result.totalHits).toBe(1);
    const resolved = 'https://bibliotekskatalog.falkenberg.se/cgi-bin/koha/opac-detail.pl?biblionumber=12';
    const noLink = inspectKoha('<h1 class="title">Example</h1>', source, resolved);
    if (noLink.kind !== 'results') throw new Error('Expected results');
    expect(noLink.result.hits[0].url).toBe(resolved);
  });
  it('distinguishes known empty results from unknown HTML or missing totals', () => {
    expect(inspectKoha('<h1 id="numresults">Inga resultat hittades!</h1>', source, url))
      .toMatchObject({ kind: 'results', result: { totalHits: 0, hits: [] } });
    expect(inspectKoha('<h1 id="numresults">No results found!</h1>', source, url))
      .toMatchObject({ kind: 'results', result: { totalHits: 0, hits: [] } });
    expect(inspectKoha(results.replace(/<h1[\s\S]*?<\/h1>/, ''), source, url))
      .toMatchObject({ kind: 'results', result: { totalHits: null } });
    expect(() => inspectKoha('<h1>Maintenance</h1>', source, url)).toThrow('okänt svarsformat');
    expect(() => inspectKoha('<h1 id="numresults">10 results</h1>', source, url)).toThrow();
  });
  it('rejects oversized, incomplete and unsafe result data', () => {
    expect(() => inspectKoha('x'.repeat(2_000_001), source, url)).toThrow('för stort');
    expect(() => inspectKoha(results.replace('href="/cgi-bin/koha/opac-detail.pl?biblionumber=12"', ''), source, url))
      .toThrow('ofullständig');
    expect(() => inspectKoha(results.replace('/cgi-bin/koha/opac-detail.pl?biblionumber=12', 'javascript:alert(1)'), source, url))
      .toThrow('ogiltig postlänk');
  });
  it('detects the verified Koha cookie page without executing scripts', () => {
    expect(inspectKoha('<script src="/koha_fast_challenge/index.js"></script><div class="loading-overlay"></div>', source, url))
      .toEqual({ kind: 'cookie' });
  });
});

describe('Anubis challenge handling', () => {
  it('extracts challenge data and permits only local base prefixes', () => {
    expect(inspectKoha(challengeHtml(challenge, '/catalogue'), source, url))
      .toEqual({ kind: 'anubis', challenge, prefix: '/catalogue' });
    for (const prefix of ['//evil.example', 'https://evil.example', '/../elsewhere']) {
      expect(() => inspectKoha(challengeHtml(challenge, prefix), source, url)).toThrow('stöds inte');
    }
  });
  it('rejects unsupported algorithms, excessive difficulty and invalid JSON', () => {
    for (const rules of [{ algorithm: 'unknown', difficulty: 1 }, { algorithm: 'fast', difficulty: 7 }]) {
      expect(() => inspectKoha(challengeHtml({ ...challenge, rules }), source, url)).toThrow('stöds inte');
    }
    expect(() => inspectKoha('<script id="anubis_challenge">{</script>', source, url)).toThrow('ogiltiga');
  });
  it('produces a real SHA-256 proof with the required leading zero nibbles', async () => {
    const solution = await solveAnubis(challenge);
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge.challenge.randomData + solution.nonce));
    const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(solution.hash).toBe(hash);
    expect(hash.startsWith('0')).toBe(true);
    expect(solution.nonce).toBeLessThan(500000);
  });
  it('supports cancellation before and during a timed challenge', async () => {
    const controller = new AbortController();
    const pending = waitForChallenge(10000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(waitForChallenge(10000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('stops proof-of-work at the time budget rather than running indefinitely', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(15001);
    try {
      await expect(solveAnubis(challenge)).rejects.toThrow('beräkningsgränsen');
    } finally {
      clock.mockRestore();
    }
  });
});
