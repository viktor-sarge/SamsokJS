import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectArena, solveArenaCookie } from '../../modern/src/search/arena-parser';
import { arenaQueryUrl } from '../../modern/src/search/arena';
import { resolveInstance } from '../../config/schema';
import halland from '../../instances/halland.json';
import registry from '../../config/sources.json';

const source = resolveInstance(halland, registry).sources.find((source) => source.id === 'halmstad');
if (!source || source.adapter !== 'arena') throw new Error('Expected Arena source');
const url = 'https://nova.halmstad.se/search?q=book';
const fixture = readFileSync(new URL('../fixtures/arena-results.html', import.meta.url), 'utf8');
const cookie = readFileSync(new URL('../fixtures/arena-cookie.html', import.meta.url), 'utf8');
const alternatives = readFileSync(new URL('../fixtures/arena-alternatives.html', import.meta.url), 'utf8');

describe('Arena parsing', () => {
  it('returns zero exact matches instead of exposing alternative-spelling records', () => {
    for (const content of [
      alternatives, alternatives.replace('inga träffar', '0 träffar'),
      alternatives.replace('gav inga träffar', 'returned no results'),
      alternatives.replace('href="/results/alternative"', 'href="javascript:invalid"'),
    ]) {
      expect(inspectArena(content, source, url)).toEqual({
        kind: 'results', result: { totalHits: 0, hits: [], catalogueUrl: url },
      });
    }
  });
  it('extracts metadata and totals while ignoring alternative searches', () => {
    expect(inspectArena(fixture, source, url)).toEqual({
      kind: 'results', result: { totalHits: 1234, catalogueUrl: url, hits: [{
        title: 'Vinter & vår', author: 'Anna Exempel', type: 'Bok', year: '2020',
        sourceId: 'halmstad', url: 'https://nova.halmstad.se/web/arena/results?p_r_p_arena_urn%3Aarena_member_id=123',
      }] },
    });
  });
  it('supports paging totals, unknown totals, and explicit empty results', () => {
    const noFeedback = fixture.replace(/<div class="arena-feedback">[\s\S]*?<\/div>/, '');
    expect(inspectArena(noFeedback + '<span>1-10 av 450</span>', source, url))
      .toMatchObject({ kind: 'results', result: { totalHits: 450 } });
    expect(inspectArena(noFeedback, source, url)).toMatchObject({ kind: 'results', result: { totalHits: null } });
    expect(inspectArena('<div class="arena-feedback">Din sökning gav inga träffar</div>', source, url))
      .toMatchObject({ kind: 'results', result: { totalHits: 0, hits: [] } });
  });
  it('recognizes the dedicated zero-hit panel without running deferred suggestion scripts', () => {
    const empty = '<div class="arena-feedback"></div><div class="arena-zero-list"><wicket-container><img alt="Loading..."></wicket-container></div>';
    expect(inspectArena(empty, source, url)).toMatchObject({ kind: 'results', result: { totalHits: 0, hits: [] } });
    expect(() => inspectArena('<div>Loading...</div>', source, url)).toThrow('okänt');
    expect(() => inspectArena(fixture + empty, source, url)).toThrow();
  });
  it('extracts detail metadata excluding numbering and material labels', () => {
    expect(inspectArena(`<div class="arena-detail-title"><span class="arena-result-item-number">1</span>
      <span class="mediaclass-label">Bok</span><span>Example</span></div>
      <div class="arena-detail-author"><span class="arena-value">Author</span></div>
      <link rel="canonical" href="/web/arena/results/123">`, source, url))
      .toMatchObject({ kind: 'results', result: { totalHits: 1, hits: [{
        title: 'Example', author: 'Author', url: 'https://nova.halmstad.se/web/arena/results/123',
      }] } });
  });
  it('decodes literal single-result redirects without executing code', () => {
    expect(inspectArena('<script>jQuery(function(){location.replace("\\x2fweb\\x2farena\\x2fresults?id=1")})</script>', source, url))
      .toEqual({ kind: 'redirect', url: 'https://nova.halmstad.se/web/arena/results?id=1' });
    expect(() => inspectArena('<script>location.replace("https://evil.example/")</script>', source, url)).toThrow('extern');
  });
  it('rejects unknown pages, incomplete records, unsafe links, inconsistent totals and huge pages', () => {
    expect(() => inspectArena('<h1>Maintenance</h1>', source, url)).toThrow('okänt');
    expect(() => inspectArena(fixture.replace('href="/web/arena/results?p_r_p_arena_urn%3Aarena_member_id=123"', ''), source, url)).toThrow('ofullständig');
    expect(() => inspectArena(fixture.replace('/web/arena/results?p_r_p_arena_urn%3Aarena_member_id=123', 'javascript:alert(1)'), source, url)).toThrow('ogiltig');
    expect(inspectArena(fixture.replace('1 234', '0'), source, url))
      .toMatchObject({ kind: 'results', result: { totalHits: 0, hits: [] } });
    expect(() => inspectArena(fixture.replace('1 234', '1') + fixture, source, url)).toThrow();
    expect(() => inspectArena('x'.repeat(2_000_001), source, url)).toThrow('för stort');
  });
});

describe('Arena arithmetic cookie challenge', () => {
  it('computes factors and branch arithmetic without running remote code', () => {
    expect(solveArenaCookie(cookie)).toBe('TEST=7*11:2:123:1;SameSite=Strict; Secure');
    expect(inspectArena(cookie, source, url)).toEqual({ kind: 'cookie', cookie: 'TEST=7*11:2:123:1' });
  });
  it('rejects unexpected expressions and excessive computation', () => {
    for (const changed of [
      cookie.replace('p+=0;', 'fetch("https://evil.example");'),
      cookie.replace('p+=0;', 'p+=9000000000000000;'),
      cookie.replace('var p=77', 'var p=9007199254740993'),
      cookie.replace('p+=3*2', 'p+=9007199254740993*0'),
      cookie.replace('>> 1', '>> 32'),
      cookie.replace('var s=2', 'var s=999999999999'),
    ]) expect(() => solveArenaCookie(changed)).toThrow();
  });
  it('encodes Unicode, spaces and literal plus independently', () => {
    const result = arenaQueryUrl(source, 'räv & bok +');
    expect(result).toContain('r%C3%A4v+%26+bok+%2B');
    expect(new URL(result).searchParams.get('p_r_p_arena_urn:arena_search_query')).toBe('räv & bok +');
  });
});
