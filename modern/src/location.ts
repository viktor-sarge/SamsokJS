export function readQuery(hash: string): string {
  const params = hash.startsWith('#/search?')
    ? hash.slice('#/search?'.length)
    : hash.startsWith('#?') ? hash.slice(2) : '';
  return new URLSearchParams(params).get('query')?.trim() ?? '';
}

export function searchHash(query: string): string {
  return `#/search?${new URLSearchParams({ query }).toString()}`;
}
