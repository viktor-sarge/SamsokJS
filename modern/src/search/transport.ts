import { z } from 'zod';
import type { Instance } from '../../../config/schema';
import { httpUrlSchema } from '../../../config/schema';

declare global {
  interface Window {
    __samsokJsonp?: Record<string, (data: unknown) => void>;
  }
}

const envelopeSchema = z.object({
  content: z.string().min(1, 'Proxyn returnerade ett tomt svar.'),
  status: z.object({
    http_code: z.number().int().optional(),
    resolved_url: httpUrlSchema.optional(),
  }).optional(),
  cookies: z.string().optional(),
});

export type ProxyPage = z.infer<typeof envelopeSchema>;

interface ProxyOptions {
  cookies?: string;
  allowHttpErrors?: boolean;
  post?: { data: unknown; headers: Record<string, string> };
}

let requestId = 0;

export function requestPage(
  target: string,
  encoding: string,
  proxy: Instance['proxy'],
  signal: AbortSignal,
  options: ProxyOptions = {},
): Promise<ProxyPage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Sökningen avbröts.', 'AbortError'));
      return;
    }
    const id = `request${++requestId}`;
    const callbacks = window.__samsokJsonp ??= {};
    const script = document.createElement('script');
    const url = new URL(proxy.url);
    url.searchParams.set('url', target);
    url.searchParams.set('encoding', encoding);
    if (options.cookies) url.searchParams.set('cookies', options.cookies);
    if (options.post) {
      url.searchParams.set('method', 'POST');
      url.searchParams.set('contentType', 'application/json');
      url.searchParams.set('postData', JSON.stringify(options.post.data));
      url.searchParams.set('headers', JSON.stringify(options.post.headers));
    }
    url.searchParams.set('callback', `__samsokJsonp.${id}`);
    script.src = url.href;
    script.async = true;
    script.referrerPolicy = 'no-referrer';

    let settled = false;
    const cleanup = (keepCallback = false) => {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      script.remove();
      if (!keepCallback) delete callbacks[id];
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const abandon = (error: Error) => {
      // Detached JSONP scripts can still execute. Retain an inert callback until they finish.
      callbacks[id] = () => { delete callbacks[id]; };
      cleanup(true);
      reject(error);
    };
    const onAbort = () => abandon(new DOMException('Sökningen avbröts.', 'AbortError'));
    const timer = window.setTimeout(
      () => abandon(new Error('Katalogen svarade inte i tid. Försök igen.')),
      proxy.timeoutMs,
    );
    callbacks[id] = (data) => {
      cleanup();
      const parsed = envelopeSchema.safeParse(data);
      if (!parsed.success) {
        reject(new Error('Proxyn returnerade ett ogiltigt eller tomt svar.'));
        return;
      }
      const status = parsed.data.status?.http_code;
      if (!options.allowHttpErrors && status !== undefined && (status < 200 || status >= 300)) {
        reject(new Error(`Katalogen returnerade HTTP ${status}. Försök igen eller öppna katalogen.`));
        return;
      }
      resolve(parsed.data);
    };
    script.onerror = () => {
      if (settled) {
        delete callbacks[id];
        return;
      }

      fail(new Error('Kunde inte kontakta proxyn. Kontrollera anslutningen.'));
    };
    script.onload = () => {
      if (settled) {
        delete callbacks[id];
        return;
      }
      if (Object.hasOwn(callbacks, id)) {
        fail(new Error('Proxyn svarade utan giltig JSONP-data.'));
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    document.head.append(script);
  });
}

export async function requestContent(
  target: string,
  encoding: string,
  proxy: Instance['proxy'],
  signal: AbortSignal,
): Promise<string> {
  return (await requestPage(target, encoding, proxy, signal)).content;
}
