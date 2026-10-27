import { inspectKoha, solveAnubis } from './koha-parser';
import type { KohaSource, AnubisChallenge, KohaPage } from './koha-parser';

export type KohaJob =
  | { kind: 'parse'; content: string; source: KohaSource; pageUrl: string }
  | { kind: 'solve'; challenge: AnubisChallenge };
export type KohaReply =
  | { kind: 'page'; page: KohaPage }
  | { kind: 'solution'; nonce: number; hash: string }
  | { kind: 'error'; error: string };

self.onmessage = async (event: MessageEvent<KohaJob>) => {
  try {
    const job = event.data;
    const reply: KohaReply = job.kind === 'parse'
      ? { kind: 'page', page: inspectKoha(job.content, job.source, job.pageUrl) }
      : { kind: 'solution', ...await solveAnubis(job.challenge) };
    self.postMessage(reply);
  } catch (error) {
    self.postMessage({ kind: 'error', error: error instanceof Error ? error.message : 'Koha-bearbetningen misslyckades.' });
  }
};
