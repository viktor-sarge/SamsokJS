import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { favoriteNameKey, loadFavorites, saveFavorites } from '../../modern/src/catalogues/preferences';
import { resolveInstance } from '../../config/schema';
import halland from '../../instances/halland.json';
import depot from '../../instances/depot.json';
import registry from '../../config/sources.json';

const instance = resolveInstance(halland, registry);
const other = resolveInstance(depot, registry);
const key = 'samsok:halland:source-favorites:v1';
let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('source favorites', () => {
  it('stores selections per instance without queries and retains empty selections', () => {
    const favorites = [{ name: 'Bibliotek', selected: ['umea-depot'] }, { name: 'Inga', selected: [] }];
    expect(saveFavorites(instance, favorites)).toBeUndefined();
    expect(loadFavorites(instance)).toEqual({ favorites });
    expect(loadFavorites(other)).toEqual({ favorites: [] });
    expect(JSON.parse(storage.get(key)!)).toEqual(favorites);
  });
  it('ignores removed and duplicate source IDs without adding new sources', () => {
    storage.set(key, JSON.stringify([{ name: 'Val', selected: ['umea-depot', 'gone', 'umea-depot'] }]));
    expect(loadFavorites(instance)).toEqual({ favorites: [{ name: 'Val', selected: ['umea-depot'] }] });
  });
  it('normalizes names for unique-name matching', () => {
    expect(favoriteNameKey('  MINA   FAVORITER Å ')).toBe(favoriteNameKey('mina favoriter A\u030a'));
  });
  it('reports corrupt and duplicate data explicitly', () => {
    for (const data of ['bad', '{}', '[{"name":"","selected":[]}]', JSON.stringify([
      { name: 'Val', selected: [] }, { name: ' VAL ', selected: [] },
    ])]) {
      storage.set(key, data);
      expect(loadFavorites(instance)).toMatchObject({ favorites: [], warning: expect.any(String) });
    }
    expect(console.warn).toHaveBeenCalledTimes(4);
  });
  it('reports blocked reads and failed writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Blocked'); },
      setItem: () => { throw new Error('Full'); },
    });
    expect(loadFavorites(instance).warning).toContain('kunde inte läsas');
    expect(saveFavorites(instance, [])).toContain('kunde inte sparas');
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});
