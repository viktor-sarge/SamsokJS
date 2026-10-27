import type { SearchHit } from './types';

export interface HitGroup {
  key: string;
  hit: SearchHit;
  links: { sourceId: string; url: string }[];
}

export function groupHits(hits: readonly SearchHit[]): HitGroup[] {
  const groups = new Map<string, HitGroup>();
  for (const [index, hit] of hits.entries()) {
    const fields = [hit.title, hit.author, hit.year, hit.type].map((value) =>
      (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv'));
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
