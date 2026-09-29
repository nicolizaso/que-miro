import { Check, Film, Star, UserPlus, UserX } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { usePublicProfileBySlug } from '@/hooks/usePublicProfile';
import { useFollowing } from '@/hooks/useFollowing';
import { useToast } from '@/contexts/ToastContext';
import { PublicProfile } from '@/lib/publicProfile';
import { isFollowing } from '@/lib/following';
import { cn } from '@/lib/utils';
import { PublicFrame, PublicLoading, PublicMissing } from '@/components/PublicFrame';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { formatRelative, formatWatchDate } from '@/lib/dates';

/**
 * "Seguir", para quien tiene cuenta y no está mirando su propio perfil. Es un
 * interruptor: el nombre no cambia, cambia si está apretado.
 */
function FollowButton({ profile }: { profile: PublicProfile }) {
  const { following, canFollow, uid, followProfile, unfollowProfile } = useFollowing();
  const { showToast } = useToast();
  if (!canFollow || profile.uid === uid) return null;

  const isOn = isFollowing(following, profile.slug);
  const toggle = () => {
    if (isOn) {
      unfollowProfile(profile.slug);
      return;
    }
    if (followProfile(profile)) {
      showToast(`Ahora seguís a ${profile.displayName}: sus reseñas aparecen en tu perfil, en Siguiendo.`);
    }
  };

  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={toggle}
      className={cn(
        'btn px-4 py-2 text-sm border',
        isOn
          ? 'bg-accent text-accent-contrast border-accent'
          : 'border-border-card text-text-main hover:border-text-subtle',
      )}
    >
      {isOn ? <Check size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
      Seguir
    </button>
  );
}

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
    <PublicFrame>
      {isLoading ? (
        <PublicLoading label="Cargando perfil" />
      ) : error || !profile ? (
        <PublicMissing
          Icon={UserX}
          title={error ? 'No pudimos cargar el perfil' : 'Este perfil no existe'}
          text={
            error
              ? 'Puede ser un problema momentáneo. Probá de nuevo en un rato.'
              : 'El link puede estar mal escrito, o esta persona dejó de compartir su biblioteca.'
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <p className="text-eyebrow text-accent mb-1">La biblioteca de</p>
            <h1 className="text-display sm:text-5xl">
              {profile.displayName}
            </h1>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
              <p className="text-sm text-text-subtle">
                Actualizada{' '}
                <time dateTime={profile.publishedAt} title={formatWatchDate(profile.publishedAt)}>
                  {formatRelative(profile.publishedAt)}
                </time>
              </p>
              <FollowButton profile={profile} />
            </div>
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
    </PublicFrame>
  );
}
