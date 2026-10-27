import { useId, useState } from 'react';
import instance, { buildInfo } from 'virtual:samsok-instance';
import type { SourceState } from './search/session';
import { diagnosticReport } from './search/diagnostics';

export function DiagnosticReport({ state, query }: {
  state: Extract<SourceState, { status: 'error' }>;
  query: string;
}) {
  const [includeQuery, setIncludeQuery] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; message: string }>();
  const id = useId();
  const text = diagnosticReport({
    instance, build: buildInfo, source: state.source, failure: state.diagnostics,
    error: state.error, query, includeQuery,
    environment: {
      pageUrl: location.href, userAgent: navigator.userAgent, online: navigator.onLine, language: navigator.language,
    },
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ error: false, message: 'Rapporten har kopierats. Skicka den till er supportkontakt.' });
    } catch {
      setNotice({ error: true, message: 'Rapporten kunde inte kopieras. Ladda ner den eller kopiera texten manuellt.' });
    }
  };
  const download = () => {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `samsok-diagnostik-${state.source.id}-${state.diagnostics.failedAt.replaceAll(/[:.]/g, '-')}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setNotice({ error: false, message: 'Nedladdning av rapporten har begärts. Skicka filen till er supportkontakt.' });
    } catch {
      setNotice({ error: true, message: 'Rapporten kunde inte laddas ner. Kopiera texten manuellt.' });
    } finally {
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    }
  };
  return (
    <details className="diagnostic-report" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Felsökningsrapport: {state.source.name}</summary>
      {expanded && (
        <>
          <p>Skicka rapporten till er supportkontakt när katalogen inte fungerar.
            Inget skickas automatiskt. Rapporten innehåller tekniska uppgifter om webbläsaren,
            katalogen, felet och tidsåtgången, men inga cookies eller svarstexter från katalogen.</p>
          <label className="catalogue-option">
            <input type="checkbox" checked={includeQuery} onChange={(event) => {
              setIncludeQuery(event.target.checked);
              setNotice(undefined);
            }} />
            Ta med sökfrågan i rapporten
          </label>
          <p>{includeQuery
            ? 'Sökfrågan kommer att ingå. Kontrollera att den inte innehåller känsliga uppgifter.'
            : 'Sökfrågan är utelämnad. Ta bara med den om den behövs för felsökningen.'}</p>
          <label htmlFor={id}>Rapport för {state.source.name}</label>
          <textarea id={id} readOnly rows={12} value={text} spellCheck={false} />
          <div className="diagnostic-actions">
            <button type="button" className="secondary" onClick={() => void copy()}>Kopiera rapport</button>
            <button type="button" className="secondary" onClick={download}>Ladda ner rapport</button>
          </div>
          {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.message}</p>}
        </>
      )}
    </details>
  );
}
