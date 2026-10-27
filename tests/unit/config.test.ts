import { describe, expect, it } from 'vitest';
import { resolveInstance } from '../../config/schema';
import halland from '../../instances/halland.json';
import depot from '../../instances/depot.json';
import registry from '../../config/sources.json';

describe('instance configuration', () => {
  it('resolves exactly the sources included by each instance', () => {
    expect(resolveInstance(halland, registry).sources.map((source) => source.id))
      .toEqual(['halmstad-university', 'falkenberg', 'hylte', 'umea-depot', 'goteborg', 'malmo']);
    expect(resolveInstance(depot, registry).sources.map((source) => source.id)).toEqual(['umea-depot']);
  });

  it('rejects unknown sources, invalid defaults, duplicate groups and duplicate entries', () => {
    expect(() => resolveInstance({
      ...halland, sourceGroups: [{ id: 'test', label: 'Test', sources: ['missing'] }],
    }, registry)).toThrow('Unknown source "missing"');
    expect(() => resolveInstance({ ...depot, defaultSelectedSources: ['halmstad-university'] }, registry))
      .toThrow('not included');
    expect(() => resolveInstance({ ...depot, sourceGroups: [depot.sourceGroups[0], depot.sourceGroups[0]] }, registry))
      .toThrow('duplicate group');
    expect(() => resolveInstance({
      ...depot, sourceGroups: [{ ...depot.sourceGroups[0], sources: ['umea-depot', 'umea-depot'] }],
    }, registry)).toThrow('duplicate source');
    expect(() => resolveInstance({ ...depot, defaultSelectedSources: ['umea-depot', 'umea-depot'] }, registry))
      .toThrow('duplicate default');
  });

  it('deduplicates one source displayed in separate groups', () => {
    const config = resolveInstance({
      ...depot, sourceGroups: [...depot.sourceGroups, { ...depot.sourceGroups[0], id: 'another' }],
    }, registry);
    expect(config.sources).toHaveLength(1);
  });

  it('rejects unsafe URLs, unknown adapters, typos and path traversal', () => {
    expect(() => resolveInstance({ ...depot, theme: '../other' }, registry)).toThrow();
    expect(() => resolveInstance({ ...depot, typo: 'value' }, registry)).toThrow();
    expect(() => resolveInstance({ ...depot, proxy: { ...depot.proxy, url: 'javascript:alert(1)' } }, registry)).toThrow();
    expect(() => resolveInstance({
      ...depot, proxy: { ...depot.proxy, url: 'https://user:secret@example.org/' },
    }, registry)).toThrow();
    expect(() => resolveInstance(depot, {
      ...registry, 'umea-depot': { ...registry['umea-depot'], adapter: 'unknown' },
    })).toThrow();
    expect(() => resolveInstance(depot, {
      ...registry, 'umea-depot': { ...registry['umea-depot'], searchUrl: 'https://example.org/' },
    })).toThrow('must contain');
  });

  it('validates Vega settings without requiring Xsearch-specific fields', () => {
    expect(resolveInstance(halland, registry).sources.find((source) => source.id === 'goteborg'))
      .toMatchObject({ adapter: 'vega', customerDomain: 'gsb.eu.iiivega.com', pageSize: 40 });
    for (const change of [
      { apiUrl: 'javascript:alert(1)' }, { customerDomain: 'https://gsb.eu.iiivega.com/' },
      { customerDomain: '' }, { pageSize: 0 }, { pageSize: 41 }, { pageSize: 1.5 },
      { apiUrl: undefined }, { customerDomain: undefined },
      { searchUrl: 'https://example.org/?q=@QUERY@' },
    ]) {
      expect(() => resolveInstance(halland, {
        ...registry, goteborg: { ...registry.goteborg, ...change },
      })).toThrow();
    }
  });

  it('validates Koha URL templates and encoding', () => {
    expect(resolveInstance(halland, registry).sources.find((source) => source.id === 'falkenberg'))
      .toMatchObject({ adapter: 'koha', encoding: 'utf-8' });
    for (const change of [
      { searchUrl: 'https://example.org/' }, { catalogueUrl: 'javascript:alert(1)' },
      { encoding: 'unknown' }, { searchUrl: undefined }, { apiUrl: 'https://example.org/' },
    ]) {
      expect(() => resolveInstance(halland, {
        ...registry, falkenberg: { ...registry.falkenberg, ...change },
      })).toThrow();
    }
  });
});
