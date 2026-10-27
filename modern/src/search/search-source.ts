import type { Instance, Source } from '../../../config/schema';
import type { SearchResult } from './types';
import { searchXsearch } from './adapters/xsearch';
import { searchVega } from './adapters/vega';
import { searchKoha } from './adapters/koha/koha';
import { searchArena } from './adapters/arena/arena';
import { searchStockholm } from './adapters/stockholm';
import { searchMinaBibliotek } from './adapters/mina-bibliotek';
import type { DiagnosticTrace } from './diagnostics';

export function searchSource(
  source: Source,
  query: string,
  proxy: Instance['proxy'],
  signal: AbortSignal,
  trace?: DiagnosticTrace,
): Promise<SearchResult> {
  switch (source.adapter) {
    case 'libris-xsearch':
      return searchXsearch(source, query, proxy, signal, trace);
    case 'vega':
      return searchVega(source, query, proxy.timeoutMs, signal, trace);
    case 'koha':
      return searchKoha(source, query, proxy, signal, trace);
    case 'arena':
      return searchArena(source, query, proxy, signal, trace);
    case 'stockholm':
      return searchStockholm(source, query, proxy, signal, trace);
    case 'mina-bibliotek':
      return searchMinaBibliotek(source, query, proxy, signal, trace);
  }
}
