import type { Instance, Source } from '../../../config/schema';
import type { SearchResult } from './types';
import { searchXsearch } from './xsearch';
import { searchVega } from './vega';
import { searchKoha } from './koha';

export function searchSource(
  source: Source,
  query: string,
  proxy: Instance['proxy'],
  signal: AbortSignal,
): Promise<SearchResult> {
  switch (source.adapter) {
    case 'libris-xsearch':
      return searchXsearch(source, query, proxy, signal);
    case 'vega':
      return searchVega(source, query, proxy.timeoutMs, signal);
    case 'koha':
      return searchKoha(source, query, proxy, signal);
  }
}
