import { useEffect, useMemo, useRef, useState } from 'react';
import { Shuffle, X, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { SavedMedia } from '@/types';
import { useMediaStore } from '@/store';
import { MediaCard } from '@/components/MediaCard';
import { ShareButton } from '@/components/ShareButton';
import { JustWatchCredit } from '@/components/Attribution';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { collectGenres, collectProviders, collectTags } from '@/lib/library';
import {
  DURATION_BUCKETS,
  DurationBucket,
  EMPTY_PICKER_FILTERS,
  PickerFilters,
  candidates,
  pickRandom,
  rememberPick,
} from '@/lib/picker';
import { MediaType } from '@/types';
import { cn } from '@/lib/utils';
import { hasSubscriptions, subscribedNames } from '@/lib/subscriptions';

/** Cuánto dura la vuelta de la ruleta. */
const SPIN_MS = 1400;
/** Cada cuánto cambia el póster que se ve girando. */
const FRAME_MS = 90;

/**
 * Sorteo con ruleta.
 *
 * La animación muestra pósters reales del pool pasando de largo, en vez del
 * `setTimeout` que solo esperaba sin mostrar nada: la espera es la misma, pero
 * ahora se ve de dónde sale el resultado. Para quien pidió menos movimiento en
 * su sistema, el sorteo es instantáneo.
 */
export function PickerRoulette({
  pending,
  together,
}: {
  pending: SavedMedia[];
  /**
   * Para sortear con otra persona ("¿Qué miramos juntos?"): el filtro de
   * plataformas pasa a ser "de los dos", los de la biblioteca propia —listas,
   * ánimo— no se ofrecen, y el resultado se muestra y se comparte distinto.
   */
  together?: {
    name: string;
    /** Las plataformas que pagan los dos, normalizadas. Vacío: sin el filtro. */
    shared: Set<string>;
    renderResult: (picked: SavedMedia) => React.ReactNode;
  };
}) {
  const ownCollections = useMediaStore((state) => state.collections);
  const collections = together ? [] : ownCollections;
  const reduceMotion = useReducedMotion();

  const [filters, setFilters] = useState<PickerFilters>(EMPTY_PICKER_FILTERS);
  const [picked, setPicked] = useState<SavedMedia | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [frame, setFrame] = useState(0);
  const [recent, setRecent] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const genres = useMemo(() => collectGenres(pending), [pending]);
  const providers = useMemo(() => collectProviders(pending), [pending]);
  const tags = useMemo(() => (together ? [] : collectTags(pending)), [pending, together]);
  const subscriptions = useMediaStore((state) => state.subscriptions);
  const subscribed = useMemo(
    () => together?.shared ?? subscribedNames(subscriptions),
    [subscriptions, together],
  );
  const canFilterAvailable = together ? together.shared.size > 0 : hasSubscriptions(subscriptions);
  const pool = useMemo(
    () => candidates(pending, filters, subscribed),
    [pending, filters, subscribed],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  const handlePick = () => {
    if (isSpinning || pool.length === 0) return;

    const result = pickRandom(pool, recent);
    if (!result) return;

    if (reduceMotion) {
      setPicked(result);
      setRecent((current) => rememberPick(current, result.tmdbId));
      return;
    }

    setPicked(null);
    setIsSpinning(true);

    const interval = setInterval(() => setFrame((f) => f + 1), FRAME_MS);
    const stop = setTimeout(() => {
      clearInterval(interval);
      setIsSpinning(false);
      setPicked(result);
      setRecent((current) => rememberPick(current, result.tmdbId));
    }, SPIN_MS);

    timers.current.push(stop as unknown as ReturnType<typeof setTimeout>);
  };

  const clearFilters = () => {
    setFilters(EMPTY_PICKER_FILTERS);
    setPicked(null);
  };

  const isFiltered = Object.values(filters).some(
    (value) => value !== null && value !== false,
  );

  const spinning = pool[frame % Math.max(pool.length, 1)];

  return (
    <div className="w-full flex flex-col items-center gap-8">
      <div className="w-full flex flex-col gap-3">
        <div className="flex flex-wrap justify-center gap-2">
          <select
            value={filters.type ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                type: (e.target.value || null) as MediaType | null,
              }))
            }
            aria-label="Filtrar por tipo"
            className="select-control"
          >
            <option value="">Película o serie</option>
            <option value="movie">Solo películas</option>
            <option value="tv">Solo series</option>
          </select>

          <select
            value={filters.duration ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                duration: (e.target.value || null) as DurationBucket | null,
              }))
            }
            aria-label="Filtrar por duración"
            className="select-control"
          >
            <option value="">Cualquier duración</option>
            {DURATION_BUCKETS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {genres.length > 1 && (
            <select
              value={filters.genre ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, genre: e.target.value || null }))
              }
              aria-label="Filtrar por género"
              className="select-control"
            >
              <option value="">Cualquier género</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          )}

          {providers.length > 1 && (
            <select
              value={filters.provider ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, provider: e.target.value || null }))
              }
              aria-label="Filtrar por plataforma"
              className="select-control"
            >
              <option value="">Cualquier plataforma</option>
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          )}

          {collections.length > 0 && (
            <select
              value={filters.collection ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, collection: e.target.value || null }))
              }
              aria-label="Filtrar por lista"
              className="select-control"
            >
              <option value="">Cualquier lista</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          )}

          {tags.length > 1 && (
            <select
              value={filters.tag ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, tag: e.target.value || null }))
              }
              aria-label="Filtrar por ánimo"
              className="select-control"
            >
              <option value="">Cualquier ánimo</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Solo con suscripciones marcadas: sin ellas, "lo que puedo ver
            ya" no tiene contra qué compararse. De a dos, con las que pagan
            los dos. */}
        {canFilterAvailable && (
          <div className="flex justify-center">
            <button
              type="button"
              aria-pressed={filters.availableNow}
              onClick={() => setFilters((f) => ({ ...f, availableNow: !f.availableNow }))}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm transition-colors',
                filters.availableNow
                  ? 'bg-accent text-accent-contrast border-accent font-medium'
                  : 'border-border-control text-text-muted hover:text-text-main hover:border-accent',
              )}
            >
              <Zap size={16} aria-hidden="true" />
              {together ? 'En plataformas de los dos' : 'Lo que puedo ver ya'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 text-sm">
          <p aria-live="polite" className="text-text-muted">
            {pool.length === 0
              ? 'Ningún título entra en esos filtros.'
              : `${pool.length} ${pool.length === 1 ? 'candidato' : 'candidatos'}`}
          </p>
          {isFiltered && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-text-muted hover:text-text-main transition-colors"
            >
              <X size={14} aria-hidden="true" />
              Limpiar
            </button>
          )}
        </div>

        {/* Sortear por plataforma es usar los datos de JustWatch. */}
        {(filters.provider || filters.availableNow) && (
          <JustWatchCredit className="text-center" />
        )}
      </div>

      {isSpinning ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-40 h-60 rounded-surface overflow-hidden border-2 border-accent bg-bg-card">
            {spinning?.posterPath ? (
              <motion.img
                key={spinning.tmdbId}
                initial={{ opacity: 0.4, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.09 }}
                src={`${TMDB_IMAGE_BASE_URL}${spinning.posterPath}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-3 text-center text-sm text-text-muted">
                {spinning?.title}
              </div>
            )}
          </div>
          <p aria-live="polite" className="text-sm text-text-muted">
            Eligiendo...
          </p>
        </div>
      ) : !picked ? (
        <button
          onClick={handlePick}
          disabled={pool.length === 0}
          className={cn(
            'group relative w-48 h-48 rounded-full bg-bg-card border-2 border-accent flex items-center justify-center transition-colors',
            pool.length === 0
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:bg-accent/10',
          )}
        >
          <span className="flex flex-col items-center gap-2">
            <Shuffle
              className="text-accent group-hover:scale-110 transition-transform"
              size={40}
              aria-hidden="true"
            />
            <span className="font-bold text-accent font-serif italic text-xl">
              Elegir
            </span>
          </span>
        </button>
      ) : (
        <div className="flex flex-col items-center w-full max-w-sm">
          <p aria-live="polite" className="sr-only">
            {together ? `Les tocó ${picked.title}` : `Te tocó ${picked.title}`}
          </p>
          <div className="w-full mb-4">
            {together ? together.renderResult(picked) : <MediaCard media={picked} />}
          </div>
          <ShareButton
            className="mb-4"
            label="Compartir"
            title="Qué Miro?"
            text={
              together
                ? `Esta noche vemos ${picked.title} con ${together.name}.`
                : `Esta noche me toca ${picked.title}.`
            }
            card={{
              eyebrow: together ? 'Esta noche vemos' : 'Me tocó',
              headline: picked.title,
              subline: [together ? `Con ${together.name}` : null, picked.releaseYear, picked.genres[0]]
                .filter(Boolean)
                .join(' · '),
            }}
          />
          <button
            onClick={handlePick}
            className="text-sm text-text-muted hover:text-text-main underline underline-offset-4"
          >
            Probar otra vez
          </button>
        </div>
      )}
    </div>
  );
}
