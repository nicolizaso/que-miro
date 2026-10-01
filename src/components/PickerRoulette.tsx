import { useEffect, useMemo, useRef, useState } from 'react';
import { Shuffle, X, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { SavedMedia } from '@/types';
import { useMediaStore } from '@/store';
import { MediaCard } from '@/components/MediaCard';
import { ShareButton } from '@/components/ShareButton';
import { JustWatchCredit } from '@/components/Attribution';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { FilterRail } from '@/components/picker/FilterRail';
import {
  EMPTY_PICKER_FILTERS,
  PickerFilters,
  candidates,
  pickRandom,
  pickerFacets,
  rememberPick,
} from '@/lib/picker';
import { hasSubscriptions, subscribedNames } from '@/lib/subscriptions';

/** Fijo y no un `[]` en línea: uno nuevo por render rompería el `useMemo`. */
const NO_COLLECTIONS: { id: string; name: string }[] = [];

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
  const collections = together ? NO_COLLECTIONS : ownCollections;
  const reduceMotion = useReducedMotion();

  const [filters, setFilters] = useState<PickerFilters>(EMPTY_PICKER_FILTERS);
  const [picked, setPicked] = useState<SavedMedia | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [frame, setFrame] = useState(0);
  const [recent, setRecent] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
  const facets = useMemo(
    () => pickerFacets(pending, filters, subscribed, collections, !together),
    [pending, filters, subscribed, collections, together],
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

  // Cambiar un filtro descarta el resultado anterior: quedaría a la vista un
  // título que quizás ya no entra en lo que se pidió.
  const setFilter = <K extends keyof PickerFilters>(key: K, value: PickerFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPicked(null);
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
    <div className="w-full flex flex-col items-center gap-10">
      <div className="w-full flex flex-col gap-3">
        {facets.type.length > 1 && (
          <FilterRail
            label="Tipo"
            name="Filtrar por tipo"
            allLabel="Todo"
            options={facets.type}
            value={filters.type}
            onChange={(type) => setFilter('type', type)}
          />
        )}
        <FilterRail
          label="Duración"
          name="Filtrar por duración"
          allLabel="Cualquiera"
          options={facets.duration}
          value={filters.duration}
          onChange={(duration) => setFilter('duration', duration)}
        />
        {facets.genre.length > 1 && (
          <FilterRail
            label="Género"
            name="Filtrar por género"
            allLabel="Todos"
            options={facets.genre}
            value={filters.genre}
            onChange={(genre) => setFilter('genre', genre)}
          />
        )}
        {facets.provider.length > 1 && (
          <FilterRail
            label="Plataforma"
            name="Filtrar por plataforma"
            allLabel="Todas"
            options={facets.provider}
            value={filters.provider}
            onChange={(provider) => setFilter('provider', provider)}
          />
        )}
        {facets.collection.length > 0 && (
          <FilterRail
            label="Lista"
            name="Filtrar por lista"
            allLabel="Todas"
            options={facets.collection}
            value={filters.collection}
            onChange={(collection) => setFilter('collection', collection)}
          />
        )}
        {facets.tag.length > 1 && (
          <FilterRail
            label="Ánimo"
            name="Filtrar por ánimo"
            allLabel="Cualquiera"
            options={facets.tag}
            value={filters.tag}
            onChange={(tag) => setFilter('tag', tag)}
          />
        )}

        {/* Solo con suscripciones marcadas: sin ellas, "lo que puedo ver
            ya" no tiene contra qué compararse. De a dos, con las que pagan
            los dos. */}
        {canFilterAvailable && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              aria-pressed={filters.availableNow}
              onClick={() => setFilter('availableNow', !filters.availableNow)}
              className="pill"
            >
              <Zap size={15} aria-hidden="true" />
              {together ? 'En plataformas de los dos' : 'Lo que puedo ver ya'}
            </button>
          </div>
        )}

        {/* Sortear por plataforma es usar los datos de JustWatch. */}
        {(filters.provider || filters.availableNow) && (
          <JustWatchCredit className="text-center" />
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* Un solo nodo con el número y la palabra, para que el lector de
            pantalla lo anuncie entero cuando cambia. */}
        <p aria-live="polite" className="flex flex-col items-center gap-1 text-center">
          {pool.length === 0 ? (
            <span className="text-text-muted">Ningún título entra en esos filtros.</span>
          ) : (
            <>
              <span className="font-serif italic text-5xl tabular-nums text-text-main">
                {pool.length}
              </span>{' '}
              <span className="text-eyebrow">
                {pool.length === 1 ? 'candidato' : 'candidatos'} en juego
              </span>
            </>
          )}
        </p>
        {isFiltered && (
          <button
            type="button"
            onClick={clearFilters}
            className="btn btn-ghost px-3 py-1.5 text-sm"
          >
            <X size={14} aria-hidden="true" />
            Limpiar filtros
          </button>
        )}
      </div>

      {isSpinning ? (
        <div className="flex flex-col items-center gap-5">
          <div className="relative w-44 aspect-[2/3]">
            <div
              aria-hidden="true"
              className="absolute -inset-8 rounded-full bg-accent/20 blur-3xl -z-10"
            />
            <div className="w-full h-full rounded-surface overflow-hidden ring-1 ring-accent/60 bg-bg-card shadow-pop">
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
                <div className="w-full h-full flex items-center justify-center p-3 text-center font-serif italic text-lg text-text-muted">
                  {spinning?.title}
                </div>
              )}
            </div>
          </div>
          <p aria-live="polite" className="text-eyebrow">
            Eligiendo…
          </p>
        </div>
      ) : !picked ? (
        // El halo va afuera del botón: adentro, aunque vaya con `-z-10`, se
        // pinta encima del fondo del propio botón y lo tiñe de rojo.
        <div className="relative isolate">
          <span
            aria-hidden="true"
            className={cn(
              'absolute -inset-6 rounded-full bg-accent/15 blur-2xl -z-10 motion-safe:animate-breathe',
              pool.length === 0 && 'hidden',
            )}
          />
          <button
            type="button"
            onClick={handlePick}
            disabled={pool.length === 0}
            className="group relative w-52 h-52 sm:w-56 sm:h-56 rounded-full bg-bg-card shadow-pop flex items-center justify-center transition-transform duration-300 hover-device:hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
          >
            {/* El aro fijo, el que gira y un filete interior: tres capas
                finas en vez de un borde grueso, que es lo que separa un botón
                de una joya. */}
            <span aria-hidden="true" className="absolute inset-0 rounded-full border border-accent/25" />
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full ring-sweep motion-safe:animate-[spin_9s_linear_infinite]"
            />
            <span aria-hidden="true" className="absolute inset-3 rounded-full border border-border-card" />
            <span className="flex flex-col items-center gap-2">
              <Shuffle
                className="text-accent transition-transform duration-300 group-hover:rotate-12"
                size={34}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="font-serif italic font-bold text-accent text-3xl">Elegir</span>
            </span>
          </button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center w-full max-w-sm"
        >
          <p aria-live="polite" className="sr-only">
            {together ? `Les tocó ${picked.title}` : `Te tocó ${picked.title}`}
          </p>
          <p aria-hidden="true" className="text-eyebrow mb-4">
            {together ? 'Esta noche miran' : 'Esta noche te toca'}
          </p>
          <div className="w-full mb-5">
            {together ? together.renderResult(picked) : <MediaCard media={picked} />}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ShareButton
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
              type="button"
              onClick={handlePick}
              className="btn btn-ghost px-4 py-2.5 text-sm"
            >
              <Shuffle size={16} aria-hidden="true" />
              Probar otra vez
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
