import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { useMediaStore } from '@/store';
import { StatTile } from '@/components/charts/StatTile';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { BarList } from '@/components/charts/BarList';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { Heatmap } from '@/components/charts/Heatmap';
import { WrappedCard } from '@/components/WrappedCard';
import {
  activityHeatmap,
  formatDuration,
  genreDistribution,
  monthlyActivity,
  ratingDistribution,
  summarize,
  topRated,
} from '@/lib/stats';
import { fromDayKey } from '@/lib/dates';

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
/** La semana de un día, como se lee en la tabla: "semana del 3 de marzo". */
function weekLabel(dayKey: string): string {
  return `Semana del ${fromDayKey(dayKey).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
  })}`;
}

export function StatsDashboard() {
  const mediaList = useMediaStore((state) => state.mediaList);

  const summary = useMemo(() => summarize(mediaList), [mediaList]);
  const genres = useMemo(() => genreDistribution(mediaList), [mediaList]);
  const ratings = useMemo(() => ratingDistribution(mediaList), [mediaList]);
  const activity = useMemo(() => monthlyActivity(mediaList), [mediaList]);
  const heatmap = useMemo(() => activityHeatmap(mediaList), [mediaList]);
  const best = useMemo(() => topRated(mediaList), [mediaList]);

  const hasActivity = activity.some((month) => month.value > 0);

  // Sin nada terminado y sin episodios con fecha no hay nada que contar. Con
  // episodios y sin nada terminado, sí: quien está a mitad de su primera serie
  // ya tiene actividad para ver.
  if (summary.totalWatches === 0 && !hasActivity && heatmap.total === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-section">Mis estadísticas</h2>
        <div className="surface p-8 text-center text-text-muted">
          <p>Todavía no terminaste ningún título.</p>
          <p className="text-sm mt-2">
            Cuando puntúes el primero, acá vas a ver cuánto mirás, qué géneros
            elegís y cómo puntuás.
          </p>
        </div>
      </section>
    );
  }

  // Horas y no títulos: una película y un episodio no pesan lo mismo, y desde
  // que los episodios tienen fecha, una serie que miraste todo agosto aparece
  // en agosto y no recién cuando la terminaste.
  const hours = activity.map(({ label, minutes, titles, episodes }) => ({
    label,
    value: Math.round((minutes / 60) * 10) / 10,
    extra: { titles, episodes },
  }));
  const weeks = heatmap.weeks
    .map((week) => ({
      label: weekLabel(week[0].date),
      value: week.reduce((total, day) => total + day.count, 0),
    }))
    .filter((week) => week.value > 0);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-section">Mis estadísticas</h2>

      {summary.totalWatches > 0 && (
        /* Cinco columnas y el destacado ocupando dos: es el que lleva el texto
           más largo y el que tiene que leerse primero. */
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
      )}

      {hasActivity && (
        <ChartFrame
          title="Tu actividad"
          subtitle="Horas por mes"
          valueLabel="Horas"
          columns={[
            { key: 'titles', label: 'Títulos' },
            { key: 'episodes', label: 'Episodios' },
          ]}
          data={hours}
        >
          <TrendChart data={hours} />
        </ChartFrame>
      )}

      {heatmap.total > 0 && (
        <ChartFrame
          title="Días que miraste"
          subtitle="Semana"
          valueLabel="Episodios y títulos"
          data={weeks}
        >
          <Heatmap data={heatmap} />
        </ChartFrame>
      )}

      {summary.totalWatches > 0 && (
        <>
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
            <div className="surface p-5 flex flex-col gap-3">
              <h3 className="text-section">Tus favoritas</h3>
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
        </>
      )}
    </section>
  );
}
