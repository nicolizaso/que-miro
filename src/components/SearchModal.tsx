import { useEffect, useId, useRef, useState } from 'react';
import { useMediaStore } from '@/store';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { Search, Plus, Check, Tv, Film, AlertCircle, X } from 'lucide-react';
import { searchMulti, getGenreNames, TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { Dialog } from '@/components/ui/Dialog';
import { TMDbResult } from '@/types';

const DEBOUNCE_MS = 400;

/** Placeholder que ocupa el mismo alto que un resultado, para que no salte la UI. */
function ResultSkeleton() {
  return (
    <div className="flex gap-4 p-3 bg-bg-card border border-border-card rounded-2xl items-center animate-pulse">
      <div className="w-16 h-24 bg-border-card rounded-lg shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 bg-border-card rounded w-2/3" />
        <div className="h-3 bg-border-card rounded w-1/3" />
      </div>
    </div>
  );
}

export function SearchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMDbResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const { mediaList } = useMediaStore();
  const { addMedia } = useMediaActions();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setError('');
      setIsSearching(false);
      return;
    }

    // `cancelled` evita que una respuesta lenta pise a una búsqueda más nueva.
    let cancelled = false;
    setIsSearching(true);
    setError('');

    const timer = setTimeout(async () => {
      try {
        const res = await searchMulti(trimmedQuery);
        if (!cancelled) setResults(res);
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setError(
            err instanceof Error
              ? err.message
              : 'No pudimos completar la búsqueda.',
          );
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  // Al cerrar se limpia la búsqueda: reabrir con ⌘K tiene que empezar de cero.
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const handleAdd = async (result: TMDbResult) => {
    const title = result.title || result.name || '';
    const date = result.release_date || result.first_air_date || '';
    await addMedia({
      tmdbId: result.id,
      mediaType: result.media_type,
      title,
      posterPath: result.poster_path,
      backdropPath: result.backdrop_path,
      releaseYear: date ? date.split('-')[0] : '',
      genres: getGenreNames(result.genre_ids),
      status: 'por_ver',
    });
    showToast(`"${title}" se agregó a Por Ver.`);
    onClose();
  };

  const showEmptyState =
    !isSearching && !error && trimmedQuery !== '' && results.length === 0;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      label="Buscar títulos"
      initialFocusRef={inputRef}
      className="bg-overlay backdrop-blur-sm p-4 flex flex-col pt-16"
    >
      <div className="relative max-w-2xl w-full mx-auto flex flex-col gap-4 h-full">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-text-main p-2 flex items-center gap-2 text-sm"
        >
          <X size={18} aria-hidden="true" /> Cerrar
        </button>

        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
            size={20}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Buscar películas o series..."
            aria-label="Buscar películas o series"
            aria-describedby={statusId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-bg-card border border-border-card rounded-2xl py-4 pl-12 pr-4 text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent"
          />
        </div>

        {/* Cambios de estado anunciados por el lector de pantalla: sin esto, la
            búsqueda es silenciosa para quien no ve la lista actualizarse. */}
        <p id={statusId} role="status" aria-live="polite" className="sr-only">
          {isSearching
            ? 'Buscando...'
            : error
              ? error
              : trimmedQuery && `${results.length} resultados`}
        </p>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-20">
          {isSearching &&
            Array.from({ length: 3 }, (_, i) => <ResultSkeleton key={i} />)}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 bg-accent/10 border border-accent/20 rounded-2xl text-accent text-sm"
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {showEmptyState && (
            <div className="text-center text-text-muted py-12">
              <p>No encontramos nada para "{trimmedQuery}".</p>
              <p className="text-sm mt-2">Probá con otro título.</p>
            </div>
          )}

          {!isSearching &&
            !error &&
            results.map((result) => {
              const isAdded = mediaList.some((m) => m.tmdbId === result.id);
              const title = result.title || result.name || '';
              const date = result.release_date || result.first_air_date || '';
              const year = date ? date.split('-')[0] : '';

              return (
                <div
                  key={`${result.media_type}-${result.id}`}
                  className="flex gap-4 p-3 bg-bg-card border border-border-card rounded-2xl items-center"
                >
                  <div className="w-16 h-24 bg-border-card rounded-lg flex-shrink-0 overflow-hidden">
                    {result.poster_path ? (
                      <img
                        src={`${TMDB_IMAGE_BASE_URL}${result.poster_path}`}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-subtle">
                        {result.media_type === 'movie' ? (
                          <Film aria-hidden="true" />
                        ) : (
                          <Tv aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-text-main truncate">{title}</h4>
                    <div className="text-sm text-text-muted flex items-center gap-2">
                      <span>{year}</span>
                      <span aria-hidden="true">•</span>
                      <span>
                        {result.media_type === 'movie' ? 'Película' : 'Serie'}
                      </span>
                    </div>
                  </div>

                  {isAdded ? (
                    <span
                      className="p-3 bg-border-card rounded-xl text-text-muted flex items-center justify-center"
                      title="Ya está en tu biblioteca"
                    >
                      <Check size={20} aria-hidden="true" />
                      <span className="sr-only">Ya está en tu biblioteca</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAdd(result)}
                      className="p-3 bg-bg-main border border-border-card rounded-xl text-status-por-ver hover:bg-border-card transition-colors flex items-center justify-center"
                      aria-label={`Agregar "${title}" a Por Ver`}
                      title="Agregar a Por Ver"
                    >
                      <Plus size={20} aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </Dialog>
  );
}
