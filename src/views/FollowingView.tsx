import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Film, Loader2, Plus, RefreshCw, Star, Tv, Users } from 'lucide-react';
import { useMediaStore } from '@/store';
import { useToast } from '@/contexts/ToastContext';
import { useFollowing } from '@/hooks/useFollowing';
import { useFollowingFeed } from '@/hooks/useFollowingFeed';
import { useMediaActions } from '@/hooks/useMediaActions';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { FeedItem, FollowStatus, feedHeadline, ratingText } from '@/lib/following';
import { formatRelative, formatWatchDate } from '@/lib/dates';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { MediaType } from '@/types';

const STATUS_NOTES: Record<Exclude<FollowStatus, 'ok'>, string> = {
  gone: 'Ya no está publicado.',
  'new-owner': 'Esa dirección ahora es de otra persona: no mostramos nada suyo.',
};

function FeedCard({ item, onOpen }: { item: FeedItem; onOpen: (id: number, type: MediaType) => void }) {
  const { review } = item;
  const saved = useMediaStore((state) =>
    state.mediaList.some((media) => media.tmdbId === review.tmdbId && media.mediaType === review.mediaType),
  );
  const { addMedia } = useMediaActions();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  // Un perfil de antes no dice de qué título es cada reseña: se lee, pero no se guarda.
  const canSave = review.tmdbId > 0 && review.mediaType !== undefined;

  const save = async () => {
    if (!canSave || !review.mediaType) return;
    setIsSaving(true);
    try {
      await addMedia({
        tmdbId: review.tmdbId,
        mediaType: review.mediaType,
        title: review.title,
        posterPath: review.posterPath,
        backdropPath: null,
        releaseYear: review.releaseYear,
        genres: [],
        status: 'por_ver',
      });
      showToast(`"${review.title}" quedó en Por Ver.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <li>
      <article aria-label={feedHeadline(item)} className="p-4 flex gap-4">
        <span className="w-14 aspect-[2/3] shrink-0 rounded-md bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
          {review.posterPath ? (
            <img src={`${TMDB_IMAGE_BASE_URL}${review.posterPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
          ) : review.mediaType === 'tv' ? (
            <Tv size={18} aria-hidden="true" />
          ) : (
            <Film size={18} aria-hidden="true" />
          )}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <p className="text-sm">
            <Link to={`/u/${item.slug}`} className="font-semibold hover:underline">
              {item.name}
            </Link>{' '}
            le puso{' '}
            <span className="inline-flex items-center gap-0.5 font-semibold">
              {ratingText(review.rating)}
              <Star size={12} className="fill-accent text-accent" aria-hidden="true" />
            </span>{' '}
            a{' '}
            {canSave && review.mediaType ? (
              <button
                type="button"
                onClick={() => onOpen(review.tmdbId, review.mediaType!)}
                className="italic font-semibold hover:underline text-left"
              >
                {review.title}
              </button>
            ) : (
              <em className="font-semibold">{review.title}</em>
            )}
          </p>
          <p className="text-xs text-text-subtle">
            <time dateTime={review.completedAt} title={formatWatchDate(review.completedAt)}>
              {formatRelative(review.completedAt)}
            </time>
          </p>
          {review.text && (
            <p className="text-sm text-text-muted italic leading-relaxed line-clamp-4">{review.text}</p>
          )}
          {canSave &&
            (saved ? (
              <p className="flex items-center gap-1.5 text-xs text-text-subtle">
                <Check size={14} aria-hidden="true" /> Ya está en tu biblioteca
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving}
                aria-label={`Guardar "${review.title}" en Por Ver`}
                className="btn btn-secondary self-start px-3 py-1.5 text-sm"
              >
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Plus size={14} aria-hidden="true" />
                )}
                Por Ver
              </button>
            ))}
        </div>
      </article>
    </li>
  );
}

/**
 * "Siguiendo": lo que reseñaron los perfiles que seguís, mezclado por fecha,
 * y a quiénes seguís.
 *
 * Se arma en el dispositivo con las instantáneas públicas de cada uno (ver
 * `useFollowingFeed`): el servidor no sabe a quién seguís ni hace falta que
 * sepa.
 */
export function FollowingView() {
  const { following, items, statuses, isLoading, refresh } = useFollowingFeed();
  const { unfollowProfile } = useFollowing();
  const mediaList = useMediaStore((state) => state.mediaList);
  const [open, setOpen] = useState<{ id: number; type: MediaType } | null>(null);

  if (following.profiles.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-16 text-text-muted">
        <Users className="w-12 h-12 text-border-card" aria-hidden="true" />
        <p className="max-w-sm">
          Todavía no seguís a nadie. Cuando alguien te pase el link de su
          perfil, tocá "Seguir" y sus reseñas aparecen acá.
        </p>
      </div>
    );
  }

  const openMedia = open
    ? mediaList.find((media) => media.tmdbId === open.id && media.mediaType === open.type)
    : undefined;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-section">Lo último de quienes seguís</h2>
            <p className="text-sm text-text-muted">Sus reseñas, de la más nueva a la más vieja.</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="btn btn-secondary px-3 py-2 text-sm"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : undefined} aria-hidden="true" />
            Actualizar
          </button>
        </div>

        {items.length > 0 ? (
          <ul className="surface divide-y divide-border-card overflow-hidden">
            {items.map((item) => (
              <FeedCard key={item.key} item={item} onOpen={(id, type) => setOpen({ id, type })} />
            ))}
          </ul>
        ) : isLoading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Cargando reseñas">
            <div className="h-24 bg-border-card rounded-surface animate-pulse" />
            <div className="h-24 bg-border-card rounded-surface animate-pulse" />
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Todavía no escribieron reseñas. Cuando publiquen una, aparece acá.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section">
          Seguís a {following.profiles.length} {following.profiles.length === 1 ? 'perfil' : 'perfiles'}
        </h2>
        <ul className="surface divide-y divide-border-card overflow-hidden">
          {following.profiles.map((followed) => {
            const status = statuses.get(followed.slug);
            return (
              <li key={followed.slug} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  {status === 'ok' ? (
                    <Link to={`/u/${followed.slug}`} className="font-semibold hover:underline">
                      {followed.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{followed.name}</span>
                  )}
                  <p className="text-xs text-text-subtle">
                    {status && status !== 'ok' ? STATUS_NOTES[status] : `/u/${followed.slug}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unfollowProfile(followed.slug)}
                  className="text-sm text-text-muted hover:text-accent transition-colors"
                >
                  Dejar de seguir
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {open && (
        <TitleDetailModal
          id={open.id}
          mediaType={open.type}
          media={openMedia}
          isOpen
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
