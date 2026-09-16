import { ReactNode, useId, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';

interface PickerSearchProps<T> {
  /** Qué se está buscando. Va al campo, que no tiene etiqueta a la vista. */
  label: string;
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  itemKey: (item: T) => string | number;
  /** El nombre del resultado, para el lector de pantalla. */
  itemLabel: (item: T) => string;
  /** Cómo se dibuja un resultado: su imagen y su texto. */
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  /** Se llenaron los lugares: el campo queda deshabilitado con su explicación. */
  full?: boolean;
  fullHint?: string;
}

/** Tres filas grises del alto de un resultado, para que la lista no salte. */
function ResultsSkeleton() {
  return (
    <ul className="flex flex-col">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 px-3 py-2 animate-pulse">
          <div className="w-9 h-12 rounded bg-border-card shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 rounded bg-border-card w-1/2" />
            <div className="h-2.5 rounded bg-border-card w-1/4" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Campo de búsqueda para elegir una respuesta del cuestionario.
 *
 * Es el mismo componente para las tres preguntas que se contestan buscando —un
 * título, una persona, una productora—: lo único que cambia es a quién se le
 * pregunta y cómo se dibuja cada resultado. La lista aparece recién con dos
 * letras escritas, y al elegir algo el campo se vacía, que es lo que hace que
 * sumar el segundo actor no obligue a borrar el nombre del primero.
 */
export function PickerSearch<T>({
  label,
  placeholder,
  search,
  itemKey,
  itemLabel,
  renderItem,
  onSelect,
  full = false,
  fullHint,
}: PickerSearchProps<T>) {
  const [query, setQuery] = useState('');
  const statusId = useId();
  const { results, isSearching, error } = useDebouncedSearch(search, query);

  const trimmed = query.trim();
  const isOpen = !full && trimmed.length >= 2;
  const isEmpty = isOpen && !isSearching && !error && results.length === 0;

  const handleSelect = (item: T) => {
    onSelect(item);
    setQuery('');
  };

  if (full) {
    return (
      <p className="text-sm text-text-subtle">
        {fullHint ?? 'Llegaste al máximo. Sacá alguna para poder sumar otra.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={statusId}
          className="w-full bg-bg-main border border-border-control rounded-control py-2.5 pl-9 pr-3 text-sm placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Sin esto la búsqueda es silenciosa para quien no ve la lista cambiar. */}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {isSearching
          ? 'Buscando…'
          : error
            ? error
            : isOpen
              ? `${results.length} resultados`
              : ''}
      </p>

      {isOpen && (
        <div className="surface overflow-hidden max-h-72 overflow-y-auto">
          {isSearching && <ResultsSkeleton />}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 p-3 text-sm text-accent"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              {error}
            </p>
          )}

          {isEmpty && (
            <p className="p-3 text-sm text-text-muted">
              No encontramos nada para "{trimmed}".
            </p>
          )}

          {!isSearching && !error && results.length > 0 && (
            <ul className="divide-y divide-border-card">
              {results.map((item) => (
                <li key={itemKey(item)}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    aria-label={`Elegir ${itemLabel(item)}`}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-border-card transition-colors"
                  >
                    {renderItem(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
