import { describe, expect, it } from 'vitest';
import { groupHits } from '../../modern/src/search/grouping';
import type { SearchHit } from '../../modern/src/search/types';

const hit: SearchHit = {
  title: 'Vinterboken', author: 'Anna Exempel', year: '2020', type: 'Bok',
  sourceId: 'first', url: 'https://first.example/record',
};

describe('result grouping', () => {
  it('groups matching metadata across libraries, ignoring case, spacing and Unicode composition', () => {
    const first = { ...hit, title: 'Vår bok' };
    const second = { ...hit, title: '  VA\u030aR   BOK ', author: 'ANNA\nEXEMPEL', type: ' BOK ',
      sourceId: 'second', url: 'https://second.example/record' };
    const groups = groupHits([first, second]);
    expect(groups).toHaveLength(1);
    expect(groups[0].hit).toEqual(first);
    expect(groups[0].links).toEqual([
      { sourceId: first.sourceId, url: first.url }, { sourceId: second.sourceId, url: second.url },
    ]);
    expect(first.title).toBe('Vår bok');
  });
  it('keeps different titles, authors, years and formats separate without fuzzy matching', () => {
    const others = [
      { title: 'Vinterboken.' }, { author: 'Exempel, Anna' }, { year: '2021' },
      { type: 'E-bok' }, { type: 'Book' },
    ].map((change) => ({ ...hit, ...change, sourceId: 'second' }));
    expect(groupHits([hit, ...others])).toHaveLength(6);
  });
  it('never merges records with any missing or blank matching field', () => {
    for (const field of ['title', 'author', 'year', 'type'] as const) {
      const incomplete = { ...hit, [field]: ' \n ' };
      expect(groupHits([incomplete, { ...incomplete, sourceId: 'second' }])).toHaveLength(2);
    }
    expect(groupHits([{ ...hit, author: undefined }, { ...hit, author: undefined }])).toHaveLength(2);
  });
  it('deduplicates identical library links but preserves different record URLs and source aliases', () => {
    const groups = groupHits([hit, { ...hit }, { ...hit, url: `${hit.url}/2` }, { ...hit, sourceId: 'alias' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].links).toHaveLength(3);
  });
  it('uses unambiguous keys and preserves first-seen group order', () => {
    const a = { ...hit, title: 'a|b', author: 'c' };
    const b = { ...hit, title: 'a', author: 'b|c' };
    expect(groupHits([a, b]).map((group) => group.hit)).toEqual([a, b]);
    expect(groupHits([])).toEqual([]);
  });
});
