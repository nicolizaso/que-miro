import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, Film, ListVideo, Plus, Repeat, Star, Target, Tv } from 'lucide-react';
import { useMediaStore } from '@/store';
import { Avatar } from '@/components/social/Avatar';
import { ReactionBar } from '@/components/social/ReactionBar';
import { ShareButton } from '@/components/ShareButton';
import { useSocialInteractions } from '@/hooks/useSocialInteractions';
import { useSocial } from '@/hooks/useSocial';
import { ActivityEvent } from '@/lib/activity';
import { FeedItem, eventHeadline, isSpoilerRisk, progressDetail } from '@/lib/socialFeed';
import { ratingText } from '@/lib/following';
import { goalUnit } from '@/lib/goals';
import { reviewCard } from '@/lib/shareCard';
import { formatRelative, formatWatchDate } from '@/lib/dates';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { MediaType } from '@/types';
import { cn } from '@/lib/utils';

/** Lo que hizo, en palabras, con el título como botón a su ficha. */
function Action({ event, onOpen }: { event: ActivityEvent; onOpen: (id: number, type: MediaType) => void }) {
  const title = event.title ? (
    <button
      type="button"
      onClick={() => onOpen(event.title!.tmdbId, event.title!.mediaType)}
      className="italic font-semibold hover:underline text-left"
    >
      {event.title.title}
    </button>
  ) : null;
  const stars = event.rating ? (
    <span className="inline-flex items-center gap-0.5 font-semibold">
      {ratingText(event.rating)}
      <Star size={12} className="fill-accent text-accent" aria-hidden="true" />
    </span>
  ) : null;

  switch (event.kind) {
    case 'completed':
      if (event.rewatch) return <>volvió a ver {title}{stars && <> y le puso {stars}</>}</>;
      return stars ? <>le puso {stars} a {title}</> : <>terminó {title}</>;
    case 'abandoned':
      return <>abandonó {title}</>;
    case 'started':
      return <>empezó {title}</>;
    case 'progress':
      return (
        <>
          vio {event.episodes === 1 ? '1 episodio' : `${event.episodes ?? 1} episodios`} de {title}
        </>
      );
    case 'added':
      return <>sumó {title} a su Por Ver</>;
    case 'goal':
      return event.goal ? (
        <>
          cumplió su meta de <strong>{goalUnit(event.goal.kind, event.goal.target)}</strong> en {event.goal.year}
        </>
      ) : (
        <>cumplió una meta</>
      );
    case 'list':
      return event.list ? (
        <>
          publicó la lista{' '}
          <Link to={`/l/${event.list.id}`} className="font-semibold hover:underline">
            “{event.list.name}”
          </Link>
        </>
      ) : null;
  }
}

function Poster({ event }: { event: ActivityEvent }) {
  if (!event.title) {
    const Icon = event.kind === 'goal' ? Target : ListVideo;
    return (
      <span className="w-12 self-start aspect-[2/3] shrink-0 rounded-md bg-border-card flex items-center justify-center text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="w-12 self-start aspect-[2/3] shrink-0 rounded-md bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
      {event.title.posterPath ? (
        <img src={`${TMDB_IMAGE_BASE_URL}${event.title.posterPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : event.title.mediaType === 'tv' ? (
        <Tv size={18} aria-hidden="true" />
      ) : (
        <Film size={18} aria-hidden="true" />
      )}
    </span>
  );
}

/** Una reseña, tapada si puede arruinarte algo que tenés pendiente. */
function ReviewText({ event }: { event: ActivityEvent }) {
  const mediaList = useMediaStore((state) => state.mediaList);
  const [revealed, setRevealed] = useState(false);
  if (!event.text) return null;

  if (!revealed && isSpoilerRisk(event, mediaList)) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="self-start flex items-center gap-2 text-sm text-text-muted border border-dashed border-border-control rounded-control px-3 py-2 hover:text-text-main"
      >
        <Eye size={14} aria-hidden="true" />
        Mostrar la reseña (todavía no lo terminaste: puede tener spoilers)
      </button>
    );
  }
  return (
    <blockquote className="border-l-2 border-accent pl-3 text-sm leading-relaxed text-text-muted">{event.text}</blockquote>
  );
}

/**
 * Un evento del feed: quién, qué hizo, cuándo, y lo que se puede hacer con
 * eso —abrir la ficha, guardarlo en *Por Ver*, reaccionar, compartir la
 * reseña como historia—.
 */
export function FeedCard({
  item,
  onOpen,
  showPerson = true,
}: {
  item: FeedItem;
  onOpen: (id: number, type: MediaType) => void;
  /** En el perfil de alguien, su nombre en cada tarjeta sobra. */
  showPerson?: boolean;
}) {
  const { event, person } = item;
  const title = event.title;
  const saved = useMediaStore((state) =>
    title ? state.mediaList.some((media) => media.tmdbId === title.tmdbId && media.mediaType === title.mediaType) : false,
  );
  const { saveFromSocial } = useSocialInteractions();
  const { uid } = useSocial();
  const isMine = person.uid === uid;
  const [isSaving, setIsSaving] = useState(false);
  const detail = progressDetail(event);

  const save = async () => {
    if (!title) return;
    setIsSaving(true);
    try {
      await saveFromSocial(title, { uid: person.uid, name: person.name, via: 'feed' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <li>
      <article aria-label={eventHeadline(person.name, event)} className="p-4 flex flex-col gap-3">
        <div className="flex gap-3">
          {showPerson && (
            <Link to={`/u/${person.handle}`} tabIndex={-1} aria-hidden="true" className="self-start">
              <Avatar name={person.name} avatarPath={person.avatarPath} />
            </Link>
          )}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="text-sm leading-relaxed">
              {showPerson && (
                <>
                  <Link to={`/u/${person.handle}`} className="font-semibold hover:underline">
                    {person.name}
                  </Link>{' '}
                </>
              )}
              <Action event={event} onOpen={onOpen} />
            </p>
            <p className="text-xs text-text-subtle flex flex-wrap items-center gap-x-2">
              <time dateTime={event.at} title={formatWatchDate(event.at)}>
                {formatRelative(event.at)}
              </time>
              {event.rewatch && (
                <span className="flex items-center gap-1">
                  <Repeat size={11} aria-hidden="true" /> Otra vez
                </span>
              )}
              {detail && <span>{detail}</span>}
            </p>
          </div>
          <Poster event={event} />
        </div>

        {/* Debajo, a lo ancho desde el texto en pantallas anchas y a lo ancho
            de la tarjeta en el teléfono, donde al lado del póster no entra. */}
        <div className={cn('flex flex-col gap-2', showPerson && 'sm:pl-[3.25rem]')}>
          {event.tags && event.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {event.tags.map((tag) => (
                <li key={tag} className="px-2 py-0.5 rounded-full bg-border-card text-[11px] text-text-muted">
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <ReviewText event={event} />

          <div className="flex flex-wrap items-center gap-2">
            <ReactionBar ownerUid={person.uid} eventId={event.id} reactions={item.reactions} canReact={item.canReact} />
            {title &&
              (saved ? (
                <span className="flex items-center gap-1.5 text-xs text-text-subtle">
                  <Check size={14} aria-hidden="true" /> En tu biblioteca
                </span>
              ) : (
                <button type="button" onClick={save} disabled={isSaving} className="btn btn-secondary px-3 py-1.5 text-xs">
                  <Plus size={14} aria-hidden="true" /> Guardar en Por Ver
                </button>
              ))}
            {title && event.kind === 'completed' && event.text && (
              <ShareButton
                title={isMine ? 'Mi reseña' : `La reseña de ${person.name}`}
                text={eventHeadline(person.name, event)}
                card={reviewCard({
                  author: person.name,
                  title: title.title,
                  releaseYear: title.releaseYear,
                  rating: event.rating,
                  text: event.text,
                  own: isMine,
                })}
                label="Compartir"
                className="px-3 py-1.5 text-xs"
              />
            )}
          </div>
        </div>
      </article>
    </li>
  );
}
