import { inspectArena } from './arena-parser';
import type { ArenaSource, ArenaPage } from './arena-parser';

export interface ArenaJob { content: string; source: ArenaSource; pageUrl: string }
export type ArenaReply = { kind: 'page'; page: ArenaPage } | { kind: 'error'; error: string };

self.onmessage = (event: MessageEvent<ArenaJob>) => {
  try {
    const { content, source, pageUrl } = event.data;
    self.postMessage({ kind: 'page', page: inspectArena(content, source, pageUrl) });
  } catch (error) {
    self.postMessage({ kind: 'error', error: error instanceof Error ? error.message : 'Arena-bearbetningen misslyckades.' });
  }
};
