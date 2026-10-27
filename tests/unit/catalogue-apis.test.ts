import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveInstance } from '../../config/schema';
import halland from '../../instances/halland.json';
import registry from '../../config/sources.json';
import stockholmFixture from '../fixtures/stockholm.json';
import { parseStockholm } from '../../modern/src/search/stockholm';
import { parseMinaBibliotek } from '../../modern/src/search/mina-bibliotek';

const sources = resolveInstance(halland, registry).sources;
const stockholm = sources.find((source) => source.id === 'stockholm');
const mina = sources.find((source) => source.id === 'mina-bibliotek');
if (!stockholm || stockholm.adapter !== 'stockholm' || !mina || mina.adapter !== 'mina-bibliotek') {
  throw new Error('Expected catalogue API sources');
}
const minaFixture = readFileSync(new URL('../fixtures/mina-bibliotek.txt', import.meta.url), 'utf8');

describe('Stockholm GraphQL', () => {
  it('flattens format groups, permits empty groups, and normalizes metadata', () => {
    const result = parseStockholm(stockholmFixture, stockholm, 'räv & bok +');
    expect(result.totalHits).toBe(12);
    expect(new URL(result.catalogueUrl).searchParams.get('text')).toBe('räv & bok +');
    expect(result.hits).toEqual([
      { sourceId: 'stockholm', title: 'Alfabetet', author: 'Anna Exempel', type: 'Bok', year: '2021',
        url: 'https://biblioteket.stockholm.se/titel/example-1' },
      { sourceId: 'stockholm', title: 'Över bergen', author: undefined, type: 'E-bok', year: undefined,
        url: 'https://biblioteket.stockholm.se/titel/example-2' },
    ]);
  });
  it('accepts explicit empty results, but rejects GraphQL errors and partial/malformed data', () => {
    expect(parseStockholm({ data: { searchWithFilter: { totalHits: 0, groupedMedia: [] } } }, stockholm, 'x').hits).toEqual([]);
    for (const data of [
      { ...stockholmFixture, errors: [{ message: 'Upstream failure' }] }, {},
      { data: { searchWithFilter: { totalHits: 1, groupedMedia: [] } } },
      { data: { searchWithFilter: { totalHits: 0, groupedMedia: stockholmFixture.data.searchWithFilter.groupedMedia } } },
    ]) expect(() => parseStockholm(data, stockholm, 'x')).toThrow();
    for (const change of [{ key: '' }, { title: '' }, { author: [] }]) {
      const data = structuredClone(stockholmFixture);
      Object.assign(data.data.searchWithFilter.groupedMedia[0].mediaList![0], change);
      expect(() => parseStockholm(data, stockholm, 'x')).toThrow();
    }
  });
  it('encodes record keys as data rather than URL paths or fragments', () => {
    const data = structuredClone(stockholmFixture);
    data.data.searchWithFilter.groupedMedia[0].mediaList![0].key = 'x/y?#';
    expect(parseStockholm(data, stockholm, 'x').hits[0].url).toBe('https://biblioteket.stockholm.se/titel/x%2Fy%3F%23');
  });
});

describe('Mina bibliotek SSE', () => {
  it('extracts one search event and normalizes creators and publication years', () => {
    const result = parseMinaBibliotek(minaFixture, mina, 'räv & bok +');
    expect(result.totalHits).toBe(8);
    expect(result.hits[0]).toEqual({
      sourceId: 'mina-bibliotek', title: 'Alfabetet', author: 'Anna Exempel; Bertil Exempel',
      type: 'book', year: '2021', url: 'https://minabibliotek.se/search#/entity/catalogue/example-1',
    });
    expect(result.hits[1]).toMatchObject({ author: 'Cecilia Exempel', year: undefined, type: undefined });
    expect(new URLSearchParams(new URL(result.catalogueUrl).hash.slice(3)).get('q')).toBe('räv & bok +');
  });
  it('supports CRLF, optional spaces, comments and multiline data fields', () => {
    const content = ': keepalive\r\nevent: search\r\ndata: {"totalHits":0,\r\ndata: "hits":[]}\r\n\r\n';
    expect(parseMinaBibliotek(content, mina, 'x')).toMatchObject({ totalHits: 0, hits: [] });
    expect(parseMinaBibliotek('event:search\ndata:{"totalHits":0}\n\n', mina, 'x'))
      .toMatchObject({ totalHits: 0, hits: [] });
  });
  it('does not turn missing, duplicate, malformed or oversized responses into empty successes', () => {
    for (const content of [
      'event:error\ndata:{"error":"unavailable"}\n\n',
      minaFixture + minaFixture, 'event:search\ndata:invalid\n\n',
      'event:search\ndata:{"totalHits":1,"hits":[]}\n\n',
      'event:search\ndata:{"totalHits":1}\n\n',
      minaFixture.replace('"totalHits":8', '"totalHits":0'),
      minaFixture.replace('"id":"example-1"', '"id":""'),
      minaFixture.replace('"name":"Alfabetet"', '"name":""'),
      'x'.repeat(2_000_001),
    ]) expect(() => parseMinaBibliotek(content, mina, 'x')).toThrow();
  });
  it('encodes record IDs within the catalogue fragment', () => {
    const result = parseMinaBibliotek(minaFixture.replace('"example-1"', '"x/y?#"'), mina, 'x');
    expect(result.hits[0].url).toBe('https://minabibliotek.se/search#/entity/catalogue/x%2Fy%3F%23');
  });
});
