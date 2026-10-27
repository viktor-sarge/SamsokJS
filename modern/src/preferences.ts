import { z } from 'zod';
import type { Instance } from '../../config/schema';

const selectionSchema = z.array(z.string());
const key = (instance: Instance) => `samsok:${instance.id}:selected-sources:v1`;

export function loadSelection(instance: Instance): { selected: string[]; warning?: string } {
  try {
    const saved = localStorage.getItem(key(instance));
    const selection = saved === null ? instance.defaultSelectedSources : selectionSchema.parse(JSON.parse(saved));
    const available = new Set(instance.sources.map((source) => source.id));
    return { selected: [...new Set(selection.filter((id) => available.has(id)))] };
  } catch (error) {
    console.warn('Could not read Samsok catalogue preferences', error);
    return {
      selected: instance.defaultSelectedSources,
      warning: 'Dina sparade katalogval kunde inte läsas. Standardvalen används.',
    };
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
