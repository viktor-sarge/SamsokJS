import type { Instance, Source } from '../../../config/schema';
import { searchSource } from './adapters';
import type { SearchResult } from './types';
import { DiagnosticTrace } from './diagnostics';
import type { FailureDiagnostics } from './diagnostics';

export type SourceState =
  | { source: Source; status: 'loading' }
  | { source: Source; status: 'success'; result: SearchResult }
  | { source: Source; status: 'error'; error: string; diagnostics: FailureDiagnostics };

interface SearchRun {
  controller: AbortController;
  query: string;
  states: SourceState[];
  emit: (states: SourceState[]) => void;
  attempts: Map<string, number>;
}

export class SearchSession {
  private cache = new Map<string, SearchResult>();
  private current?: SearchRun;

  constructor(
    private proxy: Instance['proxy'],
    private search: typeof searchSource = searchSource,
  ) {}

  start(query: string, sources: Source[], emit: SearchRun['emit']): () => void {
    this.current?.controller.abort();
    const run: SearchRun = {
      controller: new AbortController(),
      query,
      emit,
      attempts: new Map(),
      states: query ? sources.map((source): SourceState => {
        const result = this.cache.get(this.key(source, query));
        return result ? { source, status: 'success', result } : { source, status: 'loading' };
      }) : [],
    };
    this.current = run;
    emit([...run.states]);

    const pending = run.states.filter((state) => state.status === 'loading');
    let next = 0;
    const work = async () => {
      while (!run.controller.signal.aborted && next < pending.length) {
        const state = pending[next++];
        await this.perform(run, state.source);
      }
    };
    for (let index = 0; index < Math.min(4, pending.length); index++) void work();
    return () => run.controller.abort();
  }

  retry(sourceId: string): void {
    const run = this.current;
    if (!run || run.controller.signal.aborted) return;
    const state = run.states.find((item) => item.source.id === sourceId);
    if (state?.status !== 'error') return;
    this.update(run, { source: state.source, status: 'loading' });
    void this.perform(run, state.source);
  }

  private key(source: Source, query: string): string {
    return JSON.stringify([source.id, query]);
  }

  private update(run: SearchRun, state: SourceState): void {
    if (run.controller.signal.aborted) return;
    run.states = run.states.map((item) => item.source.id === state.source.id ? state : item);
    run.emit([...run.states]);
  }

  private async perform(run: SearchRun, source: Source): Promise<void> {
    const attempt = (run.attempts.get(source.id) ?? 0) + 1;
    run.attempts.set(source.id, attempt);
    const trace = new DiagnosticTrace();
    try {
      const result = await this.search(source, run.query, this.proxy, run.controller.signal, trace);
      if (run.controller.signal.aborted) return;
      const key = this.key(source, run.query);
      this.cache.delete(key);
      this.cache.set(key, result);
      const oldest = this.cache.keys().next().value;
      if (this.cache.size > 32 && oldest !== undefined) this.cache.delete(oldest);
      this.update(run, { source, status: 'success', result });
    } catch (error) {
      if (run.controller.signal.aborted) return;
      this.update(run, {
        source,
        status: 'error',
        error: error instanceof Error ? error.message : 'Ett okänt sökfel inträffade.',
        diagnostics: trace.failure(attempt),
      });
    }
  }
}
