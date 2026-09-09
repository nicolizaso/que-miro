import { useEffect, useId, useRef, useState } from 'react';
import {
  getMediaDetail,
  TMDB_IMAGE_BASE_URL,
  TMDB_IMAGE_ORIGINAL_URL,
} from '@/lib/tmdb';
import { SavedMedia, SeasonInfo, TMDbDetail } from '@/types';
import { X, Play, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Dialog } from '@/components/ui/Dialog';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { SeriesProgress } from '@/components/SeriesProgress';
import { CollectionPicker } from '@/components/CollectionPicker';
import { WatchHistory } from '@/components/WatchHistory';
import { ShareButton } from '@/components/ShareButton';
import { useMediaActions } from '@/hooks/useMediaActions';
import { enrichFromDetail, isStale } from '@/lib/enrich';
import { pickProviders } from '@/lib/providers';
import { getRegionName, usePreferences } from '@/preferences';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  /** El título guardado, si está en la biblioteca. Habilita progreso y listas. */
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

export function TitleDetailModal({ id, mediaType, media, isOpen, onClose }: Props) {
  const [detail, setDetail] = useState<TMDbDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const preferredRegion = usePreferences((state) => state.region);
  const { patchMedia } = useMediaActions();
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
   * Completa los datos que el título no tenía cacheados.
   *
   * Cubre a los que se guardaron antes de que existieran las plataformas y las
   * temporadas, y a los que quedaron con el catálogo de otro país. Como la
   * ficha ya se pidió para mostrar el modal, sale gratis: es una escritura, sin
   * llamada extra a TMDB.
   */
  useEffect(() => {
    if (!detail || !media) return;
    if (backfilled.current === media.tmdbId) return;
    if (!isStale(media, preferredRegion)) return;

    backfilled.current = media.tmdbId;
    void patchMedia(media.tmdbId, enrichFromDetail(detail, preferredRegion));
    // `patchMedia` cambia de identidad en cada render del hook, así que queda
    // afuera: lo que dispara este efecto es que llegue la ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, media, preferredRegion]);

  useEffect(() => {
    if (!isOpen) backfilled.current = null;
  }, [isOpen]);

  const trailer = detail?.videos?.results?.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube',
  );
  const cast = detail?.credits?.cast?.slice(0, 5) ?? [];

  const picked = pickProviders(detail, preferredRegion);
  const allProviders = picked?.providers.slice(0, 4) ?? [];

  const title = detail?.title || detail?.name || media?.title || '';
  // Las cacheadas ganan: reflejan lo que la persona vio cuando marcó episodios.
  const seasons = media?.seasons?.length
    ? media.seasons
    : seasonsFromDetail(detail);

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

        {error && !media ? (
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
                media?.backdropPath ??
                media?.posterPath) && (
                <img
                  src={`${TMDB_IMAGE_ORIGINAL_URL}${
                    detail?.backdrop_path ??
                    detail?.poster_path ??
                    media?.backdropPath ??
                    media?.posterPath
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
                      )[0] || media?.releaseYear}
                    </span>
                    {(detail?.genres?.map((g) => g.name) ?? media?.genres ?? [])
                      .slice(0, 3)
                      .map((name) => (
                        <span key={name}>• {name}</span>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8">
              {media && mediaType === 'tv' && (
                <SeriesProgress media={media} seasons={seasons} />
              )}

              {media && <WatchHistory media={media} />}

              {media && <CollectionPicker media={media} />}

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
                        eyebrow: media?.history?.length
                          ? 'La vi'
                          : 'Anotada para ver',
                        headline: title,
                        subline: [
                          detail?.release_date?.split('-')[0] ??
                            detail?.first_air_date?.split('-')[0] ??
                            media?.releaseYear,
                          detail?.genres?.[0]?.name ?? media?.genres[0],
                        ]
                          .filter(Boolean)
                          .join(' · '),
                        stats: media?.history?.[0]
                          ? [
                              {
                                value: String(media.history[0].rating),
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
                        <li
                          key={c.id}
                          className="rail-item flex flex-col gap-2 w-20 shrink-0"
                        >
                          <div className="w-20 h-20 rounded-full bg-border-card overflow-hidden shrink-0 shadow-card">
                            {c.profile_path && (
                              <img
                                src={`${TMDB_IMAGE_BASE_URL}${c.profile_path}`}
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <span className="text-xs text-center font-medium leading-tight truncate">
                            {c.name}
                          </span>
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
                      <ul className="flex gap-3 mt-3">
                        {allProviders.map((p) => (
                          <li
                            key={p.provider_name}
                            className="w-12 h-12 rounded-control bg-border-card overflow-hidden shrink-0"
                            title={p.provider_name}
                          >
                            <img
                              src={`${TMDB_IMAGE_BASE_URL}${p.logo_path}`}
                              alt={p.provider_name}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          </li>
                        ))}
                      </ul>
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
    </Dialog>
  );
}
