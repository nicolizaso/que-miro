import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { Compass, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { MediaCard } from '@/components/MediaCard';
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
import { cn } from '@/lib/utils';

const TABS: { id: MediaStatus; label: string }[] = [
  { id: 'por_ver', label: 'Por Ver' },
  { id: 'viendo', label: 'Viendo' },
  { id: 'completada', label: 'Completadas' },
];

const TYPES: { value: MediaType | ''; label: string }[] = [
  { value: '', label: 'Todo' },
  { value: 'movie', label: 'Películas' },
  { value: 'tv', label: 'Series' },
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
  const collections = useMediaStore((state) => state.collections);

  const filteredList = useMemo(
    () => filterLibrary(mediaList, filters),
    [mediaList, filters],
  );

  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-5 w-full max-w-5xl mx-auto px-4 pt-6">
      <h1 className="text-display">Mis listas</h1>

      <div
        role="tablist"
        aria-label="Estado de los títulos"
        className="flex bg-bg-card p-1 rounded-control border border-border-card"
      >
        {TABS.map((tab) => {
          const isActive = filters.status === tab.id;
          const count = mediaList.filter((m) => m.status === tab.id).length;

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
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-border-card rounded-lg"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
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
            <select
              value={filters.type ?? ''}
              onChange={(e) =>
                setFilters({ type: (e.target.value || null) as MediaType | null })
              }
              aria-label="Filtrar por tipo"
              className="select-control"
            >
              {TYPES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

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

      <AnimatePresence mode="popLayout">
        {filteredList.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
            layout
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            {filteredList.map((media) => (
              <motion.div
                key={media.tmdbId}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <MediaCard media={media} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
