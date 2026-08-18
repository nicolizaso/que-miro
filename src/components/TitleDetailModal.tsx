import React, { useEffect, useState } from 'react';
import {
  getMediaDetail,
  TMDB_IMAGE_BASE_URL,
  TMDB_IMAGE_ORIGINAL_URL,
} from '@/lib/tmdb';
import { TMDbDetail } from '@/types';
import { X, Play, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  isOpen: boolean;
  onClose: () => void;
}

/** Región preferida para las plataformas de streaming, con fallback. */
const PROVIDER_REGIONS = ['AR', 'ES', 'US'];

export function TitleDetailModal({ id, mediaType, isOpen, onClose }: Props) {
  const [detail, setDetail] = useState<TMDbDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trailer = detail?.videos?.results?.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube',
  );
  const cast = detail?.credits?.cast?.slice(0, 5) ?? [];

  const providerResults = detail?.['watch/providers']?.results;
  const providers = providerResults
    ? PROVIDER_REGIONS.map((region) => providerResults[region]).find(Boolean)
    : undefined;

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-bg-main/90 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Detalle del título'}
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
          className="absolute top-4 right-4 z-10 p-2 bg-bg-main/50 backdrop-blur-md rounded-full text-white hover:bg-bg-main transition-colors"
        >
          <X size={20} />
        </button>

        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertCircle className="text-accent" size={32} />
            <p className="text-text-main/70 text-sm max-w-xs">{error}</p>
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
              <div className="absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/20 to-transparent" />

              {detail && (
                <div className="absolute bottom-6 left-6 right-6">
                  <h2 className="font-serif italic font-bold text-3xl sm:text-4xl text-white drop-shadow-lg line-clamp-2">
                    {title}
                  </h2>
                  <div className="flex flex-wrap gap-2 text-sm text-white/80 mt-2">
                    <span>
                      {(
                        detail.release_date ||
                        detail.first_air_date ||
                        ''
                      ).split('-')[0]}
                    </span>
                    {detail.genres?.slice(0, 3).map((g) => (
                      <span key={g.id}>• {g.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-text-main/50">
                  <Loader2 className="animate-spin" size={20} />
                  <span className="text-sm">Cargando detalles...</span>
                </div>
              ) : (
                <>
                  {trailer && (
                    <a
                      href={`https://www.youtube.com/watch?v=${trailer.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-4 bg-accent text-white rounded-xl font-medium hover:bg-accent/90 transition-colors shrink-0"
                    >
                      <Play size={20} className="fill-white" />
                      Ver Tráiler
                    </a>
                  )}

                  {detail?.overview && (
                    <div>
                      <h3 className="text-lg font-bold mb-2">Sinopsis</h3>
                      <p className="text-text-main/70 text-sm leading-relaxed">
                        {detail.overview}
                      </p>
                    </div>
                  )}

                  {cast.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold mb-3">
                        Reparto Principal
                      </h3>
                      <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                        {cast.map((c) => (
                          <div
                            key={c.id}
                            className="flex flex-col gap-2 w-20 shrink-0"
                          >
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {allProviders.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold mb-3">Dónde Ver</h3>
                      <div className="flex gap-3">
                        {allProviders.map((p) => (
                          <div
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
