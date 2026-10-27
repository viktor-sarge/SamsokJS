import type { SearchHit } from './types';

export interface HitGroup {
  key: string;
  hit: SearchHit;
  links: { sourceId: string; url: string }[];
}

function matchingText(value: string | undefined): string {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv');
}

export function groupHits(hits: readonly SearchHit[]): HitGroup[] {
  const groups = new Map<string, HitGroup>();
  for (const [index, hit] of hits.entries()) {
    const fields = [hit.title, hit.author, hit.year, hit.type].map(matchingText);
    const key = fields.every(Boolean) ? JSON.stringify(fields) : `incomplete:${index}`;
    const group = groups.get(key);
    if (group) {
      if (!group.links.some((link) => link.sourceId === hit.sourceId && link.url === hit.url)) {
        group.links.push({ sourceId: hit.sourceId, url: hit.url });
      }
    } else {
      groups.set(key, { key, hit, links: [{ sourceId: hit.sourceId, url: hit.url }] });
    }
  }
  return [...groups.values()];
}

export interface FormatGroup {
  key: string;
  format: string;
  years: HitGroup[];
}

export interface TitleGroup {
  key: string;
  title: string;
  formats: FormatGroup[];
}

export interface AuthorGroup {
  key: string;
  author: string;
  titles: TitleGroup[];
}

export function groupByAuthor(groups: readonly HitGroup[]): AuthorGroup[] {
  const authors = new Map<string, AuthorGroup>();
  const titles = new Map<string, TitleGroup>();
  const formats = new Map<string, FormatGroup>();
  for (const group of groups) {
    const { hit } = group;
    const complete = [hit.author, hit.title, hit.year, hit.type].every((value) => matchingText(value));
    const authorKey = JSON.stringify(complete ? ['author', matchingText(hit.author)] : ['incomplete', group.key]);
    const titleKey = JSON.stringify([authorKey, matchingText(hit.title)]);
    const formatKey = JSON.stringify([titleKey, matchingText(hit.type)]);
    let author = authors.get(authorKey);
    if (!author) {
      author = { key: authorKey, author: hit.author?.trim() || '', titles: [] };
      authors.set(authorKey, author);
    }
    let title = titles.get(titleKey);
    if (!title) {
      title = { key: titleKey, title: hit.title, formats: [] };
      titles.set(titleKey, title);
      author.titles.push(title);
    }
    let format = formats.get(formatKey);
    if (!format) {
      format = { key: formatKey, format: hit.type?.trim() || '', years: [] };
      formats.set(formatKey, format);
      title.formats.push(format);
    }
    format.years.push(group);
  }
  const compare = (a: string, b: string) => matchingText(a).localeCompare(matchingText(b), 'sv', { numeric: true });
  const result = [...authors.values()].sort((a, b) => compare(a.author, b.author));
  for (const author of result) {
    author.titles.sort((a, b) => compare(a.title, b.title));
    for (const title of author.titles) {
      title.formats.sort((a, b) => compare(a.format, b.format));
      for (const format of title.formats) {
        format.years.sort((a, b) => compare(a.hit.year ?? '', b.hit.year ?? ''));
      }
    }
  }
  return result;
}
