import { describe, expect, it, vi } from 'vitest';
import { resolveInstance } from '../../config/schema';
import halland from '../../instances/halland.json';
import registry from '../../config/sources.json';
import { SearchSession } from '../../modern/src/search/session';
import type { SourceState } from '../../modern/src/search/session';
import type { SearchResult } from '../../modern/src/search/types';

const instance = resolveInstance(halland, registry);
instance.sources = instance.sources.filter((source) => source.adapter === 'libris-xsearch');
const empty: SearchResult = { hits: [], totalHits: 0, catalogueUrl: 'https://example.org/' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('search coordination', () => {
  it('does not let a failed catalogue block others and retries only the requested source', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(new Error('Proxy unavailable'))
      .mockResolvedValue(empty);
    const session = new SearchSession(instance.proxy, search);
    let states: SourceState[] = [];
    session.start('book', instance.sources, (next) => { states = next; });
    await vi.waitFor(() => expect(states.map((item) => item.status)).toEqual(['error', 'success']));
    session.retry(instance.sources[0].id);
    await vi.waitFor(() => expect(states.map((item) => item.status)).toEqual(['success', 'success']));
    expect(search).toHaveBeenCalledTimes(3);
  });

  it('ignores late responses from cancelled queries and signals cancellation', async () => {
    const old = deferred<SearchResult>();
    const search = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(empty);
    const session = new SearchSession(instance.proxy, search);
    const oldEmit = vi.fn();
    session.start('old', [instance.sources[0]], oldEmit);
    const newEmit = vi.fn();
    session.start('new', [instance.sources[0]], newEmit);
    expect(search.mock.calls[0][3].aborted).toBe(true);
    await vi.waitFor(() => expect(newEmit).toHaveBeenLastCalledWith([
      expect.objectContaining({ status: 'success' }),
    ]));
    old.resolve(empty);
    await old.promise;
    expect(oldEmit).toHaveBeenCalledTimes(1);
  });

  it('reuses successful searches, including when sources are re-enabled', async () => {
    const search = vi.fn().mockResolvedValue(empty);
    const session = new SearchSession(instance.proxy, search);
    const emit = vi.fn();
    session.start('book', instance.sources, emit);
    await vi.waitFor(() => expect(emit.mock.lastCall?.[0].every((state: SourceState) => state.status === 'success')).toBe(true));
    session.start('book', [instance.sources[0]], emit);
    session.start('book', instance.sources, emit);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('does not request anything for an empty query or empty source selection', () => {
    const search = vi.fn();
    const session = new SearchSession(instance.proxy, search);
    session.start('', instance.sources, vi.fn());
    session.start('book', [], vi.fn());
    expect(search).not.toHaveBeenCalled();
  });

  it('limits concurrency to four requests', async () => {
    const response = deferred<SearchResult>();
    const search = vi.fn().mockReturnValue(response.promise);
    const session = new SearchSession(instance.proxy, search);
    const sources = Array.from({ length: 7 }, (_, index) => ({ ...instance.sources[0], id: `source-${index}` }));
    const emit = vi.fn();
    session.start('book', sources, emit);
    expect(search).toHaveBeenCalledTimes(4);
    response.resolve(empty);
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(7));
  });

  it('bounds the cache to 32 successful searches', async () => {
    const search = vi.fn().mockResolvedValue(empty);
    const session = new SearchSession(instance.proxy, search);
    for (let index = 0; index < 33; index++) {
      session.start(`book-${index}`, [instance.sources[0]], vi.fn());
      await Promise.resolve();
    }
    session.start('book-0', [instance.sources[0]], vi.fn());
    expect(search).toHaveBeenCalledTimes(34);
  });

  it('captures independent diagnostics for each retry without retaining failed attempts across queries', async () => {
    const search = vi.fn<typeof import('../../modern/src/search/search-source').searchSource>()
      .mockImplementation(async (_source, _query, _proxy, _signal, trace) => {
        trace?.start('proxy-request')('network-error');
        throw new Error('Network failed');
      });
    const session = new SearchSession(instance.proxy, search);
    let states: SourceState[] = [];
    session.start('book', [instance.sources[0]], (next) => { states = next; });
    await vi.waitFor(() => expect(states[0]).toMatchObject({ status: 'error', diagnostics: { attempt: 1 } }));
    session.retry(instance.sources[0].id);
    await vi.waitFor(() => expect(states[0]).toMatchObject({
      status: 'error', diagnostics: { attempt: 2, events: [{ stage: 'proxy-request', outcome: 'network-error' }] },
    }));
    session.start('different', [instance.sources[0]], (next) => { states = next; });
    await vi.waitFor(() => expect(states[0]).toMatchObject({ status: 'error', diagnostics: { attempt: 1 } }));
  });
});
