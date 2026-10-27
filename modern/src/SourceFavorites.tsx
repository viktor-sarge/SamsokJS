import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Instance } from '../../config/schema';
import { favoriteNameKey, loadFavorites, saveFavorites } from './preferences';
import type { SourceFavorite } from './preferences';

export function SourceFavorites({ instance, selected, onChoose }: {
  instance: Instance;
  selected: string[];
  onChoose: (selected: string[]) => void;
}) {
  const [saved, setSaved] = useState(() => loadFavorites(instance));
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const saveButton = useRef<HTMLButtonElement>(null);

  const persist = (favorites: SourceFavorite[]): boolean => {
    const warning = saveFavorites(instance, favorites);
    setError(warning ?? '');
    if (warning) return false;
    setSaved({ favorites });
    return true;
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const trimmed = name.trim().replace(/\s+/g, ' ').normalize('NFC');
    if (!trimmed) {
      setError('Ange ett namn på favoriten.');
      return;
    }
    if (saved.favorites.some((favorite) => favoriteNameKey(favorite.name) === favoriteNameKey(trimmed))) {
      setError('Det finns redan en favorit med det namnet. Välj ett annat namn.');
      return;
    }
    if (!persist([...saved.favorites, { name: trimmed, selected: [...selected] }])) return;
    setName('');
    setEditing(false);
    setMessage(`Favoriten ”${trimmed}” sparades.`);
    saveButton.current?.focus();
  };
  const remove = (name: string) => {
    if (!window.confirm(`Vill du ta bort favoriten ”${name}”?`)) return;
    setMessage('');
    if (!persist(saved.favorites.filter((favorite) => favorite.name !== name))) return;
    setMessage(`Favoriten ”${name}” togs bort.`);
    saveButton.current?.focus();
  };

  return (
    <section className="source-favorites" aria-labelledby="favorites-heading">
      <h3 id="favorites-heading">Mina favoriter</h3>
      {saved.warning && <p role="alert" className="source-error">{saved.warning}</p>}
      {saved.favorites.length > 0 && (
        <ul className="favorite-list">
          {saved.favorites.map((favorite) => {
            const active = favorite.selected.length === selected.length &&
              favorite.selected.every((id) => selected.includes(id));
            return (
              <li key={favorite.name}>
                <button type="button" className="favorite-choice" aria-pressed={active}
                  onClick={() => {
                    onChoose([...favorite.selected]);
                    setMessage(`Katalogvalet ”${favorite.name}” används.`);
                  }}>{favorite.name}</button>
                <button type="button" className="favorite-delete" aria-label={`Ta bort favorit: ${favorite.name}`}
                  onClick={() => remove(favorite.name)}><span aria-hidden="true">&times;</span></button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="favorite-save" ref={saveButton} aria-expanded={editing}
        aria-controls="favorite-form" onClick={() => { setEditing(!editing); setError(''); setMessage(''); }}>
        Spara aktuellt val
      </button>
      {editing && (
        <form id="favorite-form" className="favorite-form" onSubmit={save}>
          <label htmlFor="favorite-name">Namn på favorit</label>
          <input id="favorite-name" type="text" value={name} maxLength={80}
            onChange={(event) => setName(event.target.value)} required autoFocus />
          <p className="muted">{selected.length} kataloger sparas. När du använder en favorit ersätts hela katalogvalet.</p>
          <button type="submit" className="secondary">Spara favorit</button>
        </form>
      )}
      {error && <p role="alert" className="source-error">{error}</p>}
      <p className="favorite-feedback" aria-live="polite">{message}</p>
    </section>
  );
}
