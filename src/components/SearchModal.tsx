import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMediaStore } from '@/store';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { Search, Tv, Film, AlertCircle, X, User } from 'lucide-react';
import {
  searchTitlesAndPeople,
  getGenreNames,
  TMDB_AVATAR_URL,
  TMDB_IMAGE_BASE_URL,
  TitleAndPeopleSearch,
} from '@/lib/tmdb';
import { personSearchCaption } from '@/lib/person';
import { Dialog } from '@/components/ui/Dialog';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { QuickStatusButtons } from '@/components/QuickStatusButtons';
import { MediaStatus, SavedMedia, TMDbPerson, TMDbResult } from '@/types';

const DEBOUNCE_MS = 400;

const NO_RESULTS: TitleAndPeopleSearch = { titles: [], people: [], peopleFirst: false };

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
 * lo que ya se vio. Son las mismas dos de la ficha de Explorar, y el tilde
 * pide la reseña igual que en la biblioteca.
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
  /** La reseña que se pide al marcar algo como completado. */
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  /**
   * Lo que se acaba de guardar desde acá, hasta que el store lo devuelva.
   *
   * Con sesión iniciada la escritura no espera al servidor y el título vuelve
   * por `onSnapshot`, un rato después. El drawer de reseña necesita el título
   * guardado *ya*, así que hasta entonces vale esta copia.
   */
  const [justSaved, setJustSaved] = useState<SavedMedia | null>(null);

  const saved =
    mediaList.find((media) => media.tmdbId === result.id) ?? justSaved;
  const title = result.title || result.name || '';
  const date = result.release_date || result.first_air_date || '';
  const year = date ? date.split('-')[0] : '';

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
      } else {
        const draft: SavedMedia = {
          tmdbId: result.id,
          mediaType: result.media_type,
          title,
          posterPath: result.poster_path,
          backdropPath: result.backdrop_path,
          releaseYear: year,
          genres: getGenreNames(result.genre_ids ?? []),
          status,
          updatedAt: new Date().toISOString(),
        };
        setJustSaved(draft);
        // Si quedó esperando al login, todavía no está en ninguna lista.
        if ((await addMedia(draft)) === 'pending') setJustSaved(null);
      }
    } finally {
      setSavingStatus(null);
    }

    /**
     * Completar algo es tener algo para decir al respecto, así que la reseña
     * se ofrece sola, igual que al marcar completada una tarjeta de la
     * biblioteca.
     *
     * Es opcional: el título ya quedó en Completadas, y cerrar el drawer lo
     * deja ahí sin puntaje. El buscador se queda abierto detrás —cerrarlo de
     * abajo del drawer serían dos pantallas yéndose de una— y la fila, ya
     * marcada, muestra dónde terminó el título.
     */
    if (status === 'completada') {
      setIsReviewOpen(true);
      return;
    }

    showToast(`"${title}" se agregó a ${listName}.`);
    // Con la acción hecha el buscador se cierra: se abre para resolver algo
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

      <QuickStatusButtons
        title={title}
        saved={saved}
        savingStatus={savingStatus}
        onSave={(status) =>
          save(status, status === 'completada' ? 'Completadas' : 'Por Ver')
        }
      />

      {isDetailOpen && (
        <TitleDetailModal
          id={result.id}
          mediaType={result.media_type}
          media={saved ?? undefined}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}

      {isReviewOpen && saved && (
        <ReviewDrawer
          media={saved}
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Una persona encontrada: lleva a su página, que es donde está lo que se
 * puede hacer con ella —su filmografía, qué viste, qué te falta—.
 *
 * El marco ya cierra el buscador cuando cambia la página, pero si ya estás en
 * la de esa persona la ruta no cambia y quedaría abierto encima: por eso la
 * fila también lo cierra.
 */
function PersonRow({ person, onOpen }: { person: TMDbPerson; onOpen: () => void }) {
  const caption = personSearchCaption(person);

  return (
    <Link
      to={`/persona/${person.id}`}
      onClick={onOpen}
      className="flex gap-4 p-3 surface items-center transition-colors hover:border-text-subtle"
    >
      <span className="w-12 h-12 rounded-full bg-border-card shrink-0 overflow-hidden grid place-items-center text-text-subtle">
        {person.profile_path ? (
          <img
            src={`${TMDB_AVATAR_URL}${person.profile_path}`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <User aria-hidden="true" />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-text-main truncate">{person.name}</span>
        {caption && (
          <span className="block text-sm text-text-muted truncate">{caption}</span>
        )}
      </span>
    </Link>
  );
}

/**
 * Un grupo de resultados. El título solo aparece cuando hay dos grupos: con
 * películas y series nada más, la lista es la de siempre y no hace falta
 * decir de qué es.
 */
function ResultGroup({
  heading,
  showHeading,
  children,
}: {
  heading: string;
  showHeading: boolean;
  children: React.ReactNode;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={showHeading ? headingId : undefined} className="flex flex-col gap-3">
      {showHeading && (
        <h2 id={headingId} className="text-eyebrow text-text-subtle">
          {heading}
        </h2>
      )}
      {children}
    </section>
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
  const [results, setResults] = useState<TitleAndPeopleSearch>(NO_RESULTS);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setResults(NO_RESULTS);
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
        const res = await searchTitlesAndPeople(trimmedQuery);
        if (!cancelled) setResults(res);
      } catch (err) {
        if (!cancelled) {
          setResults(NO_RESULTS);
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

  const { titles, people, peopleFirst } = results;
  const resultCount = titles.length + people.length;
  const showEmptyState =
    !isSearching && !error && trimmedQuery !== '' && resultCount === 0;
  const showHeadings = titles.length > 0 && people.length > 0;

  const titleGroup = titles.length > 0 && (
    <ResultGroup key="titles" heading="Películas y series" showHeading={showHeadings}>
      {titles.map((result) => (
        <ResultRow
          key={`${result.media_type}-${result.id}`}
          result={result}
          onSaved={onClose}
        />
      ))}
    </ResultGroup>
  );
  const peopleGroup = people.length > 0 && (
    <ResultGroup key="people" heading="Personas" showHeading={showHeadings}>
      {people.map((person) => (
        <PersonRow key={person.id} person={person} onOpen={onClose} />
      ))}
    </ResultGroup>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      label="Buscar"
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
            placeholder="Buscar películas, series o personas..."
            aria-label="Buscar películas, series o personas"
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
              : trimmedQuery && `${resultCount} resultados`}
        </p>

        <div className="flex-1 overflow-y-auto flex flex-col gap-6 pb-20">
          {isSearching && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, i) => <ResultSkeleton key={i} />)}
            </div>
          )}

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
              <p className="text-sm mt-2">Probá con otro título o nombre.</p>
            </div>
          )}

          {/* Primero lo que TMDB rankeó más alto: quien escribe "darín" busca a
              alguien, y quien escribe "matrix", la película. */}
          {!isSearching &&
            !error &&
            (peopleFirst ? [peopleGroup, titleGroup] : [titleGroup, peopleGroup])}
        </div>
      </div>
    </Dialog>
  );
}
