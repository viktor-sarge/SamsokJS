import type { SourceState } from './search/session';
import type { SearchResult } from './search/types';

function coverage(result: SearchResult): 'complete' | 'partial' | 'unknown' {
  if (result.totalHits === null) return 'unknown';
  return result.hits.length >= result.totalHits ? 'complete' : 'partial';
}

export function SourceCoverage({ result, locale }: { result: SearchResult; locale: string }) {
  const kind = coverage(result);
  const count = `${result.hits.length} ${result.hits.length === 1 ? 'träff' : 'träffar'}`;
  let label = `${count} (totalt antal okänt)`;
  if (kind === 'complete') label = count;
  if (result.totalHits !== null && kind === 'partial') {
    // Truncate so a partial response can never be displayed as 100%.
    const percent = Math.floor(result.hits.length * 1000 / result.totalHits) / 10;
    const formatted = result.hits.length > 0 && percent < 0.1
      ? `<${(0.1).toLocaleString(locale)}`
      : percent.toLocaleString(locale, { maximumFractionDigits: 1 });
    label = `Visar ${formatted}% (${count} av totalt ${result.totalHits})`;
  }
  return (
    <>{': '}<span className={`source-coverage source-coverage-${kind}`}>{label}</span></>
  );
}

export function SearchCoverage({ states }: { states: SourceState[] }) {
  const counts = { complete: 0, partial: 0, unknown: 0, loading: 0, error: 0 };
  const catalogues = (count: number) => `${count} ${count === 1 ? 'katalog' : 'kataloger'}`;
  for (const state of states) {
    counts[state.status === 'success' ? coverage(state.result) : state.status]++;
  }
  const complete = counts.complete === states.length;
  const heading = complete ? 'Alla träffar från de valda katalogerna har hämtats.'
    : counts.partial || counts.error ? 'Träfflistan är ofullständig.'
    : counts.loading ? 'Träfflistan är inte färdig.'
    : 'Träfflistans täckning är okänd.';
  return (
    <section className={`coverage-summary${complete ? ' coverage-summary-complete' : ''}`}
      aria-label="Träfflistans täckning" aria-live="polite" aria-atomic="true">
      <p><strong>{heading}</strong></p>
      <ul>
        <li>Alla träffar hämtade: {counts.complete} av {catalogues(states.length)}.</li>
        {counts.partial > 0 && <li>Delvis hämtade: {catalogues(counts.partial)}.</li>}
        {counts.unknown > 0 && <li>Okänd täckning: {catalogues(counts.unknown)}.</li>}
        {counts.loading > 0 && <li>Söker fortfarande: {catalogues(counts.loading)}.</li>}
        {counts.error > 0 && <li>Kunde inte sökas: {catalogues(counts.error)}.</li>}
      </ul>
      {!complete && <p>En färdig sökning betyder inte att alla träffar har hämtats. Se status och kataloglänkar nedan.</p>}
      <p className="muted">Täckningen gäller hämtade poster före gruppering och filtrering, inte antalet grupperade träffar.</p>
    </section>
  );
}
