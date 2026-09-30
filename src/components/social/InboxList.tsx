import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, Film, Plus, Tv, UserCheck, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/components/social/Avatar';
import { FollowButton } from '@/components/social/FollowButton';
import { useInbox } from '@/hooks/useInbox';
import { usePeople } from '@/hooks/usePeople';
import { useFollowActions } from '@/hooks/useFollowActions';
import { useSocialInteractions } from '@/hooks/useSocialInteractions';
import { useOwnActivity } from '@/hooks/useActivityPublisher';
import { useMediaStore } from '@/store';
import { InboxItem } from '@/lib/inbox';
import { REACTIONS } from '@/lib/social';
import { formatRelative, formatWatchDate } from '@/lib/dates';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';

/** Las notificaciones: solicitudes arriba de todo, después lo demás por fecha. */
export function InboxList() {
  const { items } = useInbox();
  const people = usePeople(items.map((item) => item.uid));
  const own = useOwnActivity();
  const { accept, reject } = useFollowActions();
  const { acceptRecommendation, dismissRecommendation } = useSocialInteractions();
  const mediaList = useMediaStore((state) => state.mediaList);
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...items.filter((item) => item.kind === 'request'), ...items.filter((item) => item.kind !== 'request')],
    [items],
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-16 px-4">
        <Bell className="text-border-card w-12 h-12" aria-hidden="true" />
        <p className="text-text-muted max-w-sm">
          Acá te avisamos cuando alguien te sigue, te pide seguirte, reacciona a lo tuyo o te recomienda algo.
        </p>
      </div>
    );
  }

  const nameOf = (item: InboxItem) =>
    item.kind === 'reaction'
      ? item.reaction.reactorName
      : item.kind === 'recommendation'
        ? item.recommendation.fromName
        : (people[item.uid]?.displayName ?? 'Alguien');
  const handleOf = (item: InboxItem) =>
    people[item.uid]?.handle ??
    (item.kind === 'reaction' ? item.reaction.reactorHandle : item.kind === 'recommendation' ? item.recommendation.fromHandle : '');

  const text = (item: InboxItem) => {
    switch (item.kind) {
      case 'request':
        return 'quiere seguirte.';
      case 'follow':
        return 'empezó a seguirte.';
      case 'accepted':
        return 'aceptó tu solicitud.';
      case 'reaction': {
        const reaction = REACTIONS.find((r) => r.id === item.reaction.emoji);
        const event = own?.events.find((e) => e.id === item.reaction.eventId);
        return (
          <>
            reaccionó <span aria-hidden="true">{reaction?.emoji}</span>
            <span className="sr-only">{reaction?.label}</span>
            {event?.title ? (
              <>
                {' '}a lo tuyo de <em className="font-semibold">{event.title.title}</em>.
              </>
            ) : (
              ' a tu actividad.'
            )}
          </>
        );
      }
      case 'recommendation':
        return (
          <>
            te recomendó <em className="font-semibold">{item.recommendation.title}</em>.
          </>
        );
    }
  };

  return (
    <ul className="surface divide-y divide-border-card">
      {sorted.map((item) => {
        const name = nameOf(item);
        const handle = handleOf(item);
        const person = people[item.uid];
        return (
          <li key={item.key} className="p-4 flex gap-3 items-start">
            <Avatar name={name} avatarPath={person?.avatarPath ?? null} />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <p className="text-sm leading-relaxed">
                {handle ? (
                  <Link to={`/u/${handle}`} className="font-semibold hover:underline">
                    {name}
                  </Link>
                ) : (
                  <span className="font-semibold">{name}</span>
                )}{' '}
                {text(item)}
              </p>
              <time dateTime={item.at} title={formatWatchDate(item.at)} className="text-xs text-text-subtle">
                {formatRelative(item.at)}
              </time>

              {item.kind === 'recommendation' && item.recommendation.note && (
                <blockquote className="border-l-2 border-accent pl-3 text-sm text-text-muted">
                  {item.recommendation.note}
                </blockquote>
              )}

              {item.kind === 'request' && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => accept(item.uid)} className="btn btn-primary px-3 py-1.5 text-xs">
                    <UserCheck size={14} aria-hidden="true" /> Aceptar
                  </button>
                  <button type="button" onClick={() => reject(item.uid)} className="btn btn-secondary px-3 py-1.5 text-xs">
                    <X size={14} aria-hidden="true" /> Rechazar
                  </button>
                </div>
              )}

              {item.kind === 'follow' && person && <FollowButton target={person} className="self-start px-3 py-1.5 text-xs" />}

              {item.kind === 'recommendation' && (
                <div className="flex flex-wrap gap-2">
                  {mediaList.some(
                    (media) =>
                      media.tmdbId === item.recommendation.tmdbId && media.mediaType === item.recommendation.mediaType,
                  ) ? (
                    <span className="flex items-center gap-1.5 text-xs text-text-subtle">
                      <Check size={14} aria-hidden="true" /> Ya lo tenés
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === item.key}
                      onClick={async () => {
                        setBusy(item.key);
                        try {
                          await acceptRecommendation(item.recommendation);
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className="btn btn-primary px-3 py-1.5 text-xs"
                    >
                      <Plus size={14} aria-hidden="true" /> Guardar en Por Ver
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dismissRecommendation(item.recommendation)}
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
            {item.kind === 'recommendation' ? (
              <span className="w-12 aspect-[2/3] shrink-0 rounded-md bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
                {item.recommendation.posterPath ? (
                  <img src={`${TMDB_IMAGE_BASE_URL}${item.recommendation.posterPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : item.recommendation.mediaType === 'tv' ? (
                  <Tv size={16} aria-hidden="true" />
                ) : (
                  <Film size={16} aria-hidden="true" />
                )}
              </span>
            ) : item.kind === 'request' ? (
              <UserPlus size={18} className="text-accent shrink-0" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
