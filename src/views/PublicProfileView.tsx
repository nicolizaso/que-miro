import { Film, Star, UserX } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { usePublicProfileBySlug } from '@/hooks/usePublicProfile';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { formatRelative, formatWatchDate } from '@/lib/dates';

/**
 * Perfil público de otra persona, en modo lectura.
 *
 * Es la única vista que se ve sin sesión, así que trae su propio marco: sin
 * navegación de la app, con su llamada a probarla, y con el conmutador de tema
 * para que quien llega desde un link no quede atado al tema de quien lo mandó.
 */
export function PublicProfileView() {
  const { slug } = useParams<{ slug: string }>();
  const { profile, isLoading, error } = usePublicProfileBySlug(slug);

  return (
    <div className="min-h-[100dvh] bg-bg-main text-text-main flex flex-col">
      <header className="border-b border-border-card">
        {/* Mismo ancho que el contenido: el logo cae en la vertical del título. */}
        <div className="w-full max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Film size={20} className="text-accent-contrast" aria-hidden="true" />
            </span>
            <span className="font-serif italic font-bold text-xl">Qué Miro?</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/"
              className="btn btn-primary px-4 py-2 text-sm"
            >
              Armá la tuya
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10">
        {isLoading ? (
          <div className="flex flex-col gap-4" role="status" aria-label="Cargando perfil">
            <div className="h-10 w-2/3 bg-border-card rounded-control animate-pulse" />
            <div className="h-24 bg-border-card rounded-surface animate-pulse" />
            <div className="h-40 bg-border-card rounded-surface animate-pulse" />
          </div>
        ) : error || !profile ? (
          <div className="flex flex-col items-center text-center gap-4 py-20">
            <UserX className="text-border-card w-14 h-14" aria-hidden="true" />
            <h1 className="text-display">
              {error ? 'No pudimos cargar el perfil' : 'Este perfil no existe'}
            </h1>
            <p className="text-text-muted max-w-sm">
              {error
                ? 'Puede ser un problema momentáneo. Probá de nuevo en un rato.'
                : 'El link puede estar mal escrito, o esta persona dejó de compartir su biblioteca.'}
            </p>
            <Link
              to="/"
              className="mt-2 px-5 py-2.5 rounded-control border border-border-card text-sm font-medium hover:bg-border-card transition-colors"
            >
              Ir a Qué Miro?
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <section>
              <p className="text-eyebrow text-accent mb-1">La biblioteca de</p>
              <h1 className="text-display sm:text-5xl">
                {profile.displayName}
              </h1>
              <p className="text-sm text-text-subtle mt-2">
                Actualizada{' '}
                <time dateTime={profile.publishedAt} title={formatWatchDate(profile.publishedAt)}>
                  {formatRelative(profile.publishedAt)}
                </time>
              </p>
            </section>

            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { value: profile.summary.timeLabel, label: 'Mirando' },
                { value: profile.summary.watches, label: 'Vistas' },
                { value: profile.summary.titles, label: 'Títulos' },
                {
                  value: profile.summary.averageRating.toFixed(1),
                  label: 'Promedio',
                },
              ].map(({ value, label }) => (
                <div
                  key={label}
                  className="surface p-4"
                >
                  <p className="font-serif italic font-bold text-2xl text-accent leading-tight">
                    {value}
                  </p>
                  <p className="text-sm text-text-muted mt-1">{label}</p>
                </div>
              ))}
            </section>

            {profile.topGenres.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-section">Lo que más mira</h2>
                <ul className="flex flex-wrap gap-2">
                  {profile.topGenres.map((genre) => (
                    <li
                      key={genre}
                      className="px-3 py-1.5 rounded-full border border-border-card text-sm text-text-muted"
                    >
                      {genre}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {profile.favorites.length > 0 && (
              <section>
                <ScrollRail
                  label="Sus favoritas"
                  header={<h2 className="text-section">Sus favoritas</h2>}
                >
                  {profile.favorites.map((favorite) => (
                    <li
                      key={favorite.tmdbId}
                      className="rail-item w-28 sm:w-32 shrink-0"
                    >
                      <div className="relative aspect-[2/3] w-full rounded-control overflow-hidden bg-border-card shadow-card">
                        {favorite.posterPath ? (
                          <img
                            src={`${TMDB_IMAGE_BASE_URL}${favorite.posterPath}`}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-subtle">
                            <Film size={28} aria-hidden="true" />
                          </div>
                        )}
                        <span className="absolute inset-0 rounded-control ring-1 ring-inset ring-text-main/10" />
                      </div>
                      <p className="text-sm font-medium mt-3 line-clamp-2 leading-tight min-h-[2.5em]">
                        {favorite.title}
                      </p>
                      <p className="text-xs text-text-subtle flex items-center gap-1">
                        {favorite.rating}
                        <Star
                          size={11}
                          className="fill-accent text-accent"
                          aria-hidden="true"
                        />
                        <span className="sr-only">de 5 estrellas</span>
                      </p>
                    </li>
                  ))}
                </ScrollRail>
              </section>
            )}

            {profile.reviews.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-section">Sus reseñas</h2>
                {profile.reviews.map((review) => (
                  <article
                    key={review.id}
                    className="surface p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          {review.title}
                        </h3>
                        <p className="text-xs text-text-subtle">
                          {formatWatchDate(review.completedAt)}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 shrink-0 bg-bg-main border border-border-card rounded-lg px-2.5 py-1 text-sm font-bold">
                        {review.rating}
                        <Star
                          size={12}
                          className="fill-accent text-accent"
                          aria-hidden="true"
                        />
                        <span className="sr-only">de 5 estrellas</span>
                      </span>
                    </div>

                    {review.tags.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {review.tags.map((tag) => (
                          <li
                            key={tag}
                            className="px-2 py-0.5 rounded-full bg-border-card text-[11px] text-text-muted"
                          >
                            {tag}
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="text-sm text-text-muted italic leading-relaxed">
                      {review.text}
                    </p>
                  </article>
                ))}
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border-card px-4 py-6 text-center text-sm text-text-subtle flex flex-col gap-2">
        <p>
          Hecho con{' '}
          <Link to="/" className="text-accent hover:underline">
            Qué Miro?
          </Link>
        </p>
        {/* Quien llega por un link no ve nunca los Ajustes, que es donde vive
            el resto de la atribución: los pósters de acá también son de TMDB. */}
        <p className="text-xs">
          Datos de películas y series de{' '}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-text-main"
          >
            TMDB
          </a>
          . Este producto usa la API de TMDB pero no está avalado ni certificado
          por TMDB.
        </p>
      </footer>
    </div>
  );
}
