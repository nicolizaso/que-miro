import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Loader2, LogIn, MessageCircle, RefreshCw, Search, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { findByHandle, useSocial } from '@/hooks/useSocial';
import { useSocialAccount } from '@/hooks/useSocialAccount';
import { useSocialFeed } from '@/hooks/useSocialFeed';
import { useSocialSettings } from '@/hooks/useSocialSettings';
import { useInbox } from '@/hooks/useInbox';
import { usePeople } from '@/hooks/usePeople';
import { usePublishProfile } from '@/hooks/usePublicProfile';
import { Avatar } from '@/components/social/Avatar';
import { FeedCard } from '@/components/social/FeedCard';
import { FollowButton } from '@/components/social/FollowButton';
import { InboxList } from '@/components/social/InboxList';
import { ProfileEditor } from '@/components/social/ProfileEditor';
import { WatchingRow } from '@/components/social/WatchingRow';
import { ShareButton } from '@/components/ShareButton';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { FEED_FILTERS, FeedFilter } from '@/lib/socialFeed';
import { SUGGESTION_TEXT, suggestions } from '@/lib/inbox';
import { Account, inviteText, inviteUrl, normalizeHandle, suggestHandle, whatsappUrl } from '@/lib/social';
import { cn } from '@/lib/utils';
import { MediaType } from '@/types';

/** La tarjeta de alguien para seguir: nombre, usuario, por qué, y el botón. */
function PersonRow({ account, reason }: { account: Account; reason?: string }) {
  return (
    <li className="p-4 flex items-center gap-3">
      <Link to={`/u/${account.handle}`} tabIndex={-1} aria-hidden="true">
        <Avatar name={account.displayName} avatarPath={account.avatarPath} />
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/u/${account.handle}`} className="font-semibold hover:underline block truncate">
          {account.displayName}
        </Link>
        <p className="text-xs text-text-subtle truncate">
          @{account.handle}
          {reason && ` · ${reason}`}
        </p>
      </div>
      <FollowButton target={account} className="px-3 py-1.5 text-xs" />
    </li>
  );
}

/** A quién seguir: gente que ya tiene algo que ver con vos. Sin nadie, no aparece. */
function Suggestions() {
  const { uid, follows, reactions, recommendations, blocked } = useSocial();
  const list = useMemo(
    () => (uid ? suggestions({ myUid: uid, follows, reactions, recommendations, dismissed: blocked }) : []),
    [uid, follows, reactions, recommendations, blocked],
  );
  const people = usePeople(list.map((item) => item.uid));
  const ready = list.flatMap((item) => (people[item.uid] ? [{ account: people[item.uid]!, reason: SUGGESTION_TEXT[item.reason] }] : []));
  if (ready.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section">Para seguir</h2>
      <ul className="surface divide-y divide-border-card">
        {ready.map(({ account, reason }) => (
          <PersonRow key={account.uid} account={account} reason={reason} />
        ))}
      </ul>
    </section>
  );
}

/** Invitar: por WhatsApp o con la hoja de compartir del sistema. */
function InviteCard({ account }: { account: Account }) {
  if (typeof window === 'undefined') return null;
  const url = inviteUrl(window.location.origin, account.handle);
  return (
    <div className="surface p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Invitá a tu gente</h2>
        <p className="text-sm text-text-muted">
          El link lleva a tu perfil: desde ahí te siguen, y si los seguís de vuelta pueden recomendarse cosas y elegir
          qué ver juntos.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappUrl(inviteText(account, url))}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary px-4 py-2 text-sm"
        >
          <MessageCircle size={16} aria-hidden="true" /> Invitar por WhatsApp
        </a>
        <ShareButton label="Compartir link" title="Sumate a Qué Miro?" text={inviteText(account, '').replace(/: $/, '.')} url={url} />
      </div>
    </div>
  );
}

/** Pestaña "Feed": viendo ahora, los filtros y la actividad de todos. */
export function SocialFeedTab() {
  const { account, follows } = useSocial();
  const [filter, setFilter] = useState<FeedFilter>('todo');
  const { items, watching, isLoading, refresh, mutuals } = useSocialFeed({ filter });
  const legacyCount = useMediaStore((state) => state.following.profiles.length);
  const [open, setOpen] = useState<{ id: number; type: MediaType } | null>(null);
  const mediaList = useMediaStore((state) => state.mediaList);
  const followsSomeone = follows.outgoing.length > 0 || legacyCount > 0;

  if (!account) return null;

  return (
    <div className="flex flex-col gap-8">
      <WatchingRow bubbles={watching} onOpen={(id, type) => setOpen({ id, type })} />

      {followsSomeone ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Qué mostrar" className="flex bg-bg-card p-1 rounded-control border border-border-card">
              {FEED_FILTERS.filter((option) => option.id !== 'amigos' || mutuals.length > 0).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    filter === option.id ? 'bg-border-card text-text-main' : 'text-text-muted hover:text-text-main',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={refresh} disabled={isLoading} className="btn btn-secondary px-3 py-2 text-sm">
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={16} aria-hidden="true" />
              )}
              Actualizar
            </button>
          </div>

          {items.length > 0 ? (
            <ul className="surface divide-y divide-border-card">
              {items.map((item) => (
                <FeedCard key={item.key} item={item} onOpen={(id, type) => setOpen({ id, type })} />
              ))}
            </ul>
          ) : isLoading ? (
            <p className="flex items-center gap-2 text-sm text-text-subtle py-6" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Leyendo lo que anda mirando tu gente…
            </p>
          ) : (
            <p className="text-sm text-text-muted py-6">
              {filter === 'todo'
                ? 'Todavía no hay actividad de quienes seguís. Cuando terminen, empiecen o sumen algo, aparece acá.'
                : filter === 'resenas'
                  ? 'Nadie de los que seguís escribió una reseña hace poco.'
                  : 'Tus amigos no tienen actividad reciente.'}
            </p>
          )}
        </section>
      ) : (
        <div className="flex flex-col items-center text-center gap-3 py-10 px-4">
          <Users className="text-border-card w-14 h-14" aria-hidden="true" />
          <h2 className="text-section">Seguí a alguien para arrancar</h2>
          <p className="text-text-muted max-w-md">
            Buscá a tu gente por su usuario o mandales tu link: cuando los sigas, acá vas a ver qué terminan, qué
            empiezan y qué les encantó.
          </p>
          <Link to="/social/buscar" className="btn btn-secondary px-4 py-2 text-sm">
            <Search size={16} aria-hidden="true" /> Buscar gente
          </Link>
        </div>
      )}

      <Suggestions />
      <InviteCard account={account} />

      {open && (
        <TitleDetailModal
          id={open.id}
          mediaType={open.type}
          media={mediaList.find((media) => media.tmdbId === open.id && media.mediaType === open.type)}
          isOpen
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** Pestaña "Notificaciones": abrirla da por vistas las de hasta ahora. */
export function SocialInboxTab() {
  const { markInboxSeen } = useSocialSettings();
  const { unread } = useInbox();
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || unread === 0) return;
    marked.current = true;
    markInboxSeen();
  }, [unread, markInboxSeen]);

  return <InboxList />;
}

/** Pestaña "Buscar": por usuario exacto, o invitando. */
export function SocialSearchTab() {
  const { account } = useSocial();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Account | null | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const handle = normalizeHandle(query);
    if (!handle) return;
    setIsSearching(true);
    try {
      setResult(await findByHandle(handle));
    } catch {
      setResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <form onSubmit={search} className="flex gap-2" role="search">
          <label htmlFor="buscar-usuario" className="sr-only">
            Usuario
          </label>
          <div className="flex-1 flex items-center bg-bg-main border border-border-control rounded-control focus-within:border-accent">
            <span className="pl-3 text-text-subtle" aria-hidden="true">
              @
            </span>
            <input
              id="buscar-usuario"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResult(undefined);
              }}
              placeholder="usuario"
              autoCapitalize="none"
              spellCheck={false}
              className="flex-1 bg-transparent px-2 py-3 focus:outline-none"
            />
          </div>
          <button type="submit" disabled={isSearching || !query.trim()} className="btn btn-primary px-4 text-sm">
            {isSearching ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
            Buscar
          </button>
        </form>
        <p className="text-xs text-text-subtle">
          Se busca por el usuario exacto: no hay un directorio para recorrer, así nadie te encuentra si no sabe cómo te
          llamás.
        </p>
        <div aria-live="polite">
          {result === null && <p className="text-sm text-text-muted">No hay nadie con ese usuario.</p>}
          {result && (
            <ul className="surface divide-y divide-border-card">
              <PersonRow account={result} reason={result.uid === account?.uid ? 'Sos vos' : undefined} />
            </ul>
          )}
        </div>
      </section>

      <Suggestions />
      {account && <InviteCard account={account} />}
    </div>
  );
}

/** La primera vez: elegir usuario, nombre, avatar y si la cuenta es pública. */
function Onboarding() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isAvailable, create } = useSocialAccount();
  const { slug, isLoading } = usePublishProfile();

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-subtle" role="status">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Cargando…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex flex-col gap-2">
        <p className="text-text-muted">
          Elegí cómo te van a encontrar. Tu cuenta arranca pública —cualquiera con cuenta te sigue y ve lo que
          mirás—, pero la podés hacer privada ahora o cuando quieras. Qué se comparte lo elegís en Ajustes, y un
          título puntual se oculta desde su ficha.
        </p>
        {slug && (
          <p className="text-sm text-text-subtle">
            Te propusimos la dirección de tu perfil público: el usuario y la dirección son lo mismo.
          </p>
        )}
      </div>
      <ProfileEditor
        initial={{
          handle: suggestHandle({ publicSlug: slug, displayName: user?.displayName, email: user?.email }),
          displayName: user?.displayName || user?.email?.split('@')[0] || '',
          bio: '',
          avatarPath: null,
          top4: [],
          private: false,
        }}
        submitLabel="Crear mi usuario"
        checkHandle={isAvailable}
        onSubmit={async (draft) => {
          await create(draft);
          showToast(`Listo, sos @${draft.handle}.`);
        }}
      />
    </div>
  );
}

const TABS = [
  { to: '.', label: 'Feed', end: true },
  { to: 'notificaciones', label: 'Notificaciones', end: false },
  { to: 'buscar', label: 'Buscar', end: false },
] as const;

/**
 * Lo social: el feed de quienes seguís, las notificaciones y buscar gente.
 * La primera vez, antes de todo, elegir el usuario.
 */
export function SocialView() {
  const { authState, exitGuestMode } = useAuth();
  const { mode, isLoading, needsOnboarding, unavailable } = useSocial();
  const { unread } = useInbox();
  const { pathname } = useLocation();
  const tabList = useRef<HTMLUListElement>(null);

  useEffect(() => {
    tabList.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  let body: React.ReactNode;
  if (authState === 'guest' || mode === 'off') {
    body = (
      <div className="flex flex-col items-center text-center gap-4 py-16 px-4 max-w-md mx-auto">
        <Users className="text-border-card w-14 h-14" aria-hidden="true" />
        <h2 className="text-section">Lo social necesita una cuenta</h2>
        <p className="text-text-muted">
          Para seguir a otros y que te sigan hace falta iniciar sesión: tu biblioteca de invitado se pasa sola a la
          cuenta.
        </p>
        {authState === 'guest' && (
          <button type="button" onClick={exitGuestMode} className="btn btn-primary px-4 py-2 text-sm">
            <LogIn size={16} aria-hidden="true" /> Ingresar
          </button>
        )}
      </div>
    );
  } else if (unavailable) {
    body = (
      <p className="text-text-muted">
        Lo social no está disponible todavía en este servidor: faltan publicar las reglas de Firestore.
      </p>
    );
  } else if (isLoading) {
    body = (
      <div className="flex flex-col gap-3" role="status" aria-label="Cargando">
        <div className="h-24 bg-border-card rounded-surface animate-pulse" />
        <div className="h-40 bg-border-card rounded-surface animate-pulse" />
      </div>
    );
  } else if (needsOnboarding) {
    body = <Onboarding />;
  } else {
    body = (
      <>
        <nav aria-label="Secciones de lo social">
          <ul ref={tabList} className="rail flex items-center gap-1 border-b border-border-card overflow-x-auto">
            {TABS.map(({ to, label, end }) => (
              <li key={label} className="shrink-0">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                      'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full',
                      isActive ? 'text-text-main after:bg-accent' : 'text-text-muted hover:text-text-main after:bg-transparent',
                    )
                  }
                >
                  {label}
                  {to === 'notificaciones' && unread > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-contrast text-[11px] font-bold flex items-center justify-center">
                      {unread}
                      <span className="sr-only"> sin ver</span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Outlet />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl mx-auto px-4 pt-10">
      <h1 className="text-display">Social</h1>
      {body}
    </div>
  );
}
