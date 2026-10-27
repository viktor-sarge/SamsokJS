import { describe, expect, it, vi } from 'vitest';
import { DiagnosticTrace, diagnosticReport } from '../../modern/src/search/diagnostics';
import { resolveInstance } from '../../config/schema';
import halland from '../../instances/halland.json';
import registry from '../../config/sources.json';

const instance = resolveInstance(halland, registry);
const source = instance.sources.find((source) => source.id === 'stockholm')!;
const query = 'private search & + räven';
const build = { version: '1.0.0', builtAt: '2026-10-27T09:00:00.000Z' };
const environment = {
  pageUrl: `https://example.org/subpath/?session=secret-session#/search?query=${encodeURIComponent(query)}`,
  userAgent: 'Test browser', online: true, language: 'sv-SE',
};

describe('diagnostic traces', () => {
  it('records ordered stages, duration and safe response metadata, returning immutable failure snapshots', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(10);
    try {
      const trace = new DiagnosticTrace();
      now.mockReturnValue(20);
      const finish = trace.start('proxy-request');
      now.mockReturnValue(75);
      finish('ok', { httpStatus: 200, responseChars: 100 });
      expect(() => trace.parse(() => { throw new Error('parse failure'); })).toThrow('parse failure');
      const failure = trace.failure(2);
      expect(failure).toMatchObject({
        attempt: 2, durationMs: 65, truncated: false,
        events: [
          { stage: 'proxy-request', offsetMs: 10, durationMs: 55, outcome: 'ok', httpStatus: 200, responseChars: 100 },
          { stage: 'parse', outcome: 'error' },
        ],
      });
      finish('timeout');
      expect(failure.events[0].outcome).toBe('ok');
      expect(await trace.run('worker-parse', async () => 'cookie' as const, {}, (pageKind) => ({ pageKind }))).toBe('cookie');
      expect(trace.failure(2).events[2]).toMatchObject({ stage: 'worker-parse', pageKind: 'cookie', outcome: 'ok' });
    } finally { now.mockRestore(); }
  });
  it('bounds event memory and preserves failures from async work', async () => {
    const trace = new DiagnosticTrace();
    await expect(trace.run('challenge-solve', async () => {
      throw new DOMException('timeout', 'TimeoutError');
    }, { algorithm: 'fast' })).rejects.toThrow('timeout');
    for (let index = 0; index < 45; index++) trace.start('parse')('ok');
    const failure = trace.failure(1);
    expect(failure.events).toHaveLength(40);
    expect(failure.truncated).toBe(true);
    expect(failure.events[0]).toMatchObject({ stage: 'challenge-solve', algorithm: 'fast', outcome: 'timeout' });
  });
});

describe('shareable diagnostic reports', () => {
  it('omits query values, fragments, credentials, response bodies and raw error URLs', () => {
    const trace = new DiagnosticTrace();
    trace.start('proxy-request')('http-error', { httpStatus: 503, responseChars: 50 });
    const text = diagnosticReport({
      instance: { ...instance, proxy: { ...instance.proxy, url: 'https://proxy.example/?token=proxy-secret' } },
      source: { ...source, catalogueUrl: 'https://catalogue.example/search?token=source-secret&q=@QUERY@' },
      failure: trace.failure(1), build, environment, query, includeQuery: false,
      error: `Failure for ${query} at https://remote.example/?token=secret&q=${encodeURIComponent(query)}`,
    });
    const report = JSON.parse(text);
    expect(report.schemaVersion).toBe(1);
    expect(report.application).toEqual({ name: 'SamsokJS', ...build, instanceId: 'halland' });
    expect(report.source).toMatchObject({ id: 'stockholm', adapter: 'stockholm', pageSize: 40 });
    expect(report.environment.page).toBe('https://example.org/subpath/');
    expect(report.failure.events[0].httpStatus).toBe(503);
    expect(report.queryIncluded).toBe(false);
    expect(report).not.toHaveProperty('query');
    for (const secret of [query, encodeURIComponent(query), 'proxy-secret', 'source-secret', 'secret-session', 'remote.example']) {
      expect(text).not.toContain(secret);
    }
    expect(report.failure.message).toBe('Failure for [query omitted] at [URL omitted]');
  });
  it('includes the exact query only when requested, not raw request URLs', () => {
    const text = diagnosticReport({
      instance, source, failure: new DiagnosticTrace().failure(1), build, environment, query, includeQuery: true, error: 'Error',
    });
    expect(JSON.parse(text)).toMatchObject({ queryIncluded: true, query });
    expect(text).not.toContain('secret-session');
    expect(text).not.toContain('#/search');
  });
});
