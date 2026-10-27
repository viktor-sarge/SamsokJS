import type { Instance, Source } from '../../../config/schema';

type Stage = 'proxy-request' | 'vega-request' | 'parse' | 'worker-parse' | 'challenge-solve' | 'challenge-wait';
type Outcome = 'ok' | 'error' | 'timeout' | 'aborted' | 'network-error' | 'http-error' | 'invalid-envelope' | 'invalid-jsonp' | 'invalid-json';
interface EventDetails {
  method?: 'GET' | 'POST';
  httpStatus?: number;
  responseChars?: number;
  pageKind?: 'results' | 'redirect' | 'cookie' | 'anubis';
  algorithm?: 'fast' | 'slow' | 'metarefresh';
}
export interface DiagnosticEvent extends EventDetails {
  stage: Stage;
  offsetMs: number;
  durationMs: number;
  outcome: Outcome;
}
export interface FailureDiagnostics {
  startedAt: string;
  failedAt: string;
  durationMs: number;
  attempt: number;
  events: DiagnosticEvent[];
  truncated: boolean;
}

export class DiagnosticTrace {
  private started = performance.now();
  private startedAt = new Date().toISOString();
  private events: DiagnosticEvent[] = [];
  private truncated = false;

  start(stage: Stage, initial: EventDetails = {}) {
    const started = performance.now();
    const event: DiagnosticEvent = {
      stage, offsetMs: Math.round(started - this.started), durationMs: 0, outcome: 'error', ...initial,
    };
    if (this.events.length < 40) this.events.push(event);
    else this.truncated = true;
    return (outcome: Outcome, details: EventDetails = {}) => {
      Object.assign(event, details, { outcome, durationMs: Math.max(0, Math.round(performance.now() - started)) });
    };
  }

  parse<T>(parse: () => T): T {
    const finish = this.start('parse');
    try {
      const result = parse();
      finish('ok');
      return result;
    } catch (error) {
      finish('error');
      throw error;
    }
  }

  async run<T>(stage: Stage, work: () => Promise<T>, initial: EventDetails = {},
    summarize: (result: T) => EventDetails = () => ({})): Promise<T> {
    const finish = this.start(stage, initial);
    try {
      const result = await work();
      finish('ok', summarize(result));
      return result;
    } catch (error) {
      finish(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout'
        : error instanceof DOMException && error.name === 'AbortError' ? 'aborted' : 'error');
      throw error;
    }
  }

  failure(attempt: number): FailureDiagnostics {
    return {
      startedAt: this.startedAt, failedAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round(performance.now() - this.started)), attempt,
      events: this.events.map((event) => ({ ...event })), truncated: this.truncated,
    };
  }
}

function endpoint(value: string) {
  const url = new URL(value);
  return { origin: url.origin, path: url.pathname, parameterNames: [...new Set(url.searchParams.keys())] };
}

function safeError(message: string, query: string): string {
  let text = message.replace(/https?:\/\/[^\s"'<>]+/gi, '[URL omitted]');
  for (const value of [query, encodeURIComponent(query), encodeURIComponent(query).replaceAll('%20', '+')]) {
    if (value) text = text.replaceAll(value, '[query omitted]');
  }
  return text.slice(0, 1000);
}

export function diagnosticReport(input: {
  instance: Instance;
  source: Source;
  failure: FailureDiagnostics;
  error: string;
  query: string;
  includeQuery: boolean;
  build: { version: string; builtAt: string };
  environment: { pageUrl: string; userAgent: string; online: boolean; language: string };
}): string {
  const { instance, source, failure, environment } = input;
  return JSON.stringify({
    schemaVersion: 1,
    application: { name: 'SamsokJS', ...input.build, instanceId: instance.id },
    environment: {
      page: endpoint(environment.pageUrl).origin + endpoint(environment.pageUrl).path,
      userAgent: environment.userAgent, online: environment.online, language: environment.language,
    },
    source: {
      id: source.id, name: source.name, adapter: source.adapter,
      catalogue: endpoint(source.catalogueUrl),
      endpoint: endpoint('apiUrl' in source ? source.apiUrl : source.searchUrl),
      ...('customerDomain' in source ? { customerDomain: source.customerDomain } : {}),
      ...('pageSize' in source ? { pageSize: source.pageSize } : {}),
      ...('queryEncoding' in source ? { queryEncoding: source.queryEncoding } : {}),
      ...('encoding' in source ? { encoding: source.encoding } : {}),
    },
    proxy: { ...endpoint(instance.proxy.url), protocol: instance.proxy.protocol, timeoutMs: instance.proxy.timeoutMs },
    failure: { ...failure, message: safeError(input.error, input.query) },
    queryIncluded: input.includeQuery,
    ...(input.includeQuery ? { query: input.query } : {}),
  }, null, 2);
}
