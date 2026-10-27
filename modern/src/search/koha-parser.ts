import { load } from 'cheerio/slim';
import type { CheerioAPI } from 'cheerio/slim';
import { z } from 'zod';
import { httpUrlSchema } from '../../../config/schema';
import type { Source } from '../../../config/schema';
import type { SearchResult } from './types';

export type KohaSource = Extract<Source, { adapter: 'koha' }>;
export const challengeSchema = z.object({
  rules: z.object({
    algorithm: z.enum(['fast', 'slow', 'metarefresh']),
    difficulty: z.number().int().min(0).max(6),
  }),
  challenge: z.object({
    id: z.string().min(1).max(512),
    randomData: z.string().min(1).max(4096),
  }),
});
export type AnubisChallenge = z.infer<typeof challengeSchema>;
export type KohaPage =
  | { kind: 'results'; result: SearchResult }
  | { kind: 'cookie' }
  | { kind: 'anubis'; challenge: AnubisChallenge; prefix: string };

type Selection = ReturnType<CheerioAPI>;
const text = (node: Selection) => node.text().replace(/\s+/g, ' ').trim();
function withoutLabels(node: Selection): string {
  const copy = node.clone();
  copy.find('.label, .title_resp_stmt').remove();
  return text(copy);
}
function recordUrl(value: string, base: string): string {
  const url = new URL(value, base).href;
  if (!httpUrlSchema.safeParse(url).success) throw new Error('Koha returnerade en ogiltig postlänk.');
  return url;
}

export function inspectKoha(content: string, source: KohaSource, pageUrl: string): KohaPage {
  if (content.length > 2_000_000) throw new Error('Kohas svar är för stort för att bearbetas.');
  const $ = load(content);
  const challengeNode = $('#anubis_challenge');
  if (challengeNode.length) {
    let raw: unknown;
    let prefix: unknown = '';
    try {
      raw = JSON.parse(challengeNode.text());
      const prefixText = $('#anubis_base_prefix').text();
      if (prefixText) prefix = JSON.parse(prefixText);
    } catch {
      throw new Error('Katalogen returnerade ogiltiga Anubis-data.');
    }
    const parsed = challengeSchema.safeParse(raw);
    if (!parsed.success || typeof prefix !== 'string' ||
        (prefix !== '' && !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(prefix)) ||
        prefix.split('/').includes('..')) {
      throw new Error('Katalogens Anubis-utmaning stöds inte. Öppna katalogen direkt.');
    }
    return { kind: 'anubis', challenge: parsed.data, prefix: prefix.replace(/\/$/, '') };
  }
  if ($('script[src*="koha_fast_challenge"]').length && $('.loading-overlay').length) {
    return { kind: 'cookie' };
  }
  const title = $('h1.title, h2.title').first();
  if (text(title)) {
    const authorList = $('span.results_summary.author ul.resource_list li');
    const author = authorList.map((_, node) => text($(node)).replace(/\s*\[[^\]]*\]\s*$/, '')).get().join('; ') ||
      $("[property='author'] [property='name']").map((_, node) => text($(node))).get().join('; ');
    const href = $('a#ISBDview, a[href*="show_catalogue"]').first().attr('href');
    const url = href ? recordUrl(href, pageUrl) : recordUrl(pageUrl, pageUrl);
    if (!/\/opac-(?:detail|ISBDdetail|MARCdetail)\.pl$/.test(new URL(url).pathname)) {
      throw new Error('Koha returnerade en post utan detaljlänk.');
    }
    return {
      kind: 'results',
      result: {
        totalHits: 1,
        catalogueUrl: pageUrl,
        hits: [{
          title: withoutLabels(title).replace(/\s*\/\s*$/, ''),
          author: author || undefined,
          year: text($('.rda264_date').first()) ||
            text($('.record')).match(/\b\d{4}\b/)?.[0],
          type: $('.results_summary.type img.materialtype').attr('alt') ||
            withoutLabels($('.results_summary.type').first()) || undefined,
          url,
          sourceId: source.id,
        }],
      },
    };
  }
  const rows = $('td.bibliocol');
  const heading = text($('#numresults').clone().find('a').remove().end());
  const count = heading.match(/(\d[\d\s,.\u00a0]*)\s+(?:resultat|results?|träffar)\b/i);
  let totalHits: number | null = count ? Number(count[1].replace(/\D/g, '')) : null;
  if (totalHits !== null && !Number.isSafeInteger(totalHits)) throw new Error('Koha returnerade ett ogiltigt träffantal.');
  const empty = /(?:inga (?:resultat|träffar)|no results|no results found)/i.test(heading);
  if (!rows.length && !empty && totalHits !== 0) {
    throw new Error('Koha returnerade ett okänt svarsformat. Öppna katalogen direkt.');
  }
  if (empty) totalHits = 0;
  const hits = rows.map((_, node) => {
    const row = $(node);
    const link = row.find('a.title').first();
    const href = link.attr('href');
    const title = withoutLabels(link).replace(/\s*\/\s*$/, '');
    if (!href || !title) throw new Error('Koha returnerade en ofullständig post.');
    const author = row.find('ul.author li').map((_, item) =>
      text($(item)).replace(/\s*\[[^\]]*\]\s*$/, '')).get().join('; ') ||
      text(row.find('span.author'));
    return {
      title, author: author || undefined,
      year: text(row.find('.rda264_date').first()).match(/\b\d{4}\b/)?.[0] ||
        text(row.find('.results_summary.publisher')).match(/\b\d{4}\b/)?.[0],
      type: withoutLabels(row.find('.results_material_type').first()) ||
        row.find('.results_summary.type img.materialtype').attr('alt') ||
        withoutLabels(row.find('.results_summary.type').first()) || undefined,
      url: recordUrl(href, pageUrl), sourceId: source.id,
    };
  }).get();
  if (totalHits !== null && (totalHits < hits.length || (totalHits > 0 && !hits.length))) {
    throw new Error('Kohas träffantal stämmer inte med svaret.');
  }
  return { kind: 'results', result: { hits, totalHits, catalogueUrl: pageUrl } };
}

export async function solveAnubis(challenge: AnubisChallenge): Promise<{ nonce: number; hash: string }> {
  if (!globalThis.crypto?.subtle) throw new Error('Anubis kräver HTTPS och WebCrypto. Öppna katalogen direkt.');
  const encoder = new TextEncoder();
  const started = performance.now();
  for (let nonce = 0; nonce < 500_000 && performance.now() - started < 15_000; nonce++) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',
      encoder.encode(challenge.challenge.randomData + nonce)));
    const hash = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    if (hash.startsWith('0'.repeat(challenge.rules.difficulty))) return { nonce, hash };
  }
  throw new Error('Anubis kunde inte lösas inom beräkningsgränsen. Öppna katalogen direkt.');
}
