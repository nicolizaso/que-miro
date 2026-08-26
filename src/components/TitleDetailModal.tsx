import { useEffect, useId, useState } from 'react';
import {
  getMediaDetail,
  TMDB_IMAGE_BASE_URL,
  TMDB_IMAGE_ORIGINAL_URL,
} from '@/lib/tmdb';
import { TMDbDetail } from '@/types';
import { X, Play, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Dialog } from '@/components/ui/Dialog';
import { getRegionName, usePreferences } from '@/preferences';

/**
 * Regiones a las que se recurre si la elegida no tiene catálogo para el título.
 *
 * Mostrar plataformas de otro país es peor que no mostrar nada solo si no se
 * aclara: por eso, cuando se usa un fallback, la UI dice de qué país son.
 */
const FALLBACK_REGIONS = ['ES', 'US'];

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  isOpen: boolean;
  onClose: () => void;
}

export function TitleDetailModal({ id, mediaType, isOpen, onClose }: Props) {
  const [detail, setDetail] = useState<TMDbDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const preferredRegion = usePreferences((state) => state.region);
  const titleId = useId();

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

  const trailer = detail?.videos?.results?.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube',
  );
  const cast = detail?.credits?.cast?.slice(0, 5) ?? [];

  const providerResults = detail?.['watch/providers']?.results;
  // Se busca primero la región elegida y recién después los fallbacks, para
  // poder avisar cuál se terminó mostrando.
  const shownRegion = providerResults
    ? [preferredRegion, ...FALLBACK_REGIONS].find(
        (region) => providerResults[region],
      )
    : undefined;
  const providers = shownRegion ? providerResults?.[shownRegion] : undefined;

  // TMDB puede repetir la misma plataforma en flatrate/rent/buy: se deduplica.
  const allProviders = [
    ...(providers?.flatrate ?? []),
    ...(providers?.rent ?? []),
    ...(providers?.buy ?? []),
  ]
    .filter(
      (provider, index, list) =>
        list.findIndex((p) => p.provider_name === provider.provider_name) ===
        index,
    )
    .slice(0, 4);

  const title = detail?.title || detail?.name || '';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      label={title || 'Detalle del título'}
      labelledBy={detail ? titleId : undefined}
      className="z-[60] flex items-center justify-center p-4 sm:p-6 bg-overlay backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-2xl bg-bg-card border border-border-card rounded-3xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 p-2 bg-bg-main/60 backdrop-blur-md rounded-full text-text-main hover:bg-bg-main transition-colors"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertCircle className="text-accent" size={32} aria-hidden="true" />
            <p role="alert" className="text-text-muted text-sm max-w-xs">
              {error}
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-xl border border-border-card text-sm hover:bg-border-card transition-colors"
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
              {(detail?.backdrop_path || detail?.poster_path) && (
                <img
                  src={`${TMDB_IMAGE_ORIGINAL_URL}${
                    detail.backdrop_path ?? detail.poster_path
                  }`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              {/* El degradado va siempre a negro y el texto siempre en blanco:
                  van sobre una imagen, no sobre el fondo del tema. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

              {detail && (
                <div className="absolute bottom-6 left-6 right-6">
                  <h2
                    id={titleId}
                    className="font-serif italic font-bold text-3xl sm:text-4xl text-white drop-shadow-lg line-clamp-2"
                  >
                    {title}
                  </h2>
                  <div className="flex flex-wrap gap-2 text-sm text-white/80 mt-2">
                    <span>
                      {(detail.release_date || detail.first_air_date || '').split(
                        '-',
                      )[0]}
                    </span>
                    {detail.genres?.slice(0, 3).map((g) => (
                      <span key={g.id}>• {g.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8">
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
                      className="flex items-center justify-center gap-2 w-full py-4 bg-accent text-accent-contrast rounded-xl font-medium hover:opacity-90 transition-opacity shrink-0"
                    >
                      <Play size={20} className="fill-current" aria-hidden="true" />
                      Ver Tráiler
                      <span className="sr-only">(se abre en YouTube)</span>
                    </a>
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
                    <div>
                      <h3 className="text-lg font-bold mb-3">Reparto Principal</h3>
                      <ul className="flex gap-4 overflow-x-auto pb-2">
                        {cast.map((c) => (
                          <li key={c.id} className="flex flex-col gap-2 w-20 shrink-0">
                            <div className="w-20 h-20 rounded-full bg-border-card overflow-hidden shrink-0">
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
                      </ul>
                    </div>
                  )}

                  {allProviders.length > 0 && shownRegion && (
                    <div>
                      <h3 className="text-lg font-bold mb-1">
                        Dónde Ver en {getRegionName(shownRegion)}
                      </h3>
                      {shownRegion !== preferredRegion && (
                        <p className="text-xs text-text-subtle mb-3">
                          No hay datos para {getRegionName(preferredRegion)}. Podés
                          cambiar el país en tu perfil.
                        </p>
                      )}
                      <ul className="flex gap-3 mt-3">
                        {allProviders.map((p) => (
                          <li
                            key={p.provider_name}
                            className="w-12 h-12 rounded-xl bg-border-card overflow-hidden shrink-0"
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

                  {!loading && allProviders.length === 0 && detail && (
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
