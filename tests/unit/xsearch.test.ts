import { describe, expect, it } from 'vitest';
import { resolveInstance } from '../../config/schema';
import depot from '../../instances/depot.json';
import registry from '../../config/sources.json';
import fixture from '../fixtures/xsearch.json';
import { parseXsearch } from '../../modern/src/search/adapters/xsearch';
import { queryUrl } from '../../modern/src/search/urls';
import { readQuery, searchHash } from '../../modern/src/app/location';

const source = resolveInstance(depot, registry).sources[0];
if (source.adapter !== 'libris-xsearch') throw new Error('Expected Xsearch fixture source');

describe('Libris Xsearch adapter', () => {
  it('normalizes hits and preserves partial totals and source identity', () => {
    const result = parseXsearch(JSON.stringify(fixture), source, 'räv & bok');
    expect(result.totalHits).toBe(3);
    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]).toEqual({
      title: 'Vinterboken', author: 'Anna Exempel', year: '2020', type: 'Bok',
      url: 'https://libris.kb.se/bib/example-winter', sourceId: 'umea-depot',
    });
    expect(new URL(result.catalogueUrl).searchParams.get('q')).toBe('räv & bok bib:umdp');
  });

  it('distinguishes zero from unknown totals', () => {
    expect(parseXsearch('{"xsearch":{"records":0}}', source, 'book').totalHits).toBe(0);
    expect(parseXsearch('{"xsearch":{"list":[]}}', source, 'book').totalHits).toBeNull();
  });

  it('normalizes array-valued metadata used by the live endpoint', () => {
    const result = parseXsearch(JSON.stringify({
      xsearch: {
        records: 1,
        list: [{
          title: 'Example', creator: ['Author A', 'Author B'], date: ['cop. 2008', '2008'],
          identifier: 'https://libris.kb.se/bib/example',
        }],
      },
    }), source, 'book');
    expect(result.hits[0].year).toBe('cop. 2008; 2008');
    expect(result.hits[0].author).toBe('Author A; Author B');
  });

  it('reports malformed data rather than returning a success-shaped empty result', () => {
    expect(() => parseXsearch('<html>Error</html>', source, 'book')).toThrow('giltig JSON');
    for (const content of ['{}', '{"xsearch":{"records":10}}', '{"xsearch":{"records":-1,"list":[]}}']) {
      expect(() => parseXsearch(content, source, 'book')).toThrow('oväntat svarsformat');
    }
    expect(() => parseXsearch(JSON.stringify({
      xsearch: { list: [{ title: 'Bad URL', identifier: 'javascript:alert(1)' }] },
    }), source, 'book')).toThrow('oväntat svarsformat');
  });

  it('encodes queries once without allowing query parameter injection', () => {
    const url = new URL(queryUrl(source.searchUrl, 'a & b + å'));
    expect(url.searchParams.get('query')).toBe('a & b + å AND bibl:umdp');
    expect([...url.searchParams.keys()]).toEqual(['query', 'format', 'holdings', 'n']);
  });
});

describe('static search links', () => {
  it('roundtrips Unicode queries and accepts existing Ember search links', () => {
    expect(readQuery(searchHash('räv & bok +'))).toBe('räv & bok +');
    expect(readQuery('#/search?query=tolkien')).toBe('tolkien');
    expect(readQuery('#catalogues')).toBe('');
    expect(readQuery('')).toBe('');
  });
});
