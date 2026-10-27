import { load } from 'cheerio/slim';
import { httpUrlSchema } from '../../../config/schema';
import type { Source } from '../../../config/schema';
import type { SearchResult } from './types';

export type ArenaSource = Extract<Source, { adapter: 'arena' }>;
export type ArenaPage =
  | { kind: 'results'; result: SearchResult }
  | { kind: 'cookie'; cookie: string }
  | { kind: 'redirect'; url: string };

function safeUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (!httpUrlSchema.safeParse(url.href).success || url.origin !== new URL(base).origin) {
    throw new Error('Arena returnerade en ogiltig eller extern länk.');
  }
  return url.href;
}

export function solveArenaCookie(content: string): string {
  const script = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const init = /function go\(\)\s*\{\s*var p=(\d+);\s*var s=(\d+);\s*var n;/.exec(script);
  const end = /n=leastFactor\(p\);\s*\{\s*document\.cookie="([A-Za-z0-9_]+)="\+n\+"\*"\+p\/n\+":"\+s\+"(:[0-9:]+;SameSite=Strict; Secure)";/.exec(script);
  if (!init || !end || end.index <= init.index) throw new Error('Arenas cookie-kontroll har ett okänt format.');
  let p = Number(init[1]);
  const s = Number(init[2]);
  if (!Number.isSafeInteger(p) || !Number.isSafeInteger(s) || s < 0 || s > 0xffffffff) {
    throw new Error('Ogiltiga Arena-kontrolldata.');
  }
  let rest = script.slice(init.index + init[0].length, end.index).trim();
  const arithmetic = (sign: string, value: string, multiplier?: string) => {
    const operand = Number(value);
    const factor = Number(multiplier ?? 1);
    const product = operand * factor;
    if (![operand, factor, product].every(Number.isSafeInteger)) {
      throw new Error('Arenas kontroll överskred beräkningsgränsen.');
    }
    p += (sign === '+' ? 1 : -1) * product;
    if (!Number.isSafeInteger(p)) throw new Error('Arenas kontroll överskred beräkningsgränsen.');
  };
  while (rest) {
    const branch = /^if\s*\(\(s\s*>>\s*(\d+)\)\s*&\s*1\)\s*p\s*([+-])=\s*(\d+)\s*\*\s*(\d+);\s*else\s*p\s*([+-])=\s*(\d+)\s*\*\s*(\d+);/.exec(rest);
    const adjustment = /^p\s*([+-])=\s*(\d+);/.exec(rest);
    if (branch) {
      const shift = Number(branch[1]);
      if (shift > 31) throw new Error('Ogiltigt bitskift i Arena-kontrollen.');
      if ((s >> shift) & 1) arithmetic(branch[2], branch[3], branch[4]);
      else arithmetic(branch[5], branch[6], branch[7]);
      rest = rest.slice(branch[0].length).trim();
    } else if (adjustment) {
      arithmetic(adjustment[1], adjustment[2]);
      rest = rest.slice(adjustment[0].length).trim();
    } else {
      throw new Error('Arenas cookie-kontroll har ett okänt format.');
    }
  }
  if (!Number.isSafeInteger(p) || p < 2 || p > 4_000_000_000_000) {
    throw new Error('Arenas kontroll överskred beräkningsgränsen.');
  }
  let factor = p;
  for (let candidate = 2; candidate * candidate <= p; candidate += candidate === 2 ? 1 : 2) {
    if (p % candidate === 0) { factor = candidate; break; }
  }
  return `${end[1]}=${factor}*${p / factor}:${s}${end[2]}`;
}

export function inspectArena(content: string, source: ArenaSource, pageUrl: string): ArenaPage {
  if (content.length > 2_000_000) throw new Error('Arenas svar är för stort för att bearbetas.');
  const $ = load(content);
  if (content.includes('function leastFactor(n)') && content.includes('document.cookie')) {
    return { kind: 'cookie', cookie: solveArenaCookie(content).split(';')[0] };
  }
  const redirect = $('script').toArray().map((node) =>
    /location\.replace\("((?:\\x[0-9a-fA-F]{2}|[^"\\])+)"\)/.exec($(node).text())?.[1]).find(Boolean);
  if (redirect) {
    const decoded = redirect.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return { kind: 'redirect', url: safeUrl(decoded, pageUrl) };
  }
  const clean = (selector: string) => $(selector).text().replace(/\s+/g, ' ').trim();
  if ($('div.arena-detail-title').length) {
    const title = $('div.arena-detail-title span').filter((_, node) =>
      !/arena-result-item-number|mediaclass-label/.test($(node).attr('class') ?? '')).last().text().trim() ||
      clean('div.arena-detail-title');
    if (!title) throw new Error('Arena returnerade en post utan titel.');
    const url = safeUrl($('link[rel="canonical"]').attr('href') || $('a.arena-linktopage').attr('href') || pageUrl, pageUrl);
    return { kind: 'results', result: { totalHits: 1, catalogueUrl: pageUrl, hits: [{
      title, author: clean('div.arena-detail-author span.arena-value') || undefined,
      year: clean('div.arena-detail-year span.arena-value') || undefined,
      type: clean('div.arena-detail-media span.arena-value') || undefined,
      url, sourceId: source.id,
    }] } };
  }
  const feedback = clean('div.arena-feedback');
  const noExactMatches = /gav\s+(?:inga|0)\s+träffar|(?:returned|found)\s+(?:no|0)\s+(?:hits|results)/i.test(feedback);
  if (noExactMatches) {
    return { kind: 'results', result: { totalHits: 0, hits: [], catalogueUrl: pageUrl } };
  }
  const empty = $('div.arena-zero-list').length > 0;
  let totalHits: number | null = empty ? 0 : null;
  $('.feedbackPanelINFO').each((_, node) => {
    const message = $(node).text();
    if (/alternativa/i.test(message)) return;
    const match = /gav\s+(\d[\d\s,.\u00a0]*)\s+träff/i.exec(message);
    if (match && totalHits === null) totalHits = Number(match[1].replace(/\D/g, ''));
  });
  if (totalHits === null) $('span').each((_, node) => {
    const match = /^\s*\d+\s*[-–]\s*\d+\s+(?:av|of)\s+(\d[\d\s,.\u00a0]*)\s*$/.exec($(node).text());
    if (match && totalHits === null) totalHits = Number(match[1].replace(/\D/g, ''));
  });
  const hits = $('div.arena-record-details').map((_, node) => {
    const row = $(node);
    const link = row.find('div.arena-record-title a').first();
    const title = link.text().replace(/\s+/g, ' ').trim();
    const href = link.attr('href');
    if (!title || !href) throw new Error('Arena returnerade en ofullständig post.');
    return { title, url: safeUrl(href, pageUrl), sourceId: source.id,
      author: row.find('div.arena-record-author span.arena-value').text().trim() || undefined,
      year: row.find('div.arena-record-year span.arena-value').text().trim() || undefined,
      type: row.find('div.arena-record-media span.arena-value').text().trim() || undefined };
  }).get();
  if ((!hits.length && totalHits !== 0) ||
      (totalHits !== null && (!Number.isSafeInteger(totalHits) || totalHits < hits.length || (totalHits > 0 && !hits.length)))) {
    throw new Error('Arena returnerade ett okänt eller ofullständigt söksvar. Öppna katalogen direkt.');
  }
  return { kind: 'results', result: { hits, totalHits, catalogueUrl: pageUrl } };
}
