import { useEffect, useId, useRef, useState } from 'react';
import { useMediaStore } from '@/store';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import {
  Search,
  Plus,
  Check,
  Tv,
  Film,
  AlertCircle,
  X,
  BookmarkCheck,
  Loader2,
} from 'lucide-react';
import { searchMulti, getGenreNames, TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { Dialog } from '@/components/ui/Dialog';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { MediaStatus, TMDbResult } from '@/types';

const DEBOUNCE_MS = 400;

/** Placeholder que ocupa el mismo alto que un resultado, para que no salte la UI. */
function ResultSkeleton() {
  return (
    <div className="flex gap-4 p-3 surface items-center animate-pulse">
      <div className="w-16 h-24 bg-border-card rounded-lg shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 bg-border-card rounded w-2/3" />
        <div className="h-3 bg-border-card rounded w-1/3" />
      </div>
    </div>
  );
}

/**
 * Un resultado de la búsqueda.
 *
 * La fila entera abre la ficha —es lo que se espera al tocar algo que tiene
 * póster, título y año— y al costado quedan las dos listas a las que se llega
 * sin abrirla: *Por Ver* para lo que se anota para después, *Completadas* para
 * lo que ya se vio. Son las mismas dos de la ficha de Explorar.
 */
function ResultRow({
  result,
  onSaved,
}: {
  result: TMDbResult;
  /** Se llama cuando el título quedó guardado, para cerrar el buscador. */
  onSaved: () => void;
}) {
  const mediaList = useMediaStore((state) => state.mediaList);
  const { addMedia, updateStatus } = useMediaActions();
  const { showToast } = useToast();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  /** Estado que se está guardando, para el spinner del botón que lo pidió. */
  const [savingStatus, setSavingStatus] = useState<MediaStatus | null>(null);

  const saved = mediaList.find((media) => media.tmdbId === result.id);
  const title = result.title || result.name || '';
  const date = result.release_date || result.first_air_date || '';
  const year = date ? date.split('-')[0] : '';
  const isCompleted = saved?.status === 'completada';

  /**
   * Manda el título a una de las dos listas.
   *
   * Si ya está en la biblioteca solo cambia de estado: volver a agregarlo lo
   * escribiría de cero y se llevaría puestos la reseña, el historial y el
   * progreso de temporadas que tuviera.
   */
  const save = async (status: MediaStatus, listName: string) => {
    if (savingStatus) return;

    setSavingStatus(status);
    try {
      if (saved) {
        await updateStatus(saved.tmdbId, status);
        showToast(`"${title}" pasó a ${listName}.`);
      } else {
        await addMedia({
          tmdbId: result.id,
          mediaType: result.media_type,
          title,
          posterPath: result.poster_path,
          backdropPath: result.backdrop_path,
          releaseYear: year,
          genres: getGenreNames(result.genre_ids ?? []),
          status,
        });
        showToast(`"${title}" se agregó a ${listName}.`);
      }
    } finally {
      setSavingStatus(null);
    }

    // El buscador se cierra con la acción hecha: se abre para resolver algo
    // puntual, y el aviso ya dice dónde fue a parar el título.
    onSaved();
  };

  return (
    <div className="flex gap-2 p-3 surface items-center transition-colors hover:border-text-subtle">
      {/* Un botón de verdad y no un div con onClick: es la única forma de abrir
          la ficha con teclado. Los botones de lista quedan afuera porque no se
          pueden anidar adentro de otro botón. */}
      <button
        type="button"
        onClick={() => setIsDetailOpen(true)}
        // Nombre accesible explícito: sin él sale de concatenar todo lo que la
        // fila tiene adentro —"Juego de tronos 2011 • Serie"— y no dice qué
        // hace el botón.
        aria-label={`Ver detalle de ${title}`}
        className="flex flex-1 items-center gap-4 min-w-0 text-left rounded-control cursor-pointer"
      >
        <span className="block w-16 h-24 bg-border-card rounded-lg shrink-0 overflow-hidden">
          {result.poster_path ? (
            <img
              src={`${TMDB_IMAGE_BASE_URL}${result.poster_path}`}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-text-subtle">
              {result.media_type === 'movie' ? (
                <Film aria-hidden="true" />
              ) : (
                <Tv aria-hidden="true" />
              )}
            </span>
          )}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block font-bold text-text-main truncate">{title}</span>
          <span className="text-sm text-text-muted flex items-center gap-2">
            <span>{year}</span>
            <span aria-hidden="true">•</span>
            <span>{result.media_type === 'movie' ? 'Película' : 'Serie'}</span>
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {saved ? (
          // Un marcador y no un tilde pelado: el tilde de al lado quiere decir
          // "completada", y dos tildes juntos no dicen ninguna de las dos
          // cosas.
          <span
            className="btn-icon w-11 h-11 bg-border-card text-text-muted"
            title="Ya está en tu biblioteca"
          >
            <BookmarkCheck size={20} aria-hidden="true" />
            <span className="sr-only">Ya está en tu biblioteca</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => save('por_ver', 'Por Ver')}
            disabled={savingStatus !== null}
            className="btn-icon w-11 h-11 bg-bg-main border border-border-card text-status-por-ver hover:bg-border-card"
            aria-label={`Agregar "${title}" a Por Ver`}
            title="Agregar a Por Ver"
          >
            {savingStatus === 'por_ver' ? (
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={20} aria-hidden="true" />
            )}
          </button>
        )}

        {isCompleted ? (
          <span
            className="btn-icon w-11 h-11 bg-status-completada/15 text-status-completada"
            title="Ya está en Completadas"
          >
            <Check size={20} aria-hidden="true" />
            <span className="sr-only">Ya está en Completadas</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => save('completada', 'Completadas')}
            disabled={savingStatus !== null}
            className="btn-icon w-11 h-11 bg-bg-main border border-border-card text-status-completada hover:bg-border-card"
            aria-label={`Marcar "${title}" como completada`}
            title="Marcar Completada"
          >
            {savingStatus === 'completada' ? (
              <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            ) : (
              <Check size={20} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {isDetailOpen && (
        <TitleDetailModal
          id={result.id}
          mediaType={result.media_type}
          media={saved}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
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
            className="w-full bg-bg-card border border-border-control rounded-surface shadow-pop py-4 pl-12 pr-4 text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors"
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
              className="flex items-start gap-3 p-4 bg-accent/10 border border-accent/20 rounded-surface text-accent text-sm"
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
            results.map((result) => (
              <ResultRow
                key={`${result.media_type}-${result.id}`}
                result={result}
                onSaved={onClose}
              />
            ))}
        </div>
      </div>
    </Dialog>
  );
}
