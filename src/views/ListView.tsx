import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  BellDot,
  Clapperboard,
  Compass,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { MediaCard } from '@/components/MediaCard';
import { ContinueWatching } from '@/components/ContinueWatching';
import { useLibraryFilters } from '@/hooks/useLibraryFilters';
import {
  SORT_OPTIONS,
  collectGenres,
  collectProviders,
  collectTags,
  filterLibrary,
  hasActiveFilters,
} from '@/lib/library';
import { MediaStatus, MediaType } from '@/types';
import { hasNewEpisodes } from '@/lib/progress';
import { cn } from '@/lib/utils';

const TABS: { id: MediaStatus; label: string }[] = [
  { id: 'por_ver', label: 'Por Ver' },
  { id: 'viendo', label: 'Viendo' },
  { id: 'completada', label: 'Completadas' },
];

const TYPES: { value: MediaType; label: string; Icon: typeof Tv }[] = [
  { value: 'movie', label: 'Películas', Icon: Clapperboard },
  { value: 'tv', label: 'Series', Icon: Tv },
];

export function ListView() {
  const { mediaList } = useMediaStore();
  const { authState, startDemo } = useAuth();
  const { filters, setFilters, clearFilters } = useLibraryFilters();

  // En el teléfono los desplegables ocupan media pantalla antes de que se vea
  // el primer póster, así que arrancan plegados. De `sm` para arriba entran al
  // lado del buscador y no hace falta esconderlos.
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);

  // Los géneros salen de la pestaña actual, no de toda la biblioteca: ofrecer
  // "Terror" cuando en Completadas no hay ninguna de terror es ofrecer un
  // filtro que solo puede dar cero resultados.
  const inStatus = useMemo(
    () => mediaList.filter((media) => media.status === filters.status),
    [mediaList, filters.status],
  );
  const genres = useMemo(() => collectGenres(inStatus), [inStatus]);
  const providers = useMemo(() => collectProviders(inStatus), [inStatus]);
  const tags = useMemo(() => collectTags(inStatus), [inStatus]);
  // El filtro de novedades aparece solo si en esta pestaña hay alguna: un
  // botón que siempre da cero resultados es una excusa, no un filtro.
  const withNews = useMemo(
    () => inStatus.filter((media) => hasNewEpisodes(media)).length,
    [inStatus],
  );
  const collections = useMediaStore((state) => state.collections);

  const filteredList = useMemo(
    () => filterLibrary(mediaList, filters),
    [mediaList, filters],
  );

  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-5 w-full max-w-5xl mx-auto px-4 pt-6">
      {/* Arriba de todo: es lo que se viene a hacer la mayoría de las veces,
          anotar el episodio de anoche. Sin nada para retomar, no existe. */}
      <ContinueWatching />

      <h1 className="text-display">Mis listas</h1>

      <div
        role="tablist"
        aria-label="Estado de los títulos"
        className="relative flex bg-bg-card p-1 rounded-control border border-border-card"
      >
        {/*
          La pastilla de la pestaña activa es un solo elemento que se desplaza,
          y no un `layoutId` que aparece y desaparece dentro de cada botón.

          Con `layoutId`, cada cambio de pestaña desmonta la pastilla de un
          botón y monta otra en el siguiente, y motion tiene que animar entre
          las dos midiendo un nodo que ya salió del documento. Un `transform`
          con transición de CSS hace lo mismo a la vista, sin nada que medir
          —y `prefers-reduced-motion` ya lo desactiva desde `index.css`.
        */}
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-1 bg-border-card rounded-lg transition-transform duration-300 ease-out"
          style={{
            // El contenedor tiene `p-1` de cada lado: el ancho útil es el
            // total menos esos dos cuartos de rem.
            width: `calc((100% - 0.5rem) / ${TABS.length})`,
            transform: `translateX(${
              TABS.findIndex((tab) => tab.id === filters.status) * 100
            }%)`,
          }}
        />

        {TABS.map((tab) => {
          const isActive = filters.status === tab.id;
          // El número respeta el botón de Películas / Series: con "Series"
          // prendido, "Por Ver 7" cuando hay tres series confunde.
          const count = mediaList.filter(
            (m) =>
              m.status === tab.id &&
              (!filters.type || m.mediaType === filters.type),
          ).length;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              // Sin esto el nombre accesible sale de pegar los dos nodos de
              // texto y se lee "Por Ver7".
              aria-label={
                count > 0
                  ? `${tab.label}, ${count} ${count === 1 ? 'título' : 'títulos'}`
                  : tab.label
              }
              onClick={() => setFilters({ status: tab.id })}
              className={cn(
                'flex-1 py-3 px-1 rounded-lg transition-colors relative',
                isActive
                  ? 'text-text-main'
                  : 'text-text-muted hover:text-text-main',
              )}
            >
              {/* `whitespace-nowrap`: "Completadas (6)" partía en dos renglones
                  en pantallas angostas y descuadraba toda la fila. */}
              <span className="relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] sm:text-sm font-medium">
                {tab.label}
                {count > 0 && (
                  <span className="text-text-subtle font-normal tabular-nums">
                    {count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Películas y Series a la vista, fuera del panel de filtros: es el
          corte que más se usa y en el teléfono no tiene que costar dos toques.
          Tocar el que está prendido lo apaga y vuelve a mostrar todo. */}
      {mediaList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div
            role="group"
            aria-label="Filtrar por tipo"
            className="flex gap-2"
          >
            {TYPES.map(({ value, label, Icon }) => {
              const isActive = filters.type === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setFilters({ type: isActive ? null : value })}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-contrast border-accent font-medium'
                      : 'border-border-control text-text-muted hover:text-text-main hover:border-accent',
                  )}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          {(withNews > 0 || filters.onlyNew) && (
            <button
              type="button"
              aria-pressed={filters.onlyNew}
              onClick={() => setFilters({ onlyNew: !filters.onlyNew })}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm transition-colors',
                filters.onlyNew
                  ? 'bg-accent text-accent-contrast border-accent font-medium'
                  : 'border-border-control text-text-muted hover:text-text-main hover:border-accent',
              )}
            >
              <BellDot size={16} aria-hidden="true" />
              Con episodios nuevos
              {withNews > 0 && (
                <span
                  className={cn(
                    'tabular-nums',
                    filters.onlyNew ? 'opacity-80' : 'text-text-subtle',
                  )}
                >
                  {withNews}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* La barra de filtros aparece recién cuando hay algo que filtrar: con
          tres títulos guardados es ruido. */}
      {inStatus.length > 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
                size={16}
                aria-hidden="true"
              />
              <input
                type="search"
                value={filters.query}
                onChange={(e) => setFilters({ query: e.target.value })}
                placeholder="Buscar en esta lista..."
                aria-label="Buscar en esta lista"
                className="w-full bg-bg-card border border-border-control rounded-control py-2.5 pl-9 pr-3 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={() => setAreFiltersOpen((open) => !open)}
              aria-expanded={areFiltersOpen}
              aria-controls="filtros-lista"
              className="sm:hidden flex items-center gap-2 shrink-0 bg-bg-card border border-border-card rounded-control px-3 py-2.5 text-sm font-medium text-text-main hover:bg-border-card transition-colors"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              Filtros
            </button>
          </div>

          <div
            id="filtros-lista"
            className={cn(
              'flex-wrap gap-2 sm:flex',
              areFiltersOpen ? 'flex' : 'hidden',
            )}
          >
            {genres.length > 1 && (
              <select
                value={filters.genre ?? ''}
                onChange={(e) => setFilters({ genre: e.target.value || null })}
                aria-label="Filtrar por género"
                className="select-control"
              >
                <option value="">Todos los géneros</option>
                {genres.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            )}

            {/* Cada desplegable aparece solo si hay más de un valor entre el
                cual elegir: un filtro con una sola opción no filtra nada. */}
            {providers.length > 1 && (
              <select
                value={filters.provider ?? ''}
                onChange={(e) => setFilters({ provider: e.target.value || null })}
                aria-label="Filtrar por plataforma"
                className="select-control"
              >
                <option value="">Todas las plataformas</option>
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
                  setFilters({ collection: e.target.value || null })
                }
                aria-label="Filtrar por lista"
                className="select-control"
              >
                <option value="">Todas mis listas</option>
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
                onChange={(e) => setFilters({ tag: e.target.value || null })}
                aria-label="Filtrar por etiqueta"
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

            <select
              value={filters.sort}
              onChange={(e) =>
                setFilters({ sort: e.target.value as typeof filters.sort })
              }
              aria-label="Ordenar por"
              className="select-control"
            >
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {isFiltered && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-text-muted">
                {filteredList.length} de {inStatus.length}{' '}
                {inStatus.length === 1 ? 'título' : 'títulos'}
                {/* Filtrar por plataforma es mostrar datos de JustWatch. */}
                {filters.provider && (
                  <span className="text-text-subtle text-xs">
                    {' '}
                    · Plataformas según JustWatch
                  </span>
                )}
              </p>
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-text-muted hover:text-text-main transition-colors"
              >
                <X size={14} aria-hidden="true" />
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/*
        Sin AnimatePresence, a propósito: cada rama se funde al entrar y se va
        sin animación.

        Antes esto era un AnimatePresence en modo `wait`, que hace esperar a la
        pantalla que entra hasta que termina de irse la que sale. Si en esos
        150 ms cambiaba lo que había que mostrar —cargar el demo y tocar
        enseguida otra pestaña—, la grilla entraba con la foto vieja y se
        quedaba así: la pestaña decía "Completadas" y las tarjetas eran las de
        "Por Ver". Y antes de eso, con `popLayout`, animaba nodos que ya no
        estaban en el documento (el `reading 'startTime'`). Un fundido de
        salida de 150 ms no vale ninguno de los dos problemas.
      */}
      {filteredList.length === 0 ? (
        <motion.div
          key="vacio"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col items-center justify-center py-20 text-text-muted text-center"
        >
          {isFiltered ? (
            <>
              <p>Ningún título coincide con estos filtros.</p>
              <button
                onClick={clearFilters}
                className="text-sm mt-3 text-accent underline underline-offset-4"
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <p>No tenés títulos en esta lista.</p>
              <p className="text-sm mt-2">
                Buscá algo con ⌘K, o mirá qué se está viendo.
              </p>
              <Link
                to="/explorar"
                className="btn btn-primary mt-6 px-4 py-2.5 text-sm"
              >
                <Compass size={16} aria-hidden="true" />
                Explorar títulos
              </Link>
              {/* Con la biblioteca entera vacía, ofrecer el demo es más útil
                  que un cartel: es también la única puerta al demo cuando la
                  instalación no tiene Firebase y nunca se ve el login. */}
              {mediaList.length === 0 && authState !== 'demo' && (
                <button
                  onClick={startDemo}
                  className="btn btn-secondary bg-transparent mt-3 px-4 py-2.5 text-sm"
                >
                  <Sparkles size={16} aria-hidden="true" />
                  Ver una biblioteca de ejemplo
                </button>
              )}
            </>
          )}
        </motion.div>
      ) : (
        <motion.div
          // La grilla no lleva `layout`: es una grilla de CSS, su alto sale
          // del contenido y proyectarla solo agregaba medición a cada
          // cambio de lista. El `layout` que importa es el de cada tarjeta,
          // que es lo que se reordena al cambiar el orden.
          key="grilla"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
        >
          {filteredList.map((media) => (
            <motion.div
              key={media.tmdbId}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <MediaCard media={media} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
