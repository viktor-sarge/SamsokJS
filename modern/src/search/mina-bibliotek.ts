import { z } from 'zod';
import type { Instance, Source } from '../../../config/schema';
import type { SearchResult } from './types';
import { requestContent } from './transport';
import { queryUrl } from './urls';
import type { DiagnosticTrace } from './diagnostics';

type MinaSource = Extract<Source, { adapter: 'mina-bibliotek' }>;
const authorsSchema = z.array(z.object({ value: z.string() }));
const responseSchema = z.object({
  totalHits: z.number().int().nonnegative().refine(Number.isSafeInteger),
  hits: z.array(z.object({
    entity: z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      creator: z.object({ author: authorsSchema.optional(), creator: authorsSchema.optional() }).nullish(),
      mediaClass: z.string().nullish(),
      publicationYear: z.array(z.string()).nullish(),
    }),
  })).optional(),
}).refine((value) => value.totalHits >= (value.hits?.length ?? 0) && (value.totalHits === 0 || !!value.hits?.length));

export function parseMinaBibliotek(content: string, source: MinaSource, query: string): SearchResult {
  if (content.length > 2_000_000) throw new Error('Mina biblioteks svar är för stort för att bearbetas.');
  const events = content.replace(/\r\n?/g, '\n').split('\n\n');
  const searches = events.filter((event) => event.split('\n').some((line) => /^event:\s*search\s*$/.test(line)));
  if (searches.length !== 1) throw new Error('Mina bibliotek returnerade ett oväntat händelseformat.');
  const json = searches[0].split('\n').filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, '')).join('\n');
  let data: unknown;
  try { data = JSON.parse(json); }
  catch { throw new Error('Mina bibliotek returnerade inte giltig JSON.'); }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) throw new Error('Mina bibliotek returnerade ett oväntat eller ofullständigt söksvar.');
  return {
    totalHits: parsed.data.totalHits,
    catalogueUrl: queryUrl(source.catalogueUrl, query),
    hits: (parsed.data.hits ?? []).map(({ entity }) => ({
      sourceId: source.id, title: entity.name,
      author: (entity.creator?.author ?? entity.creator?.creator)?.map((author) => author.value).join('; ') || undefined,
      type: entity.mediaClass || undefined, year: entity.publicationYear?.[0],
      url: new URL(`/search#/entity/catalogue/${encodeURIComponent(entity.id)}`, source.catalogueUrl).href,
    })),
  };
}

export async function searchMinaBibliotek(
  source: MinaSource, query: string, proxy: Instance['proxy'], signal: AbortSignal,
  trace?: DiagnosticTrace,
): Promise<SearchResult> {
  const content = await requestContent(queryUrl(source.searchUrl, query), source.encoding, proxy, signal, trace);
  const parse = () => parseMinaBibliotek(content, source, query);
  return trace ? trace.parse(parse) : parse();
}
