import { z } from 'zod';
import { httpUrlSchema } from '../../../config/schema';
import type { Instance, Source } from '../../../config/schema';
import type { SearchResult } from './types';
import { requestContent } from './transport';
import { queryUrl } from './urls';

const optionalText = z.union([z.string(), z.array(z.string())]).nullish()
  .transform((value) => Array.isArray(value) ? value.join('; ') : value ?? undefined);
const totalSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/).transform(Number),
]).refine(Number.isSafeInteger);

const responseSchema = z.object({
  xsearch: z.object({
    records: totalSchema.nullish(),
    list: z.array(z.object({
      title: z.string().trim().min(1),
      creator: optionalText,
      type: optionalText,
      date: optionalText,
      identifier: httpUrlSchema,
    })).optional(),
  }).refine(
    (value) => value.list !== undefined || value.records === 0,
    'Missing result list',
  ),
});

export function parseXsearch(content: string, source: Source, query: string): SearchResult {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Libris returnerade inte giltig JSON.');
  }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Libris returnerade ett oväntat svarsformat.');
  }
  const result = parsed.data.xsearch;
  return {
    totalHits: result.records ?? null,
    catalogueUrl: queryUrl(source.catalogueUrl, query),
    hits: (result.list ?? []).map((item) => ({
      title: item.title,
      author: item.creator,
      year: item.date,
      type: item.type,
      url: item.identifier,
      sourceId: source.id,
    })),
  };
}

export async function searchXsearch(
  source: Extract<Source, { adapter: 'libris-xsearch' }>,
  query: string,
  proxy: Instance['proxy'],
  signal: AbortSignal,
): Promise<SearchResult> {
  const content = await requestContent(queryUrl(source.searchUrl, query), source.encoding, proxy, signal);
  return parseXsearch(content, source, query);
}
