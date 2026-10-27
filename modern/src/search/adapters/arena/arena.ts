import type { Instance } from '../../../../../config/schema';
import type { ArenaSource, ArenaPage } from './arena-parser';
import type { ArenaJob, ArenaReply } from './arena.worker.ts';
import { requestPage } from '../../transport';
import { queryUrl } from '../../urls';
import type { SearchResult } from '../../types';
import type { DiagnosticTrace } from '../../diagnostics';

export function arenaQueryUrl(source: ArenaSource, query: string): string {
  const encoded = encodeURIComponent(query);
  return source.searchUrl.replaceAll('@QUERY@', source.queryEncoding === 'plus' ? encoded.replaceAll('%20', '+') : encoded);
}

function parsePage(job: ArenaJob, signal: AbortSignal): Promise<ArenaPage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const worker = new Worker(new URL('./arena.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<ArenaReply>) => {
      cleanup();
      if (event.data.kind === 'error') reject(new Error(event.data.error));
      else resolve(event.data.page);
    };
    worker.onerror = () => { cleanup(); reject(new Error('Arenas bakgrundsbearbetning misslyckades.')); };
    worker.onmessageerror = () => { cleanup(); reject(new Error('Arenas bakgrundssvar kunde inte läsas.')); };
    worker.postMessage(job);
  });
}

export async function searchArena(
  source: ArenaSource, query: string, proxy: Instance['proxy'], signal: AbortSignal,
  trace?: DiagnosticTrace,
): Promise<SearchResult> {
  const deadline = AbortSignal.timeout(proxy.timeoutMs);
  const active = AbortSignal.any([signal, deadline]);
  const searchUrl = arenaQueryUrl(source, query);
  let target = searchUrl;
  let cookies: string | undefined;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await requestPage(target, source.encoding, proxy, active, { cookies, allowHttpErrors: true, trace });
      const pageUrl = response.status?.resolved_url || target;
      if (new URL(pageUrl).origin !== new URL(searchUrl).origin) {
        throw new Error('Arena omdirigerade till en annan webbplats. Öppna katalogen direkt.');
      }
      const parse = () => parsePage({ content: response.content, source, pageUrl }, active);
      const page = trace ? await trace.run('worker-parse', parse, {}, (page) => ({ pageKind: page.kind })) : await parse();
      if (page.kind === 'cookie') {
        cookies = page.cookie;
        target = pageUrl;
        continue;
      }
      const status = response.status?.http_code ?? 200;
      if (status < 200 || status >= 300) throw new Error(`Katalogen returnerade HTTP ${status}. Öppna katalogen direkt.`);
      cookies = response.cookies || cookies;
      if (page.kind === 'redirect') { target = page.url; continue; }
      return { ...page.result, catalogueUrl: queryUrl(source.catalogueUrl, query) };
    }
    throw new Error('Arenas kontroll eller omdirigering återkom för många gånger. Öppna katalogen direkt.');
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (deadline.aborted) throw new Error('Katalogen svarade inte i tid. Försök igen.');
    throw error;
  }
}
