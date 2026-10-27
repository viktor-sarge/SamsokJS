import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import instance from 'virtual:samsok-instance';
import { SearchSession } from './search/session';
import type { SourceState } from './search/session';
import type { SearchHit } from './search/types';
import { queryUrl } from './search/urls';
import { loadSelection, saveSelection } from './preferences';
import { readQuery, searchHash } from './location';
import { groupByAuthor, groupHits } from './search/grouping';
import { DiagnosticReport } from './DiagnosticReport';

function librisUrl(hit: SearchHit): string {
  const url = new URL('https://libris.kb.se/hitlist');
  url.searchParams.set('d', 'libris');
  url.searchParams.set('q', [hit.author, hit.title, hit.year].filter(Boolean).join(' '));
  return url.href;
}

function jumpTo(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  const target = document.getElementById(event.currentTarget.hash.slice(1));
  if (!target) throw new Error('Missing navigation target');
  target.focus({ preventScroll: true });
  target.scrollIntoView();
}

export default function App() {
  const [query, setQuery] = useState(() => readQuery(location.hash));
  const [draft, setDraft] = useState(query);
  const [selection, setSelection] = useState(() => loadSelection(instance));
  const [filter, setFilter] = useState('');
  const [snapshot, setSnapshot] = useState<{ key: string; states: SourceState[] }>({ key: '', states: [] });
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const session = useMemo(() => new SearchSession(instance.proxy), []);
  const selectedKey = JSON.stringify(selection.selected);
  const requestKey = JSON.stringify([query, selectedKey]);
  const sources = instance.sources.filter((source) => selection.selected.includes(source.id));
  const states: SourceState[] = snapshot.key === requestKey
    ? snapshot.states
    : query ? sources.map((source) => ({ source, status: 'loading' })) : [];

  useEffect(() => {
    const onHashChange = () => {
      const next = readQuery(location.hash);
      setQuery(next);
      setDraft(next);
      setFilter('');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const selected: string[] = JSON.parse(selectedKey);
    return session.start(
      query,
      instance.sources.filter((source) => selected.includes(source.id)),
      (next) => setSnapshot({ key: requestKey, states: next }),
    );
  }, [session, query, selectedKey, requestKey]);

  const hits = states.flatMap((state) => state.status === 'success' ? state.result.hits : []);
  const groups = groupHits(hits);
  const term = filter.trim().toLocaleLowerCase(instance.locale);
  const filtered = groups.filter(({ hit, links }) => [
    hit.title, hit.author, hit.year, hit.type,
    ...links.map((link) => instance.sources.find((source) => source.id === link.sourceId)?.name),
  ].some((text) => text?.toLocaleLowerCase(instance.locale).includes(term)));
  const authors = groupByAuthor(filtered);
  const completed = states.filter((state) => state.status !== 'loading').length;
  const loading = states.some((state) => state.status === 'loading');
  const failed = states.some((state) => state.status === 'error');

  const choose = (selected: string[]) => {
    const warning = saveSelection(instance, selected);
    setSelection({ selected, warning });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = draft.trim();
    if (!next || !sources.length) return;
    setQuery(next);
    setFilter('');
    location.hash = searchHash(next);
    resultsHeading.current?.focus();
  };

  return (
    <>
      <a className="skip-link" href="#main" onClick={jumpTo}>Till innehållet</a>
      <header className="site-header">
        <div className="container header-inner">
          <span className="brand">{instance.branding.title}</span>
          <nav aria-label="Huvudnavigation">
            <a href="#catalogues" onClick={jumpTo}>Välj kataloger</a>
            <a href="#about" onClick={jumpTo}>Om tjänsten</a>
          </nav>
        </div>
      </header>
      <main id="main" className="container" tabIndex={-1}>
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">{instance.branding.title}</p>
          <h1 id="page-title">{instance.branding.subtitle}</h1>
          <p className="intro">{instance.content.intro}</p>
          <form className="search-form" role="search" onSubmit={submit}>
            <label htmlFor="query">Vad letar du efter?</label>
            <div className="search-controls">
              <input id="query" type="search" value={draft} onChange={(event) => setDraft(event.target.value)}
                placeholder="Titel, författare eller ämne" required />
              <button type="submit" disabled={!draft.trim() || !sources.length}>Sök</button>
            </div>
            <p className="muted">{sources.length} av {instance.sources.length} kataloger valda</p>
          </form>
        </section>
        {selection.warning && <p role="alert" className="notice">{selection.warning}</p>}
        <div className="search-layout">
          <section className="results" aria-labelledby="results-heading">
            <h2 id="results-heading" ref={resultsHeading} tabIndex={-1}>
              {query ? `Sökresultat för ”${query}”` : 'Här börjar din sökning'}
            </h2>
            {!sources.length && <p className="notice">Välj minst en katalog för att söka.</p>}
            {!query && <p className="muted">Välj kataloger och skriv en sökning. Träffarna samlas här.</p>}
            {query && states.length > 0 && (
              <>
                <div className="search-progress">
                  <label htmlFor="search-progress">Kataloger klara: {completed} av {states.length}</label>
                  <progress id="search-progress" value={completed} max={states.length} />
                </div>
                <p role="status" aria-live="polite">
                  {loading ? 'Söker' : 'Sökningen är klar'}. {hits.length} hämtade träffar.
                  {' '}{groups.length} grupperade träffar.
                  {failed && ' En eller flera kataloger kunde inte sökas.'}
                </p>
                <ul className="source-status" aria-label="Status per katalog">
                  {states.map((state) => (
                    <li key={state.source.id}>
                      <a href={queryUrl(state.source.catalogueUrl, query)} target="_blank" rel="noopener noreferrer">
                        {state.source.name}
                      </a>
                      {state.status === 'loading' && <span> Söker…</span>}
                      {state.status === 'error' && (
                        <div className="source-error">
                          <p>{state.error}</p>
                          <button className="secondary" onClick={() => session.retry(state.source.id)}
                            aria-label={`Försök igen: ${state.source.name}`}>Försök igen</button>
                          <DiagnosticReport key={`${state.source.id}:${state.diagnostics.startedAt}:${state.diagnostics.attempt}`}
                            state={state} query={query} />
                        </div>
                      )}
                      {state.status === 'success' && (
                        <span> {state.result.hits.length} hämtade
                          {state.result.totalHits === null ? ' (totalt antal okänt)' : ` av ${state.result.totalHits} träffar`}.
                          {state.result.totalHits !== null && state.result.hits.length < state.result.totalHits &&
                            ' Öppna katalogen för alla träffar.'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="result-filter">
                  <label htmlFor="filter">Filtrera hämtade träffar</label>
                  <input id="filter" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
                  <p className="muted">Visar {filtered.length} av {groups.length} grupperade träffar ({hits.length} hämtade träffar)</p>
                </div>
                {!loading && !hits.length && (
                  <p>{failed ? 'Inga träffar kunde hämtas. Prova kataloglänkarna eller försök igen.' : 'Inga träffar hittades.'}</p>
                )}
                {hits.length > 0 && !filtered.length && <p>Inga träffar matchar filtret.</p>}
                <ul className="result-list">
                  {authors.map((author) => (
                    <li className="author-group" key={author.key}>
                      <h3>{author.author || 'Författare saknas'}</h3>
                      <ul className="title-groups">
                        {author.titles.map((title) => (
                          <li className="title-group" key={title.key}>
                            <h4>{title.title}</h4>
                            <ul className="format-groups">
                              {title.formats.map((format) => (
                                <li className="format-group" key={format.key}>
                                  <h5>{format.format || 'Format saknas'}</h5>
                                  <ul className="year-groups">
                                    {format.years.map(({ key, hit, links }) => (
                                      <li className="result-card year-group" key={key}>
                                        <div>
                                          <h6>{hit.year?.trim() || 'Utgivningsår saknas'}</h6>
                                          <ul className="library-links" aria-label={`Bibliotek för ${hit.title}, ${hit.year || 'utgivningsår saknas'}, ${hit.type || 'format saknas'}`}>
                                            {links.map((link) => (
                                              <li key={JSON.stringify([link.sourceId, link.url])}>
                                                <a href={link.url} target="_blank" rel="noopener noreferrer">
                                                  {instance.sources.find((source) => source.id === link.sourceId)?.name}
                                                  <span className="sr-only">: {hit.title}, {hit.year || 'utgivningsår saknas'}, {hit.type || 'format saknas'}</span>
                                                </a>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                        <a className="libris-link" href={librisUrl(hit)} target="_blank" rel="noopener noreferrer">
                                          Sök i Libris<span className="sr-only">: {hit.title}, {hit.year || 'utgivningsår saknas'}, {hit.type || 'format saknas'}</span>
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <aside id="catalogues" className="catalogue-panel" aria-labelledby="catalogues-heading" tabIndex={-1}>
            <h2 id="catalogues-heading">Dina kataloger</h2>
            <p className="muted">Sök i ett eller flera bibliotek.</p>
            <label className="catalogue-option all-catalogues">
              <input type="checkbox" checked={sources.length === instance.sources.length}
                onChange={(event) => choose(event.target.checked ? instance.sources.map((source) => source.id) : [])} />
              Markera alla
            </label>
            {instance.sourceGroups.map((group) => (
              <fieldset key={group.id}>
                <legend>{group.label}</legend>
                {group.sources.map((id) => (
                  <label key={id} className="catalogue-option">
                    <input type="checkbox" checked={selection.selected.includes(id)}
                      onChange={(event) => choose(event.target.checked
                        ? [...selection.selected, id]
                        : selection.selected.filter((value) => value !== id))} />
                    {instance.sources.find((source) => source.id === id)?.name}
                  </label>
                ))}
              </fieldset>
            ))}
          </aside>
        </div>
      </main>
      <footer id="about" className="container site-footer" tabIndex={-1}>
        <h2>Om {instance.branding.title}</h2>
        <p>{instance.content.about}</p>
        <a href="https://github.com/viktor-sarge/SamsokJS" target="_blank" rel="noopener noreferrer">Källkod på GitHub</a>
      </footer>
    </>
  );
}
