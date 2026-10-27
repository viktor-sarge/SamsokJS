export function queryUrl(template: string, query: string): string {
  return template.replaceAll('@QUERY@', encodeURIComponent(query));
}
