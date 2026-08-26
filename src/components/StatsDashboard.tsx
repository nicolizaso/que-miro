import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { useMediaStore } from '@/store';
import { StatTile } from '@/components/charts/StatTile';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { BarList } from '@/components/charts/BarList';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { WrappedCard } from '@/components/WrappedCard';
import {
  formatDuration,
  genreDistribution,
  monthlyActivity,
  ratingDistribution,
  summarize,
  topRated,
} from '@/lib/stats';

/**
 * Panel de estadísticas de la biblioteca.
 *
 * Todo sale del historial: la unidad es "una vez que viste algo", no "un
 * título". Ver *Matrix* tres veces son tres visionados y un solo título, y el
 * panel muestra las dos cosas porque responden preguntas distintas.
 *
 * Cada gráfico es de una sola serie, así que ninguno necesita leyenda: el
 * título dice qué se está mirando, y el color es siempre el mismo.
 */
export function StatsDashboard() {
  const mediaList = useMediaStore((state) => state.mediaList);

  const summary = useMemo(() => summarize(mediaList), [mediaList]);
  const genres = useMemo(() => genreDistribution(mediaList), [mediaList]);
  const ratings = useMemo(() => ratingDistribution(mediaList), [mediaList]);
  const activity = useMemo(() => monthlyActivity(mediaList), [mediaList]);
  const best = useMemo(() => topRated(mediaList), [mediaList]);

  if (summary.totalWatches === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="font-serif italic font-bold text-3xl">Mis estadísticas</h2>
        <div className="bg-bg-card border border-border-card rounded-2xl p-8 text-center text-text-muted">
          <p>Todavía no terminaste ningún título.</p>
          <p className="text-sm mt-2">
            Cuando puntúes el primero, acá vas a ver cuánto mirás, qué géneros
            elegís y cómo puntuás.
          </p>
        </div>
      </section>
    );
  }

  const hasActivity = activity.some((month) => month.value > 0);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-serif italic font-bold text-3xl">Mis estadísticas</h2>

      {/* Cinco columnas y el destacado ocupando dos: es el que lleva el texto
          más largo y el que tiene que leerse primero. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          emphasis
          className="lg:col-span-2"
          label="Tiempo mirando"
          value={formatDuration(summary.minutes)}
          hint="Incluye lo que llevás de las series empezadas"
        />
        <StatTile
          label="Vistas"
          value={summary.totalWatches}
          hint={
            summary.totalWatches !== summary.uniqueTitles
              ? `${summary.uniqueTitles} títulos distintos`
              : undefined
          }
        />
        <StatTile
          label="Promedio"
          value={summary.averageRating.toFixed(1)}
          hint="Sobre 5 estrellas"
        />
        <StatTile
          label="Películas y series"
          value={`${summary.movies} / ${summary.series}`}
          hint={
            summary.inProgress > 0
              ? `${summary.inProgress} ${
                  summary.inProgress === 1 ? 'serie empezada' : 'series empezadas'
                }`
              : undefined
          }
        />
      </div>

      {hasActivity && (
        <ChartFrame
          title="Tu actividad"
          subtitle="Mes"
          valueLabel="Títulos terminados"
          data={activity.map(({ label, value }) => ({ label, value }))}
        >
          <TrendChart data={activity.map(({ label, value }) => ({ label, value }))} />
        </ChartFrame>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {genres.length > 0 && (
          <ChartFrame
            title="Lo que más mirás"
            subtitle="Género"
            valueLabel="Veces"
            data={genres}
          >
            <BarList data={genres} />
          </ChartFrame>
        )}

        <ChartFrame
          title="Cómo puntuás"
          subtitle="Estrellas"
          valueLabel="Reseñas"
          data={ratings}
        >
          <ColumnChart data={ratings} unit="reseñas" />
        </ChartFrame>
      </div>

      <WrappedCard />

      {best.length > 0 && (
        <div className="bg-bg-card border border-border-card rounded-2xl p-5 flex flex-col gap-3">
          <h3 className="font-bold">Tus favoritas</h3>
          <ol className="flex flex-col gap-2">
            {best.map(({ media, entry }) => (
              <li
                key={media.tmdbId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">{media.title}</span>
                <span className="flex items-center gap-1 shrink-0 text-text-muted tabular-nums">
                  {entry.rating}
                  <Star
                    size={12}
                    className="fill-accent text-accent"
                    aria-hidden="true"
                  />
                  <span className="sr-only">de 5 estrellas</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
