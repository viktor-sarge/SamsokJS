import { z } from 'zod';
import type { Instance, Source } from '../../../../config/schema';
import type { SearchResult } from '../types';
import { requestPage } from '../transport';
import { queryUrl } from '../urls';
import type { DiagnosticTrace } from '../diagnostics';

type StockholmSource = Extract<Source, { adapter: 'stockholm' }>;

const responseSchema = z.object({
  errors: z.array(z.unknown()).optional(),
  data: z.object({
    searchWithFilter: z.object({
      totalHits: z.number().int().nonnegative().refine(Number.isSafeInteger),
      groupedMedia: z.array(z.object({
        mediaList: z.array(z.object({
          key: z.string().trim().min(1),
          title: z.string().trim().min(1),
          author: z.string().nullish(),
          mediaTypeDisplay: z.string().nullish(),
          publishedDate: z.string().nullish(),
        })).nullable(),
      })),
    }),
  }),
}).refine((value) => !value.errors?.length);

export function parseStockholm(data: unknown, source: StockholmSource, query: string): SearchResult {
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) throw new Error('Stockholm returnerade ett oväntat eller ofullständigt GraphQL-svar.');
  const result = parsed.data.data.searchWithFilter;
  const items = result.groupedMedia.flatMap((group) => group.mediaList ?? []);
  if (result.totalHits < items.length || (result.totalHits > 0 && !items.length)) {
    throw new Error('Stockholm returnerade ett ofullständigt söksvar.');
  }
  return {
    totalHits: result.totalHits,
    catalogueUrl: queryUrl(source.catalogueUrl, query),
    hits: items.map((item) => ({
      sourceId: source.id, title: item.title, author: item.author?.trim() || undefined,
      type: item.mediaTypeDisplay || undefined,
      year: item.publishedDate?.match(/\d{4}/)?.[0],
      url: new URL(`/titel/${encodeURIComponent(item.key)}`, source.catalogueUrl).href,
    })),
  };
}

export async function searchStockholm(
  source: StockholmSource, query: string, proxy: Instance['proxy'], signal: AbortSignal,
  trace?: DiagnosticTrace,
): Promise<SearchResult> {
  const catalogueUrl = queryUrl(source.catalogueUrl, query);
  const response = await requestPage(source.apiUrl, 'utf-8', proxy, signal, {
    trace,
    post: {
      data: {
        query: 'query searchWithFilter($filterQuery: SearchWithFilterInput!) { searchWithFilter(filterQuery: $filterQuery) { totalHits groupedMedia { mediaList { key title author mediaTypeDisplay publishedDate } } } }',
        variables: { filterQuery: { query, rows: source.pageSize }, __operation: 'search' },
      },
      headers: { Accept: '*/*', Origin: new URL(catalogueUrl).origin, Referer: catalogueUrl },
    },
  });
  const parse = () => {
    let data: unknown;
    try { data = JSON.parse(response.content); }
    catch { throw new Error('Stockholm returnerade inte giltig JSON.'); }
    return parseStockholm(data, source, query);
  };
  return trace ? trace.parse(parse) : parse();
}
