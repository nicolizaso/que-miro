import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getMediaDetail,
  TMDB_IMAGE_BASE_URL,
  TMDB_IMAGE_ORIGINAL_URL,
  TMDB_LOGO_URL,
} from '@/lib/tmdb';
import { canonicalGenreNames } from '@/lib/genres';
import { MediaStatus, SavedMedia, SeasonInfo, TMDbDetail } from '@/types';
import {
  X,
  Play,
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  Plus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Dialog } from '@/components/ui/Dialog';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { SeriesProgress } from '@/components/SeriesProgress';
import { CollectionPicker } from '@/components/CollectionPicker';
import { StatusActions } from '@/components/StatusActions';
import { NotifyToggle } from '@/components/NotifyToggle';
import { WatchHistory } from '@/components/WatchHistory';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { ShareButton } from '@/components/ShareButton';
import { JustWatchCredit } from '@/components/Attribution';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { enrichFromDetail, isStale } from '@/lib/enrich';
import { ProviderLogo, pickProviders } from '@/lib/providers';
import { paysFor, subscribedNames } from '@/lib/subscriptions';
import { newEpisodesSummary } from '@/lib/progress';
import { STATUS_LABELS, isArchivedStatus } from '@/lib/archive';
import { cn } from '@/lib/utils';
import { useMediaStore } from '@/store';
import { getRegionName, usePreferences } from '@/preferences';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  /**
   * El título guardado, si está en la biblioteca. Habilita el progreso y el
   * historial. Sin él la ficha sirve igual para guardarlo, que es como se
   * abre desde Explorar.
   */
  media?: SavedMedia;
  isOpen: boolean;
  onClose: () => void;
}

/** Temporadas de la ficha de TMDB, en la forma que usa la biblioteca. */
function seasonsFromDetail(detail: TMDbDetail | null): SeasonInfo[] {
  return (detail?.seasons ?? [])
    .filter((season) => season.episode_count > 0)
    .map((season) => ({
      seasonNumber: season.season_number,
      name: season.name || `Temporada ${season.season_number}`,
      episodeCount: season.episode_count,
    }));
}

/**
 * Las dos listas a las que se llega de un clic desde la ficha.
 *
 * Son las dos puntas de lo que se hace desde Explorar: anotar algo para
 * después, o dejar asentado algo que ya se vio. *Viendo* queda afuera a
 * propósito: se llega solo al marcar el primer episodio, y sumarla acá era un
 * tercer botón para el caso más raro de los tres.
 */
const QUICK_ADD: { status: MediaStatus; listName: string }[] = [
  { status: 'por_ver', listName: 'Por Ver' },
  // El botón dice "Completada" —habla del título— y el aviso "Completadas",
  // que es como se llama la pestaña a la que fue a parar.
  { status: 'completada', listName: 'Completadas' },
];

/**
 * Un grupo de plataformas —incluidas o de alquiler— con sus logos. Las que
 * pagás llevan un anillo y lo dicen: es lo que responde "¿lo puedo ver ya?".
 */
function ProviderGroup({
  label,
  providers,
  subscribed,
}: {
  label: string;
  providers: ProviderLogo[];
  subscribed: Set<string>;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-eyebrow text-text-subtle">{label}</span>
      <ul className="flex flex-wrap gap-3">
        {providers.slice(0, 6).map((provider) => {
          const isMine = paysFor(subscribed, provider.provider_name);
          return (
            <li
              key={provider.provider_name}
              className="flex flex-col items-center gap-1 w-14"
              title={provider.provider_name}
            >
              <span
                className={cn(
                  'block w-12 h-12 rounded-control bg-border-card overflow-hidden',
                  isMine && 'ring-2 ring-accent ring-offset-2 ring-offset-bg-card',
                )}
              >
                <img
                  src={`${TMDB_LOGO_URL}${provider.logo_path}`}
                  alt={isMine ? `${provider.provider_name} (la pagás)` : provider.provider_name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </span>
              {isMine && (
                <span aria-hidden="true" className="text-[10px] font-medium text-accent">
                  La pagás
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TitleDetailModal({ id, mediaType, media, isOpen, onClose }: Props) {
  const [detail, setDetail] = useState<TMDbDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const preferredRegion = usePreferences((state) => state.region);
  const { addMedia, applyEnrichment, updateStatus } = useMediaActions();
  const { showToast } = useToast();
  /**
   * Lo que se acaba de guardar desde acá, hasta que el store lo devuelva.
   *
   * Sin esto, dos clics seguidos —"Por Ver" y después una lista propia— entran
   * los dos por la rama de "todavía no está guardado" y el segundo pisa al
   * primero.
   */
  const [justSaved, setJustSaved] = useState<SavedMedia | null>(null);
  /** Estado que se está guardando, para el spinner del botón que lo pidió. */
  const [savingStatus, setSavingStatus] = useState<MediaStatus | null>(null);
  /** La reseña que se pide al marcar algo como completado. */
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const titleId = useId();
  // Un backfill por apertura: sin esto, el patch cambia `media`, el efecto se
  // vuelve a disparar y se escribe en loop.
  const backfilled = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen || !id) {
      setDetail(null);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    getMediaDetail(id, mediaType)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDetail(null);
          setError(
            err instanceof Error
              ? err.message
              : 'No pudimos cargar la información de este título.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, mediaType, isOpen]);

  /**
   * Completa los datos que el título no tenía cacheados, o que envejecieron.
   *
   * Cubre a los que se guardaron antes de que existieran las plataformas y las
   * temporadas, a los que quedaron con el catálogo o el idioma de otro país, y
   * a los que pasaron su fecha de vencimiento. Como la ficha ya se pidió para
   * mostrar el modal, sale gratis: es una escritura, sin llamada extra a TMDB,
   * y no mueve el título de lugar en la lista.
   */
  useEffect(() => {
    if (!detail || !media) return;
    if (backfilled.current === media.tmdbId) return;
    if (!isStale(media, preferredRegion)) return;

    backfilled.current = media.tmdbId;
    applyEnrichment(media, enrichFromDetail(detail, preferredRegion));
    // `applyEnrichment` cambia de identidad en cada render del hook, así que
    // queda afuera: lo que dispara este efecto es que llegue la ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, media, preferredRegion]);

  useEffect(() => {
    if (!isOpen) backfilled.current = null;
  }, [isOpen]);

  // El guardado local vale mientras el modal muestre ese título: al cerrarlo o
  // al cambiar de id, lo que corresponde es lo que diga el store.
  useEffect(() => {
    setJustSaved(null);
    setIsReviewOpen(false);
  }, [id, isOpen]);

  const trailer = detail?.videos?.results?.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube',
  );
  const cast = detail?.credits?.cast?.slice(0, 5) ?? [];

  const picked = pickProviders(detail, preferredRegion);
  const allProviders = picked?.providers ?? [];
  const subscriptions = useMediaStore((state) => state.subscriptions);
  const subscribed = subscribedNames(subscriptions);

  // El store manda; `justSaved` solo cubre el instante entre guardar y que el
  // título vuelva desde ahí.
  const saved = media ?? justSaved;
  const news = saved?.mediaType === 'tv' ? newEpisodesSummary(saved) : null;

  const title = detail?.title || detail?.name || saved?.title || '';
  // Las cacheadas ganan: reflejan lo que la persona vio cuando marcó episodios.
  const seasons = saved?.seasons?.length
    ? saved.seasons
    : seasonsFromDetail(detail);

  /**
   * Guarda el título en la biblioteca con lo que ya trajo la ficha.
   *
   * Va enriquecido de entrada —plataformas, temporadas, duración— porque la
   * ficha ya está en pantalla: sin eso el título entraría pelado y habría que
   * esperar a que alguien lo vuelva a abrir para completarlo.
   */
  const saveToLibrary = async (status: MediaStatus, collections?: string[]) => {
    if (!detail || saved) return;

    const draft: SavedMedia = {
      tmdbId: id,
      mediaType,
      title,
      posterPath: detail.poster_path,
      backdropPath: detail.backdrop_path,
      releaseYear: (detail.release_date || detail.first_air_date || '').split(
        '-',
      )[0],
      genres: canonicalGenreNames(detail.genres),
      status,
      ...(collections?.length ? { collections } : {}),
      ...enrichFromDetail(detail, preferredRegion),
      updatedAt: new Date().toISOString(),
    };

    setJustSaved(draft);
    await addMedia(draft);
  };

  const handleQuickAdd = async (status: MediaStatus, listName: string) => {
    if (savingStatus) return;

    setSavingStatus(status);
    try {
      await saveToLibrary(status);
    } finally {
      setSavingStatus(null);
    }

    /**
     * Completar algo es tener algo para decir al respecto, así que la reseña
     * se ofrece sola en vez de esperar a que alguien vuelva a buscar el título
     * en su biblioteca.
     *
     * Es opcional: el título ya quedó en Completadas, y cerrar el drawer lo
     * deja ahí sin puntaje. Por eso tampoco va el aviso de siempre — lo que
     * anuncia el guardado es el drawer, que se abre encima con el título.
     */
    if (status === 'completada') {
      setIsReviewOpen(true);
      return;
    }

    showToast(`"${title}" se agregó a ${listName}.`);
  };

  /** Guarda el título dentro de una lista propia, en un solo paso. */
  const handleSaveInto = async (collectionId: string) => {
    await saveToLibrary('por_ver', [collectionId]);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      label={title || 'Detalle del título'}
      labelledBy={title ? titleId : undefined}
      className="z-[60] flex items-center justify-center p-4 sm:p-6 bg-overlay backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-2xl bg-bg-card border border-border-card rounded-3xl shadow-pop overflow-hidden flex flex-col my-auto max-h-[90vh]"
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 p-2 bg-bg-main/60 backdrop-blur-md rounded-full text-text-main hover:bg-bg-main transition-colors"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {error && !saved ? (
          // Sin el título en la biblioteca no queda nada para mostrar salvo el
          // error. Si está guardado, el modal sigue en pie: el progreso, el
          // historial y las listas son datos propios y no dependen de TMDB.
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertCircle className="text-accent" size={32} aria-hidden="true" />
            <p role="alert" className="text-text-muted text-sm max-w-xs">
              {error}
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-control border border-border-card text-sm hover:bg-border-card transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="relative aspect-video w-full bg-border-card shrink-0">
              {loading && (
                <div className="absolute inset-0 animate-pulse bg-border-card" />
              )}
              {/* Sin la ficha de TMDB queda el póster que el título ya tenía
                  guardado: peor encuadre que un backdrop, pero mejor que un
                  rectángulo gris. */}
              {(detail?.backdrop_path ??
                detail?.poster_path ??
                saved?.backdropPath ??
                saved?.posterPath) && (
                <img
                  src={`${TMDB_IMAGE_ORIGINAL_URL}${
                    detail?.backdrop_path ??
                    detail?.poster_path ??
                    saved?.backdropPath ??
                    saved?.posterPath
                  }`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              {/* El degradado va siempre a negro y el texto siempre en blanco:
                  van sobre una imagen, no sobre el fondo del tema. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

              {title && (
                <div className="absolute bottom-6 left-6 right-6">
                  <h2
                    id={titleId}
                    className="text-display text-white drop-shadow-lg line-clamp-2"
                  >
                    {title}
                  </h2>
                  <div className="flex flex-wrap gap-2 text-sm text-white/80 mt-2">
                    <span>
                      {(detail?.release_date || detail?.first_air_date || '').split(
                        '-',
                      )[0] || saved?.releaseYear}
                    </span>
                    {(detail?.genres?.map((g) => g.name) ?? saved?.genres ?? [])
                      .slice(0, 3)
                      .map((name) => (
                        <span key={name}>• {name}</span>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8">
              {(saved || detail) && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-section">Tu biblioteca</h3>
                  {saved ? (
                    <>
                      <p className="text-sm text-text-muted">
                        Ya está en tu biblioteca, en{' '}
                        <strong className="text-text-main">
                          {isArchivedStatus(saved.status)
                            ? 'Archivadas'
                            : STATUS_LABELS[saved.status]}
                        </strong>
                        .
                      </p>
                      {/* El aviso ofrece volver a Viendo, pero no la mueve
                          solo: puede que la persona quiera esperar a que
                          salga la temporada entera. */}
                      {news && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-accent/30 bg-accent/10 px-4 py-3">
                          <p className="text-sm text-text-main">
                            <strong className="text-accent">{news.label}</strong>{' '}
                            {saved.status === 'completada'
                              ? 'desde que la terminaste.'
                              : 'desde la última vez que estabas al día.'}
                          </p>
                          {/* Una en pausa ya ofrece "Retomar" abajo: dos
                              botones que hacen lo mismo se leen como dos
                              cosas distintas. */}
                          {saved.status !== 'viendo' && !isArchivedStatus(saved.status) && (
                            <button
                              type="button"
                              onClick={() => {
                                void updateStatus(saved.tmdbId, 'viendo');
                                showToast(`"${saved.title}" volvió a Viendo.`);
                              }}
                              className="btn btn-primary px-3 py-2 text-sm"
                            >
                              Pasar a Viendo
                            </button>
                          )}
                        </div>
                      )}
                      <StatusActions media={saved} />
                      <NotifyToggle media={saved} />
                    </>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {QUICK_ADD.map(({ status, listName }) => (
                        <li key={status}>
                          <button
                            type="button"
                            onClick={() => handleQuickAdd(status, listName)}
                            disabled={savingStatus !== null}
                            aria-label={`Guardar "${title}" en ${STATUS_LABELS[status]}`}
                            className="btn btn-secondary px-4 py-2.5 text-sm"
                          >
                            {savingStatus === status ? (
                              <Loader2
                                size={16}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                            ) : status === 'completada' ? (
                              <Check size={16} aria-hidden="true" />
                            ) : (
                              <Plus size={16} aria-hidden="true" />
                            )}
                            {STATUS_LABELS[status]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {saved && mediaType === 'tv' && (
                <SeriesProgress media={saved} seasons={seasons} />
              )}

              {saved && <WatchHistory media={saved} />}

              {(saved || detail) && (
                <CollectionPicker
                  title={title}
                  media={saved ?? undefined}
                  onSaveInto={handleSaveInto}
                />
              )}

              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-text-muted bg-accent/10 border border-accent/20 rounded-control p-3"
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-accent" aria-hidden="true" />
                  {error} Lo que ya tenías guardado se sigue viendo.
                </p>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
                  <Loader2 className="animate-spin" size={20} aria-hidden="true" />
                  <span className="text-sm">Cargando detalles...</span>
                </div>
              ) : (
                <>
                  {trailer && (
                    <a
                      href={`https://www.youtube.com/watch?v=${trailer.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary w-full py-4 shrink-0"
                    >
                      <Play size={20} className="fill-current" aria-hidden="true" />
                      Ver Tráiler
                      <span className="sr-only">(se abre en YouTube)</span>
                    </a>
                  )}

                  {title && (
                    <ShareButton
                      className="self-start"
                      title={title}
                      text={`Estoy mirando ${title} en Qué Miro?`}
                      card={{
                        eyebrow: saved?.history?.length
                          ? 'La vi'
                          : 'Anotada para ver',
                        headline: title,
                        subline: [
                          detail?.release_date?.split('-')[0] ??
                            detail?.first_air_date?.split('-')[0] ??
                            saved?.releaseYear,
                          detail?.genres?.[0]?.name ?? saved?.genres[0],
                        ]
                          .filter(Boolean)
                          .join(' · '),
                        stats: saved?.history?.[0]
                          ? [
                              {
                                value: String(saved.history[0].rating),
                                label: 'de 5 estrellas',
                              },
                            ]
                          : undefined,
                      }}
                    />
                  )}

                  {detail?.overview && (
                    <div>
                      <h3 className="text-lg font-bold mb-2">Sinopsis</h3>
                      <p className="text-text-muted text-sm leading-relaxed">
                        {detail.overview}
                      </p>
                    </div>
                  )}

                  {cast.length > 0 && (
                    <ScrollRail
                      label="Reparto Principal"
                      fadeFrom="card"
                      header={<h3 className="text-lg font-bold">Reparto Principal</h3>}
                    >
                      {cast.map((c) => (
                        <li key={c.id} className="rail-item w-20 shrink-0">
                          {/* Un enlace de verdad y no un botón: la página de la
                              persona tiene su dirección, así que "atrás" vuelve
                              adonde estabas y se puede abrir en otra pestaña.
                              La ficha se cierra al salir: queda atrás, no
                              encima de la página nueva. */}
                          <Link
                            to={`/persona/${c.id}`}
                            onClick={onClose}
                            className="group flex flex-col gap-2 rounded-control"
                          >
                            <span className="w-20 h-20 rounded-full bg-border-card overflow-hidden shrink-0 shadow-card ring-2 ring-transparent group-hover:ring-accent transition-[box-shadow]">
                              {c.profile_path && (
                                <img
                                  src={`${TMDB_IMAGE_BASE_URL}${c.profile_path}`}
                                  alt=""
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </span>
                            <span className="text-xs text-center font-medium leading-tight truncate group-hover:text-accent">
                              {c.name}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ScrollRail>
                  )}

                  {allProviders.length > 0 && picked && (
                    <div>
                      <h3 className="text-lg font-bold mb-1">
                        Dónde Ver en {getRegionName(picked.region)}
                      </h3>
                      {picked.region !== preferredRegion && (
                        <p className="text-xs text-text-subtle mb-3">
                          No hay datos para {getRegionName(preferredRegion)}. Podés
                          cambiar el país en tu perfil.
                        </p>
                      )}
                      {/* Incluido primero y aparte: "está en Prime Video" podía
                          ser incluido o alquiler, y para decidir qué ver esta
                          noche son dos respuestas opuestas. */}
                      <div className="flex flex-col gap-4 mt-3">
                        <ProviderGroup
                          label="Incluido en"
                          providers={picked.included}
                          subscribed={subscribed}
                        />
                        <ProviderGroup
                          label="Alquiler o compra"
                          providers={picked.rentOrBuy}
                          subscribed={subscribed}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-3">
                        {/* La API da nombres y logos, pero los enlaces a cada
                            plataforma viven en la página de TMDB. */}
                        {picked.link && (
                          <a
                            href={picked.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-4"
                          >
                            Ver dónde verlo
                            <ExternalLink size={14} aria-hidden="true" />
                            <span className="sr-only">(se abre en TMDB)</span>
                          </a>
                        )}
                        <JustWatchCredit />
                      </div>
                    </div>
                  )}

                  {allProviders.length === 0 && detail && (
                    <p className="text-sm text-text-subtle">
                      No encontramos plataformas para este título en{' '}
                      {getRegionName(preferredRegion)}.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* El drawer se monta acá adentro pero se dibuja aparte —tiene su propio
          portal— así que queda encima de la ficha sin quedarse con su foco. */}
      {isReviewOpen && saved && (
        <ReviewDrawer
          media={saved}
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      )}
    </Dialog>
  );
}
