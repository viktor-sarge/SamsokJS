export interface SearchHit {
  title: string;
  author?: string;
  year?: string;
  type?: string;
  url: string;
  sourceId: string;
}

export interface SearchResult {
  hits: SearchHit[];
  totalHits: number | null;
  catalogueUrl: string;
}
