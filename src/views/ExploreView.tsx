import { Compass, Sparkles } from 'lucide-react';
import { TitleCarousel } from '@/components/TitleCarousel';
import { useTmdbList } from '@/hooks/useTmdbList';
import { useRecommendations } from '@/hooks/useRecommendations';
import { getList, getTrending } from '@/lib/tmdb';

/**
 * Punto de entrada para descubrir qué mirar.
 *
 * Existe porque la app arrancaba en frío: sin buscar algo a mano, la primera
 * pantalla eran tres listas vacías. Acá siempre hay contenido, incluso el
 * primer día.
 *
 * El orden no es casual: primero lo que puede interesarte a vos, después lo que
 * está mirando el resto. Las recomendaciones aparecen recién cuando hay con qué
 * calcularlas.
 */
export function ExploreView() {
  const trending = useTmdbList(() => getTrending('week'), []);
  const popularMovies = useTmdbList(() => getList('movie', 'popular'), []);
  const topRatedSeries = useTmdbList(() => getList('tv', 'top_rated'), []);
  const { groups, isLoading: loadingRecs, hasSeeds } = useRecommendations();

  const everythingFailed =
    Boolean(trending.error) &&
    Boolean(popularMovies.error) &&
    Boolean(topRatedSeries.error);

  return (
    <div className="flex flex-col gap-10 w-full max-w-5xl mx-auto px-4 pt-8">
      <header>
        <h1 className="text-display mb-1">Explorar</h1>
        <p className="text-text-muted">
          Qué se está viendo, y qué podría gustarte a vos.
        </p>
      </header>

      {everythingFailed && (
        <div
          role="alert"
          className="flex flex-col items-center text-center gap-3 py-16 text-text-muted"
        >
          <Compass className="text-border-card w-12 h-12" aria-hidden="true" />
          <p className="max-w-sm">
            No pudimos conectarnos con TMDB. Tu biblioteca sigue funcionando
            igual: probá de nuevo en un rato.
          </p>
        </div>
      )}

      {(hasSeeds || loadingRecs) && (
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles size={18} aria-hidden="true" />
            <h2 className="text-eyebrow text-accent">Para vos</h2>
          </div>

          {loadingRecs && groups.length === 0 && (
            <TitleCarousel title="Buscando algo que te guste" results={[]} isLoading />
          )}

          {groups.map(({ seed, results }) => (
            <TitleCarousel
              key={seed.tmdbId}
              title={`Porque viste ${seed.title}`}
              results={results}
            />
          ))}
        </div>
      )}

      <TitleCarousel
        title="Tendencias de la semana"
        subtitle="Lo que está mirando todo el mundo."
        results={trending.results}
        isLoading={trending.isLoading}
        error={trending.error}
      />

      <TitleCarousel
        title="Películas populares"
        results={popularMovies.results}
        isLoading={popularMovies.isLoading}
        error={popularMovies.error}
      />

      <TitleCarousel
        title="Series mejor puntuadas"
        subtitle="Según la comunidad de TMDB."
        results={topRatedSeries.results}
        isLoading={topRatedSeries.isLoading}
        error={topRatedSeries.error}
      />
    </div>
  );
}
