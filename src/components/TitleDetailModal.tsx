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
import { X, Play, AlertCircle, ExternalLink, Loader2, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { Dialog } from '@/components/ui/Dialog';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { SeriesProgress } from '@/components/SeriesProgress';
import { TitleGallery } from '@/components/TitleGallery';
import { TitleActions } from '@/components/TitleActions';
import { WatchHistory } from '@/components/WatchHistory';
import { SocialOnTitle } from '@/components/social/SocialOnTitle';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { JustWatchCredit } from '@/components/Attribution';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { enrichFromDetail, isStale } from '@/lib/enrich';
import { ProviderLogo, pickProviders } from '@/lib/providers';
import { paysFor, subscribedNames } from '@/lib/subscriptions';
import { newEpisodesSummary } from '@/lib/progress';
import { formatTmdbScore } from '@/lib/tmdbScore';
import { isArchivedStatus } from '@/lib/archive';
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
              className="flex flex-col items-center gap-1 w-12"
              title={provider.provider_name}
            >
              <span
                className={cn(
                  'block w-10 h-10 rounded-control bg-border-card overflow-hidden',
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
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  /** Si la imagen ya salió de pantalla: ahí aparece la barra con el nombre. */
  const [isPastHero, setIsPastHero] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
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
    setIsOverviewExpanded(false);
    setIsPastHero(false);
  }, [id, isOpen]);

  const showsContent = !(error && !media && !justSaved);

  /**
   * Cuando la imagen sale de pantalla aparece una barra fina con el nombre.
   *
   * La X flota arriba a la derecha y, sin la barra, al scrollear quedaba
   * encima del contenido —tapaba el contador de episodios y "Marcar toda"—.
   * Con la barra, lo que pasa por debajo de la X es la barra.
   */
  useEffect(() => {
    const root = scrollRef.current;
    const hero = heroRef.current;
    if (!root || !hero || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsPastHero(!entry.isIntersecting),
      { root, rootMargin: '-64px 0px 0px 0px' },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [isOpen, showsContent]);

  const trailer = detail?.videos?.results?.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube',
  );
  const credits = detail?.credits?.cast?.slice(0, 5) ?? [];

  const picked = pickProviders(detail, preferredRegion);
  const allProviders = picked?.providers ?? [];
  const subscriptions = useMediaStore((state) => state.subscriptions);
  const subscribed = subscribedNames(subscriptions);

  // El store manda; `justSaved` solo cubre el instante entre guardar y que el
  // título vuelva desde ahí.
  const saved = media ?? justSaved;
  const news = saved?.mediaType === 'tv' ? newEpisodesSummary(saved) : null;

  const title = detail?.title || detail?.name || saved?.title || '';
  const score = formatTmdbScore(detail?.vote_average, detail?.vote_count);
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
    // Si quedó esperando al login, la ficha no puede mostrarlo como guardado.
    if ((await addMedia(draft)) === 'pending') setJustSaved(null);
  };

  /**
   * Los atajos de la línea de la sinopsis.
   *
   * Si ya está en la biblioteca solo cambia de estado, como en el buscador:
   * volver a agregarlo lo escribiría de cero y se llevaría puestos la reseña,
   * el historial y el progreso de temporadas que tuviera.
   */
  const handleQuickAdd = async (status: MediaStatus) => {
    if (savingStatus) return;

    setSavingStatus(status);
    try {
      if (saved) {
        await updateStatus(saved.tmdbId, status);
      } else {
        await saveToLibrary(status);
      }
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

    showToast(`"${title}" se agregó a Por Ver.`);
  };

  /** Guarda el título dentro de una lista propia, en un solo paso. */
  const handleSaveInto = async (collectionId: string) => {
    await saveToLibrary('por_ver', [collectionId]);
  };

  /**
   * Una serie que estás siguiendo abre por el progreso: casi siempre se abre
   * su ficha para marcar el episodio de anoche, y antes había que pasar por la
   * sinopsis, el reparto y el tráiler para llegar. Lo demás arranca como
   * siempre, por lo que cuenta de qué va.
   */
  const isFollowing =
    saved?.mediaType === 'tv' && (saved.status === 'viendo' || saved.status === 'en_pausa');
  const year =
    (detail?.release_date || detail?.first_air_date || '').split('-')[0] || saved?.releaseYear;
  /** Las sinopsis cortas entran enteras en cuatro renglones. */
  const isLongOverview = (detail?.overview?.length ?? 0) > 280;

  const progress = saved && mediaType === 'tv' && (
    <SeriesProgress media={saved} seasons={seasons} />
  );


  const whereToWatch = allProviders.length > 0 && picked && (
    <section className="flex flex-col gap-3">
      <h3 className="text-section">Dónde ver en {getRegionName(picked.region)}</h3>
      {picked.region !== preferredRegion && (
        <p className="text-xs text-text-subtle -mt-2">
          No hay datos para {getRegionName(preferredRegion)}. Podés cambiar el país en
          tu perfil.
        </p>
      )}
      {/* Incluido primero y aparte: "está en Prime Video" podía ser incluido
          o alquiler, y para decidir qué ver esta noche son dos respuestas
          opuestas. */}
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <ProviderGroup label="Incluido en" providers={picked.included} subscribed={subscribed} />
        <ProviderGroup
          label="Alquiler o compra"
          providers={picked.rentOrBuy}
          subscribed={subscribed}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* La API da nombres y logos, pero los enlaces a cada plataforma
            viven en la página de TMDB. */}
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
    </section>
  );

  const synopsis = detail?.overview && (
    <section className="flex flex-col gap-2">
      <h3 className="text-section">Sinopsis</h3>
      <p
        className={cn(
          'text-text-muted text-sm leading-relaxed',
          isLongOverview && !isOverviewExpanded && 'line-clamp-4',
        )}
      >
        {detail.overview}
      </p>
      {isLongOverview && (
        <button
          type="button"
          aria-expanded={isOverviewExpanded}
          onClick={() => setIsOverviewExpanded((open) => !open)}
          className="self-start text-sm text-text-muted underline underline-offset-4 hover:text-text-main"
        >
          {isOverviewExpanded ? 'Leer menos' : 'Leer más'}
        </button>
      )}
    </section>
  );

  const cast = credits.length > 0 && (
    <ScrollRail
      label="Reparto"
      fadeFrom="card"
      header={<h3 className="text-section">Reparto</h3>}
    >
      {credits.map((c) => (
        <li key={c.id} className="rail-item w-20 shrink-0">
          {/* Un enlace de verdad y no un botón: la página de la persona tiene
              su dirección, así que "atrás" vuelve adonde estabas y se puede
              abrir en otra pestaña. La ficha se cierra al salir: queda atrás,
              no encima de la página nueva. */}
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
  );

  // Al final en los dos órdenes: es un extra para mirar, y no tiene que
  // empujar hacia abajo dónde verla ni la sinopsis.
  const gallery = detail && (
    <TitleGallery
      id={id}
      mediaType={mediaType}
      title={title}
      heroPath={detail.backdrop_path}
    />
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      label={title || 'Detalle del título'}
      labelledBy={title ? titleId : undefined}
      className="z-[60] flex md:items-center md:justify-center md:p-6 bg-overlay backdrop-blur-md"
    >
      {/* En el teléfono la ficha ocupa toda la pantalla: como tarjeta flotante
          los márgenes se comían el ancho que necesitan los episodios y el alto
          que necesita la lista. Desde `md` sobra lugar a los costados y vuelve
          a ser una columna centrada, pero de alto completo. */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative w-full h-[100dvh] md:h-[calc(100dvh-3rem)] md:max-w-2xl bg-bg-card md:border md:border-border-card md:rounded-3xl md:shadow-pop overflow-hidden flex flex-col"
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-4 z-20 p-2 bg-bg-main/60 backdrop-blur-md rounded-full text-text-main hover:bg-bg-main transition-colors"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {!showsContent ? (
          // Sin el título en la biblioteca no queda nada para mostrar salvo el
          // error. Si está guardado, el modal sigue en pie: el progreso, el
          // historial y las listas son datos propios y no dependen de TMDB.
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
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
          // Scrollea todo junto, imagen incluida: fija, la imagen se quedaba
          // con un cuarto de la pantalla mientras se marcan episodios.
          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
            <div
              aria-hidden="true"
              className={cn(
                'sticky top-0 z-10 h-16 -mb-16 flex items-center pl-6 pr-16',
                'bg-bg-card border-b border-border-card transition-opacity duration-150',
                isPastHero ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <p className="font-serif italic font-bold text-xl truncate">{title}</p>
            </div>

            <div ref={heroRef} className="relative aspect-video w-full bg-border-card">
              {loading && <div className="absolute inset-0 animate-pulse bg-border-card" />}
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
                <div className="absolute bottom-5 left-6 right-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      id={titleId}
                      className="text-display text-white drop-shadow-lg line-clamp-2"
                    >
                      {title}
                    </h2>
                    {/* Alineado con la primera línea del título: si el nombre
                        ocupa dos, el puntaje no baja a buscar el medio. */}
                    {score && (
                      <span
                        className="inline-flex items-center gap-1 shrink-0 mt-1 sm:mt-1.5 rounded-full bg-black/50 backdrop-blur-md px-2.5 py-1 text-sm font-bold text-white"
                        title="Puntaje en TMDB"
                      >
                        <Star size={14} className="fill-current" aria-hidden="true" />
                        <span aria-hidden="true">{score}</span>
                        <span className="sr-only">Puntaje en TMDB: {score} de 10</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3 mt-2">
                    <p className="flex flex-wrap gap-x-2 text-sm text-white/80">
                      <span>{year}</span>
                      {(detail?.genres?.map((g) => g.name) ?? saved?.genres ?? [])
                        .slice(0, 3)
                        .map((name) => (
                          <span key={name}>• {name}</span>
                        ))}
                    </p>
                    {/* Chico y sobre la imagen: era el botón más grande y el
                        único rojo de la ficha, y es lo que menos se usa en
                        una serie que ya estás viendo. */}
                    {trailer && (
                      <a
                        href={`https://www.youtube.com/watch?v=${trailer.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-black/50 backdrop-blur-md px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/70 transition-colors"
                      >
                        <Play size={14} className="fill-current" aria-hidden="true" />
                        Tráiler
                        <span className="sr-only">(se abre en YouTube)</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 flex flex-col gap-8">
              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-text-muted bg-accent/10 border border-accent/20 rounded-control p-3"
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-accent" aria-hidden="true" />
                  {error} Lo que ya tenías guardado se sigue viendo.
                </p>
              )}

              {(detail || saved) && (
                <TitleActions
                  title={title}
                  saved={saved}
                  savingStatus={savingStatus}
                  onQuickSave={handleQuickAdd}
                  onSaveInto={handleSaveInto}
                  share={{
                    text: `Estoy mirando ${title} en Qué Miro?`,
                    card: {
                      eyebrow: saved?.history?.length ? 'La vi' : 'Anotada para ver',
                      headline: title,
                      subline: [year, detail?.genres?.[0]?.name ?? saved?.genres[0]]
                        .filter(Boolean)
                        .join(' · '),
                      stats: saved?.history?.[0]
                        ? [{ value: String(saved.history[0].rating), label: 'de 5 estrellas' }]
                        : undefined,
                    },
                  }}
                />
              )}

              {/* El aviso ofrece volver a Viendo, pero no la mueve solo: puede
                  que la persona quiera esperar a que salga la temporada
                  entera. */}
              {saved && news && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-accent/30 bg-accent/10 px-4 py-3">
                  <p className="text-sm text-text-main">
                    <strong className="text-accent">{news.label}</strong>{' '}
                    {saved.status === 'completada'
                      ? 'desde que la terminaste.'
                      : 'desde la última vez que estabas al día.'}
                  </p>
                  {/* Una en pausa ya ofrece "Retomar" en su píldora: dos
                      botones que hacen lo mismo se leen como dos cosas
                      distintas. */}
                  {saved.status !== 'viendo' && !isArchivedStatus(saved.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        // Retomarla por lo nuevo no corrige nada: la reseña de lo que
                        // ya viste se queda.
                        void updateStatus(saved.tmdbId, 'viendo', { keepReview: true });
                        showToast(`"${saved.title}" volvió a Viendo.`);
                      }}
                      className="btn btn-primary px-3 py-2 text-sm"
                    >
                      Pasar a Viendo
                    </button>
                  )}
                </div>
              )}

              {isFollowing && progress}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
                  <Loader2 className="animate-spin" size={20} aria-hidden="true" />
                  <span className="text-sm">Cargando detalles...</span>
                </div>
              ) : isFollowing ? (
                <>
                  {whereToWatch}
                  {synopsis}
                  {cast}
                  {gallery}
                </>
              ) : (
                <>
                  {synopsis}
                  {whereToWatch}
                  {cast}
                  {gallery}
                </>
              )}

              {!isFollowing && progress}

              {saved && <WatchHistory media={saved} />}

              {title && (
                <SocialOnTitle
                  title={{
                    tmdbId: id,
                    mediaType,
                    title,
                    posterPath: saved?.posterPath ?? detail?.poster_path ?? null,
                    releaseYear: saved?.releaseYear ?? year ?? '',
                  }}
                  saved={saved}
                />
              )}
            </div>
          </div>
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
