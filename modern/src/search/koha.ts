import type { Instance } from '../../../config/schema';
import type { KohaSource } from './koha-parser';
import type { KohaJob, KohaReply } from './koha.worker';
import { requestPage } from './transport';
import { queryUrl } from './urls';
import type { SearchResult } from './types';

function runWorker(job: KohaJob, signal: AbortSignal): Promise<Exclude<KohaReply, { kind: 'error' }>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const worker = new Worker(new URL('./koha.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<KohaReply>) => {
      cleanup();
      if (event.data.kind === 'error') reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.onerror = () => { cleanup(); reject(new Error('Kohas bakgrundsbearbetning misslyckades.')); };
    worker.onmessageerror = () => { cleanup(); reject(new Error('Kohas bakgrundssvar kunde inte läsas.')); };
    worker.postMessage(job);
  });
}

export function waitForChallenge(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function searchKoha(
  source: KohaSource, query: string, proxy: Instance['proxy'], signal: AbortSignal,
): Promise<SearchResult> {
  const deadline = AbortSignal.timeout(proxy.timeoutMs);
  const active = AbortSignal.any([signal, deadline]);
  const searchUrl = queryUrl(source.searchUrl, query);
  let target = searchUrl;
  let cookies: string | undefined;
  let cookieRetried = false;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const page = await requestPage(target, source.encoding, proxy, active, { cookies, allowHttpErrors: true });
      cookies = page.cookies || cookies;
      const pageUrl = page.status?.resolved_url || target;
      if (new URL(pageUrl).origin !== new URL(searchUrl).origin) {
        throw new Error('Koha omdirigerade till en annan webbplats. Öppna katalogen direkt.');
      }
      if (new URL(pageUrl).pathname.endsWith('/anubis/api/pass-challenge') &&
          !page.content.includes('anubis_challenge')) {
        const status = page.status?.http_code ?? 200;
        if (status < 200 || status >= 300) {
          throw new Error(`Anubis-verifieringen returnerade HTTP ${status}. Öppna katalogen direkt.`);
        }
        target = searchUrl;
        continue;
      }
      const parsed = await runWorker({ kind: 'parse', content: page.content, source, pageUrl }, active);
      if (parsed.kind !== 'page') throw new Error('Oväntat svar från Koha-bearbetningen.');
      if (parsed.page.kind === 'results') {
        const status = page.status?.http_code;
        if (status !== undefined && (status < 200 || status >= 300)) {
          throw new Error(`Katalogen returnerade HTTP ${status}. Öppna katalogen direkt.`);
        }
        return parsed.page.result;
      }
      if (parsed.page.kind === 'cookie') {
        if (cookieRetried) throw new Error('Kohas cookie-kontroll misslyckades. Öppna katalogen direkt.');
        cookieRetried = true;
        cookies = 'KOHA_INIT=1; path=/; SameSite=Lax; Secure';
        target = searchUrl;
        continue;
      }
      const { challenge, prefix } = parsed.page;
      if (!cookies) throw new Error('Proxyn saknar cookies för Anubis. Öppna katalogen direkt.');
      const pass = new URL(`${prefix}/.within.website/x/cmd/anubis/api/pass-challenge`, searchUrl);
      pass.searchParams.set('id', challenge.challenge.id);
      const started = performance.now();
      if (challenge.rules.algorithm === 'metarefresh') {
        await waitForChallenge((challenge.rules.difficulty + 1) * 1000, active);
        pass.searchParams.set('challenge', challenge.challenge.randomData);
        pass.searchParams.set('redir', new URL(searchUrl).pathname + new URL(searchUrl).search);
      } else {
        const solution = await runWorker({ kind: 'solve', challenge }, active);
        if (solution.kind !== 'solution') throw new Error('Oväntat svar från Anubis-bearbetningen.');
        pass.searchParams.set('response', solution.hash);
        pass.searchParams.set('nonce', String(solution.nonce));
        pass.searchParams.set('elapsedTime', String(Math.max(1, Math.round(performance.now() - started))));
        pass.searchParams.set('redir', searchUrl);
      }
      target = pass.href;
    }
    throw new Error('Katalogens kontroll återkom för många gånger. Öppna katalogen direkt.');
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (deadline.aborted) throw new Error('Katalogen svarade inte i tid. Försök igen.');
    throw error;
  }
}
