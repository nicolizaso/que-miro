import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Film, HeartHandshake, Tv, UserX } from 'lucide-react';
import { useMediaStore } from '@/store';
import { usePublicProfileBySlug } from '@/hooks/usePublicProfile';
import { useSocial } from '@/hooks/useSocial';
import { usePerson } from '@/hooks/usePerson';
import { seenFromLibrary } from '@/lib/affinity';
import { PickerRoulette } from '@/components/PickerRoulette';
import { DuelMode } from '@/components/DuelMode';
import { ModeSwitch, PickerMode } from '@/components/picker/ModeSwitch';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { TogetherCandidate, crossWatchlists, sharedPlatforms, sourceLabel } from '@/lib/together';
import { subscribedNames } from '@/lib/subscriptions';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { SavedMedia } from '@/types';


/** El resultado del sorteo: póster, de quién era y la ficha a un toque. */
function TogetherResult({
  candidate,
  name,
  onOpen,
}: {
  candidate: TogetherCandidate | undefined;
  name: string;
  onOpen: (media: SavedMedia) => void;
}) {
  if (!candidate) return null;
  const { media, source } = candidate;
  return (
    <div className="surface p-4 flex gap-4 items-center">
      <span className="w-20 aspect-[2/3] shrink-0 rounded-md bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
        {media.posterPath ? (
          <img src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`} alt="" className="w-full h-full object-cover" />
        ) : media.mediaType === 'tv' ? (
          <Tv size={22} aria-hidden="true" />
        ) : (
          <Film size={22} aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex flex-col gap-1">
        <p className="font-semibold leading-snug">{media.title}</p>
        <p className="text-xs text-text-subtle">
          {[media.releaseYear, media.genres[0]].filter(Boolean).join(' · ')}
        </p>
        <p className="text-xs text-accent">{sourceLabel(source, name)}</p>
        <button
          type="button"
          onClick={() => onOpen(media)}
          className="self-start text-sm text-text-muted hover:text-text-main underline underline-offset-4"
        >
          Ver la ficha
        </button>
      </div>
    </div>
  );
}

/**
 * "¿Qué miramos juntos?": mi *Por Ver* cruzado con el de otra persona, y el
 * sorteo o el duelo sobre eso.
 *
 * Lo de la otra persona sale de su perfil público, que tiene que incluir su
 * *Por Ver* (es una opción suya, apagada por defecto). El cruce es de
 * `lib/together.ts`; la ruleta y el duelo son los del picker, en modo "de a
 * dos": el ranking no toca tu lista.
 */
export function TogetherView() {
  const { slug } = useParams<{ slug: string }>();
  const { profile: publicProfile, isLoading: isLoadingProfile, error } = usePublicProfileBySlug(slug);
  // Con cuenta social, lo de quien seguís sale de su actividad: no hace falta
  // que publique su perfil ni que prenda "Incluir mi Por Ver".
  const social = useSocial();
  const person = usePerson(social.mode === 'off' ? undefined : slug);
  const activity = person.activity && person.activity !== 'locked' ? person.activity : null;
  const fromActivity = activity && person.account && activity.watchlist.length > 0 ? activity : null;
  const account = person.account;
  // Memorizado: la ruleta y el duelo se reinician si la lista de candidatos
  // cambia de identidad, y esto se rearma en cada render.
  const profile = useMemo(
    () =>
      fromActivity && account
        ? {
            slug: account.handle,
            displayName: account.displayName,
            watchlist: fromActivity.watchlist,
            seen: seenFromLibrary(fromActivity.library),
            subscriptions: publicProfile?.subscriptions,
          }
        : publicProfile
          ? {
              slug: publicProfile.slug,
              displayName: publicProfile.displayName,
              watchlist: publicProfile.watchlist,
              seen: [...publicProfile.reviews, ...publicProfile.favorites],
              subscriptions: publicProfile.subscriptions,
            }
          : null,
    [fromActivity, account, publicProfile],
  );
  const isLoading =
    isLoadingProfile || (social.mode !== 'off' && person.account === undefined && !person.error);
  const mediaList = useMediaStore((state) => state.mediaList);
  const subscriptions = useMediaStore((state) => state.subscriptions);
  const [mode, setMode] = useState<PickerMode>('azar');
  const [open, setOpen] = useState<SavedMedia | null>(null);

  const cross = useMemo(
    () =>
      profile?.watchlist
        ? crossWatchlists(mediaList, {
            watchlist: profile.watchlist,
            seen: profile.seen,
          })
        : [],
    [profile, mediaList],
  );
  const pool = useMemo(() => cross.map(({ media }) => media), [cross]);
  const shared = useMemo(
    () => sharedPlatforms(subscribedNames(subscriptions), profile?.subscriptions ?? []),
    [subscriptions, profile],
  );

  if (isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 pt-8 flex flex-col gap-4" role="status" aria-label="Cargando">
        <div className="h-10 w-2/3 bg-border-card rounded-control animate-pulse" />
        <div className="h-40 bg-border-card rounded-surface animate-pulse" />
      </div>
    );
  }

  if (error || !profile || !profile.watchlist) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-20 px-4 max-w-md mx-auto">
        <UserX className="text-border-card w-14 h-14" aria-hidden="true" />
        <h1 className="text-display">
          {error ? 'No pudimos cargar el perfil' : !profile ? 'Este perfil no existe' : 'Su Por Ver no es público'}
        </h1>
        <p className="text-text-muted">
          {error
            ? 'Puede ser un problema momentáneo. Probá de nuevo en un rato.'
            : !profile
              ? 'El link puede estar mal escrito, o esta persona dejó de compartir su biblioteca.'
              : `Para cruzar sus listas, ${profile.displayName} tiene que compartir su biblioteca con quienes lo siguen, o activar "Incluir mi Por Ver" en su perfil público.`}
        </p>
        <Link to="/" className="btn btn-secondary px-4 py-2.5 text-sm">
          Ir a Mis listas
        </Link>
      </div>
    );
  }

  const both = cross.filter((candidate) => candidate.source === 'both').length;
  const name = profile.displayName;

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-4 pt-8">
      <HeartHandshake className="text-accent w-10 h-10 mb-3" aria-hidden="true" />
      <h1 className="text-display mb-2 text-center">¿Qué miramos juntos?</h1>
      <p className="text-text-muted mb-6 text-center">
        Vos y{' '}
        <Link to={`/u/${profile.slug}`} className="text-text-main font-semibold hover:underline">
          {name}
        </Link>
        :{' '}
        {cross.length === 0
          ? 'no hay nada en común para elegir todavía.'
          : both > 0
            ? `${both} ${both === 1 ? 'título que tienen' : 'títulos que tienen'} los dos en Por Ver, y ${cross.length - both} más que uno quiere ver y el otro no vio.`
            : `${cross.length} ${cross.length === 1 ? 'título que uno quiere ver' : 'títulos que uno quiere ver'} y el otro no vio.`}
      </p>

      {cross.length > 0 && (
        <>
          <div className="mb-8">
            <ModeSwitch value={mode} onChange={setMode} label="Cómo elegir" />
          </div>

          {mode === 'azar' ? (
            <PickerRoulette
              pending={pool}
              together={{
                name,
                shared,
                renderResult: (picked) => (
                  <TogetherResult
                    candidate={cross.find(
                      ({ media }) => media.tmdbId === picked.tmdbId && media.mediaType === picked.mediaType,
                    )}
                    name={name}
                    onOpen={setOpen}
                  />
                ),
              }}
            />
          ) : (
            <DuelMode pending={pool} together={{ name }} />
          )}
        </>
      )}

      {open && (
        <TitleDetailModal
          id={open.tmdbId}
          mediaType={open.mediaType}
          media={mediaList.find((media) => media.tmdbId === open.tmdbId && media.mediaType === open.mediaType)}
          isOpen
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
