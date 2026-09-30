import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Film, HeartHandshake, Link2, Lock, MoreHorizontal, Pencil, Send, Tv, UserX } from 'lucide-react';
import { useMediaStore } from '@/store';
import { useSocial } from '@/hooks/useSocial';
import { usePerson } from '@/hooks/usePerson';
import { useFollowActions } from '@/hooks/useFollowActions';
import { Avatar } from '@/components/social/Avatar';
import { FeedCard } from '@/components/social/FeedCard';
import { FollowButton } from '@/components/social/FollowButton';
import { RecommendDialog } from '@/components/social/RecommendDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { PublicProfileContent } from '@/views/PublicProfileView';
import { Activity } from '@/lib/activity';
import { affinity, affinityLabel } from '@/lib/affinity';
import { FeedItem, isReview } from '@/lib/socialFeed';
import { Account, relationship } from '@/lib/social';
import { ratingText } from '@/lib/following';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import { MediaType } from '@/types';

type Tab = 'actividad' | 'resenas' | 'listas' | 'comun';

function itemsOf(account: Account, activity: Activity): FeedItem[] {
  const person = { uid: account.uid, handle: account.handle, name: account.displayName, avatarPath: account.avatarPath };
  return activity.events.map((event) => ({
    key: `${account.uid}:${event.id}`,
    person,
    event,
    reactions: activity.reactions[event.id] ?? {},
    canReact: true,
  }));
}

/** El top 4: cuatro pósters, en el orden en que los eligió. */
function TopFour({ account, onOpen }: { account: Account; onOpen: (id: number, type: MediaType) => void }) {
  if (account.top4.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section">Su top 4</h2>
      <ol className="grid grid-cols-4 gap-2 sm:gap-4">
        {account.top4.map((title) => (
          <li key={`${title.mediaType}-${title.tmdbId}`}>
            <button
              type="button"
              onClick={() => onOpen(title.tmdbId, title.mediaType)}
              className="w-full text-left"
              aria-label={title.title}
            >
              <span className="block aspect-[2/3] rounded-control overflow-hidden bg-border-card shadow-card">
                {title.posterPath ? (
                  <img src={`${TMDB_IMAGE_BASE_URL}${title.posterPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full grid place-items-center text-text-subtle">
                    {title.mediaType === 'tv' ? <Tv size={18} aria-hidden="true" /> : <Film size={18} aria-hidden="true" />}
                  </span>
                )}
              </span>
              <span className="block text-xs mt-1.5 line-clamp-2">{title.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "En común": el porcentaje, lo que les encantó a los dos y en qué no coinciden. */
function Common({ activity, name }: { activity: Activity; name: string }) {
  const mediaList = useMediaStore((state) => state.mediaList);
  const result = useMemo(() => affinity(mediaList, activity.library), [mediaList, activity.library]);
  if (!result) return null;

  const Pair = ({ items, empty }: { items: typeof result.bothLoved; empty?: string }) =>
    items.length === 0 ? (empty ? <p className="text-sm text-text-muted">{empty}</p> : null) : (
      <ul className="surface divide-y divide-border-card">
        {items.map(({ media, mine, theirs }) => (
          <li key={`${media.mediaType}-${media.tmdbId}`} className="p-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium truncate">{media.title}</span>
            <span className="shrink-0 text-text-muted tabular-nums">
              Vos {ratingText(mine)} · {name} {ratingText(theirs)}
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="surface p-5 flex items-center gap-5">
        <p className="font-serif italic font-bold text-5xl text-accent tabular-nums">{result.percent}%</p>
        <div>
          <p className="font-semibold">{affinityLabel(result.percent)}</p>
          <p className="text-sm text-text-muted">
            Sobre {result.rated} títulos que puntuaron los dos. Vieron {result.seenBoth} en común.
          </p>
        </div>
      </div>
      {result.bothLoved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-section">Les encantó a los dos</h3>
          <Pair items={result.bothLoved} />
        </section>
      )}
      {result.disagreements.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-section">No coinciden</h3>
          <Pair items={result.disagreements} />
        </section>
      )}
    </div>
  );
}

/**
 * El perfil de alguien dentro de la app: quién es, su top 4, y —si podés
 * verla— su actividad, sus reseñas, sus listas y lo que tienen en común.
 * Seguir, recomendar, ver juntos, silenciar y bloquear salen de acá.
 *
 * Si la persona todavía no creó su cuenta pero tiene perfil público de
 * antes, se muestra ese.
 */
export function UserProfileView() {
  const { slug } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  const { uid, follows, isReady, mode } = useSocial();
  const muted = useMediaStore((state) => state.socialSettings.muted);
  const { mute, unmute, block, unblock, removeFollower } = useFollowActions();
  const { blocked } = useSocial();
  const { account, activity, legacy, isMe, error } = usePerson(slug);
  const mediaList = useMediaStore((state) => state.mediaList);
  const [open, setOpen] = useState<{ id: number; type: MediaType } | null>(null);
  const [tab, setTab] = useState<Tab>('actividad');
  const [isRecommending, setIsRecommending] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const readable = activity && activity !== 'locked' ? activity : null;
  const items = useMemo(() => (account && readable ? itemsOf(account, readable) : []), [account, readable]);
  const reviews = useMemo(() => items.filter((item) => isReview(item.event)), [items]);
  const common = useMemo(
    () => (!isMe && readable ? affinity(mediaList, readable.library) : null),
    [isMe, readable, mediaList],
  );

  const openTitle = (id: number, type: MediaType) => setOpen({ id, type });
  const modal = open && (
    <TitleDetailModal
      id={open.id}
      mediaType={open.type}
      media={mediaList.find((media) => media.tmdbId === open.id && media.mediaType === open.type)}
      isOpen
      onClose={() => setOpen(null)}
    />
  );

  if (error || account === null) {
    if (legacy) {
      return (
        <div className="w-full max-w-3xl mx-auto px-4 pt-10">
          <PublicProfileContent profile={legacy} />
        </div>
      );
    }
    if (account === null && legacy === undefined && !error) return <Loading />;
    return (
      <div className="flex flex-col items-center text-center gap-4 py-20 px-4 max-w-md mx-auto">
        <UserX className="text-border-card w-14 h-14" aria-hidden="true" />
        <h1 className="text-display">{error ? 'No pudimos cargar el perfil' : 'Este perfil no existe'}</h1>
        <p className="text-text-muted">
          {error ? 'Puede ser un problema momentáneo. Probá de nuevo en un rato.' : 'Puede que el usuario esté mal escrito o que la cuenta ya no exista.'}
        </p>
      </div>
    );
  }
  if (!account) return <Loading />;

  const rel = relationship(follows, account.uid);
  const isMuted = muted.includes(account.uid);
  const isBlocked = blocked.includes(account.uid);
  const invited = search.get('invitado') === '1' && !isMe && !rel.following && !rel.requested;

  const tabs: { id: Tab; label: string }[] = [
    ...(items.length > 0 ? [{ id: 'actividad' as const, label: 'Actividad' }] : []),
    ...(reviews.length > 0 ? [{ id: 'resenas' as const, label: 'Reseñas' }] : []),
    ...(readable && readable.lists.length > 0 ? [{ id: 'listas' as const, label: 'Listas' }] : []),
    ...(common ? [{ id: 'comun' as const, label: 'En común' }] : []),
  ];
  const current = tabs.find((option) => option.id === tab)?.id ?? tabs[0]?.id;

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl mx-auto px-4 pt-10">
      {invited && (
        <div className="rounded-surface border border-accent/40 bg-accent/10 p-4 text-sm">
          <strong>{account.displayName}</strong> te invitó a Qué Miro?. Seguila para ver lo que mira; si te sigue de
          vuelta, van a poder recomendarse cosas y elegir qué ver juntos.
        </div>
      )}

      <header className="flex flex-col sm:flex-row gap-5 sm:items-center">
        <Avatar name={account.displayName} avatarPath={account.avatarPath} size="xl" />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div>
            <h1 className="text-display flex items-center gap-2">
              <span className="truncate">{account.displayName}</span>
              {account.private && <Lock size={20} className="text-text-subtle shrink-0" aria-label="Cuenta privada" />}
            </h1>
            <p className="text-text-subtle">
              @{account.handle}
              {rel.followsYou && !isMe && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-border-card text-xs text-text-muted">Te sigue</span>
              )}
            </p>
          </div>
          {account.bio && <p className="text-text-muted">{account.bio}</p>}
          <p className="text-sm text-text-muted">
            <strong className="text-text-main">{account.followers}</strong> {account.followers === 1 ? 'seguidor' : 'seguidores'} ·{' '}
            <strong className="text-text-main">{account.following}</strong> {account.following === 1 ? 'seguido' : 'seguidos'}
          </p>
          <div className="flex flex-wrap gap-2">
            {isMe ? (
              <Link to="/perfil/ajustes" className="btn btn-secondary px-4 py-2 text-sm">
                <Pencil size={16} aria-hidden="true" /> Editar perfil
              </Link>
            ) : (
              <>
                <FollowButton target={account} />
                {rel.mutual && isReady && (
                  <button type="button" onClick={() => setIsRecommending(true)} className="btn btn-secondary px-4 py-2 text-sm">
                    <Send size={16} aria-hidden="true" /> Recomendar
                  </button>
                )}
                {readable && readable.watchlist.length > 0 && (
                  <Link to={`/juntos/${account.handle}`} className="btn btn-secondary px-4 py-2 text-sm">
                    <HeartHandshake size={16} aria-hidden="true" /> ¿Qué miramos juntos?
                  </Link>
                )}
                {mode !== 'off' && uid && (
                  <details className="relative">
                    <summary className="btn btn-secondary px-3 py-2 text-sm list-none cursor-pointer" aria-label="Más opciones">
                      <MoreHorizontal size={16} aria-hidden="true" />
                    </summary>
                    <ul className="absolute z-20 mt-2 right-0 sm:left-0 sm:right-auto min-w-56 bg-bg-card border border-border-card rounded-control shadow-pop p-1 flex flex-col">
                      {rel.following && (
                        <li>
                          <button
                            type="button"
                            onClick={() => (isMuted ? unmute(account.uid) : mute(account.uid))}
                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-border-card"
                          >
                            {isMuted ? 'Dejar de silenciar' : 'Silenciar'}
                          </button>
                        </li>
                      )}
                      {(rel.followsYou || rel.requestedYou) && (
                        <li>
                          <button
                            type="button"
                            onClick={() => removeFollower(account.uid)}
                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-border-card"
                          >
                            {rel.requestedYou ? 'Rechazar su solicitud' : 'Quitar de tus seguidores'}
                          </button>
                        </li>
                      )}
                      <li>
                        <button
                          type="button"
                          onClick={() => (isBlocked ? unblock(account.uid) : setConfirmBlock(true))}
                          className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-border-card text-accent"
                        >
                          {isBlocked ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      </li>
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <TopFour account={account} onOpen={openTitle} />

      {activity === 'locked' ? (
        <div className="surface p-6 flex flex-col items-center text-center gap-2">
          <Lock className="text-text-subtle w-8 h-8" aria-hidden="true" />
          <p className="font-semibold">Esta cuenta es privada</p>
          <p className="text-sm text-text-muted">
            {rel.requested ? 'Le mandaste la solicitud: cuando la acepte, vas a ver su actividad.' : 'Seguila para ver su actividad.'}
          </p>
        </div>
      ) : activity === undefined ? (
        <Loading />
      ) : tabs.length > 0 && current ? (
        <section className="flex flex-col gap-4">
          <div role="tablist" aria-label="Qué ver" className="flex gap-1 border-b border-border-card overflow-x-auto rail">
            {tabs.map((option) => (
              <button
                key={option.id}
                role="tab"
                type="button"
                aria-selected={current === option.id}
                onClick={() => setTab(option.id)}
                className={cn(
                  'relative px-4 py-3 text-sm font-medium whitespace-nowrap',
                  'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full',
                  current === option.id ? 'text-text-main after:bg-accent' : 'text-text-muted hover:text-text-main after:bg-transparent',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {current === 'actividad' && (
              <ul className="surface divide-y divide-border-card">
                {items.map((item) => (
                  <FeedCard key={item.key} item={item} onOpen={openTitle} showPerson={false} />
                ))}
              </ul>
            )}
            {current === 'resenas' && (
              <ul className="surface divide-y divide-border-card">
                {reviews.map((item) => (
                  <FeedCard key={item.key} item={item} onOpen={openTitle} showPerson={false} />
                ))}
              </ul>
            )}
            {current === 'listas' && readable && (
              <ul className="surface divide-y divide-border-card">
                {readable.lists.map((list) => (
                  <li key={list.id}>
                    <Link to={`/l/${list.id}`} className="p-4 flex items-center gap-3 hover:bg-border-card/40">
                      <Link2 size={16} className="text-accent" aria-hidden="true" />
                      <span className="flex-1 font-medium">{list.name}</span>
                      <span className="text-sm text-text-subtle">
                        {list.count} {list.count === 1 ? 'título' : 'títulos'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {current === 'comun' && readable && <Common activity={readable} name={account.displayName} />}
          </div>
        </section>
      ) : null}

      {rel.mutual && (
        <RecommendDialog isOpen={isRecommending} onClose={() => setIsRecommending(false)} toUid={account.uid} />
      )}
      <ConfirmDialog
        isOpen={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={() => {
          block(account.uid);
          setConfirmBlock(false);
        }}
        title={`¿Bloquear a ${account.displayName}?`}
        description="Deja de seguirte, dejás de seguirla, y no va a poder volver a seguirte, ver tu actividad ni mandarte recomendaciones. No se le avisa."
        confirmLabel="Bloquear"
        destructive
      />
      {modal}
    </div>
  );
}

function Loading() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 pt-10 flex flex-col gap-4" role="status" aria-label="Cargando">
      <div className="h-24 bg-border-card rounded-surface animate-pulse" />
      <div className="h-40 bg-border-card rounded-surface animate-pulse" />
    </div>
  );
}
