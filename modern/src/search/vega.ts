import { z } from 'zod';
import type { Source } from '../../../config/schema';
import type { SearchResult } from './types';
import { queryUrl } from './urls';

export type VegaSource = Extract<Source, { adapter: 'vega' }>;

const responseSchema = z.object({
  totalResults: z.number().int().nonnegative().refine(Number.isSafeInteger),
  data: z.array(z.object({
    id: z.string().min(1),
    entityType: z.string().min(1),
    title: z.string().trim().min(1),
    primaryAgent: z.object({ label: z.string().nullish() }).nullish(),
    publicationDate: z.string().nullish(),
    materialTabs: z.array(z.object({ name: z.string() })).nullish(),
  })),
}).refine((value) => value.totalResults >= value.data.length);

export function parseVega(data: unknown, source: VegaSource, query: string): SearchResult {
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Vega returnerade ett oväntat svarsformat.');
  }
  return {
    totalHits: parsed.data.totalResults,
    catalogueUrl: queryUrl(source.catalogueUrl, query),
    hits: parsed.data.data.map((item) => {
      const url = new URL('/search/card', source.catalogueUrl);
      url.searchParams.set('id', item.id);
      url.searchParams.set('entityType', item.entityType);
      return {
        title: item.title,
        author: item.primaryAgent?.label
          ?.replace(/, \d{4}-\d{4}\.?$/, '')
          .replace(/, \d{4}-\.?$/, '')
          .replace(/\([^)]+\)/, '').trim(),
        year: item.publicationDate?.split('-')[0],
        type: item.materialTabs?.map((tab) => tab.name).join(', '),
        url: url.href,
        sourceId: source.id,
      };
    }),
  };
}

export async function searchVega(
  source: VegaSource,
  query: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<SearchResult> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const requestSignal = AbortSignal.any([signal, deadline]);
  try {
    const response = await fetch(source.apiUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: requestSignal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Api-Version': '2',
        'iii-customer-domain': source.customerDomain,
        'iii-host-domain': new URL(source.catalogueUrl).host,
      },
      body: JSON.stringify({
        searchText: query,
        sorting: 'relevance',
        sortOrder: 'asc',
        searchType: 'everything',
        pageNum: 0,
        pageSize: source.pageSize,
        resourceType: 'FormatGroup',
      }),
    });
    if (!response.ok) {
      throw new Error(`Vega returnerade HTTP ${response.status}. Försök igen eller öppna katalogen.`);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (requestSignal.aborted) throw error;
      throw new Error('Vega returnerade inte giltig JSON.');
    }
    return parseVega(data, source, query);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (deadline.aborted) throw new Error('Katalogen svarade inte i tid. Försök igen.');
    if (error instanceof TypeError) {
      throw new Error('Kunde inte kontakta Vega. Kontrollera anslutningen eller öppna katalogen.');
    }
    throw error;
  }
}
