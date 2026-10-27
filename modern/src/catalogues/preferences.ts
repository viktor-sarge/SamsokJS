import { z } from 'zod';
import type { Instance } from '../../../config/schema';

const selectionSchema = z.array(z.string());
const key = (instance: Instance) => `samsok:${instance.id}:selected-sources:v1`;
const favoritesKey = (instance: Instance) => `samsok:${instance.id}:source-favorites:v1`;
const favoritesSchema = z.array(z.object({
  name: z.string().trim().min(1).max(80),
  selected: selectionSchema,
}));
export type SourceFavorite = z.infer<typeof favoritesSchema>[number];

export function favoriteNameKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv');
}

function availableSelection(instance: Instance, selected: string[]): string[] {
  const available = new Set(instance.sources.map((source) => source.id));
  return [...new Set(selected.filter((id) => available.has(id)))];
}

export function loadSelection(instance: Instance): { selected: string[]; warning?: string } {
  try {
    const saved = localStorage.getItem(key(instance));
    const selection = saved === null ? instance.defaultSelectedSources : selectionSchema.parse(JSON.parse(saved));
    return { selected: availableSelection(instance, selection) };
  } catch (error) {
    console.warn('Could not read Samsok catalogue preferences', error);
    return {
      selected: instance.defaultSelectedSources,
      warning: 'Dina sparade katalogval kunde inte läsas. Standardvalen används.',
    };
  }

}

export function loadFavorites(instance: Instance): { favorites: SourceFavorite[]; warning?: string } {
  try {
    const saved = localStorage.getItem(favoritesKey(instance));
    const favorites = saved === null ? [] : favoritesSchema.parse(JSON.parse(saved));
    if (new Set(favorites.map((favorite) => favoriteNameKey(favorite.name))).size !== favorites.length) {
      throw new Error('Duplicate catalogue favorite names');
    }
    return { favorites: favorites.map((favorite) => ({
      ...favorite, selected: availableSelection(instance, favorite.selected),
    })) };
  } catch (error) {
    console.warn('Could not read Samsok catalogue favorites', error);
    return { favorites: [], warning: 'Dina favoriter kunde inte läsas i den här webbläsaren.' };
  }
}

export function saveFavorites(instance: Instance, favorites: SourceFavorite[]): string | undefined {
  try {
    localStorage.setItem(favoritesKey(instance), JSON.stringify(favoritesSchema.parse(favorites)));
    return undefined;
  } catch (error) {
    console.warn('Could not save Samsok catalogue favorites', error);
    return 'Ändringen av dina favoriter kunde inte sparas. Försök igen.';
  }
}

export function saveSelection(instance: Instance, selected: string[]): string | undefined {
  try {
    localStorage.setItem(key(instance), JSON.stringify(selected));
    return undefined;
  } catch (error) {
    console.warn('Could not save Samsok catalogue preferences', error);
    return 'Katalogvalet gäller nu, men kunde inte sparas i den här webbläsaren.';
  }
}
