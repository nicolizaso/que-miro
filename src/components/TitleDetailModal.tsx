import React, { useEffect, useState } from 'react';
import { getMediaDetail, TMDB_IMAGE_BASE_URL, TMDB_IMAGE_ORIGINAL_URL } from '@/lib/tmdb';
import { TMDbDetail } from '@/types';
import { X, Play, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  isOpen: boolean;
  onClose: () => void;
}

export function TitleDetailModal({ id, mediaType, isOpen, onClose }: Props) {
  const [detail, setDetail] = useState<TMDbDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && id) {
      setLoading(true);
      getMediaDetail(id, mediaType).then(data => {
        setDetail(data);
        setLoading(false);
      });
    } else {
      setDetail(null);
    }
  }, [id, mediaType, isOpen]);

  if (!isOpen) return null;

  const trailer = detail?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
  const cast = detail?.credits?.cast?.slice(0, 5) || [];
  const providers = detail?.['watch/providers']?.results?.['ES'] || detail?.['watch/providers']?.results?.['US'];
  
  const allProviders = [
    ...(providers?.flatrate || []),
    ...(providers?.rent || []),
    ...(providers?.buy || [])
  ].filter((v, i, a) => a.findIndex(t => (t.provider_name === v.provider_name)) === i).slice(0, 4);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-bg-main/90 backdrop-blur-md overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-2xl bg-bg-card border border-border-card rounded-3xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
        >
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 z-10 p-2 bg-bg-main/50 backdrop-blur-md rounded-full text-white hover:bg-bg-main transition-colors"
          >
            <X size={20} />
          </button>

          <div className="relative aspect-video w-full bg-border-card shrink-0">
            {detail?.backdrop_path ? (
              <img 
                src={`${TMDB_IMAGE_ORIGINAL_URL}${detail.backdrop_path}`} 
                alt={detail.title || detail.name}
                className="w-full h-full object-cover"
              />
            ) : detail?.poster_path ? (
              <img 
                src={`${TMDB_IMAGE_ORIGINAL_URL}${detail.poster_path}`} 
                alt={detail.title || detail.name}
                className="w-full h-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/20 to-transparent" />
            
            <div className="absolute bottom-6 left-6 right-6">
              <h2 className="font-serif italic font-bold text-3xl sm:text-4xl text-white drop-shadow-lg line-clamp-2">
                {detail?.title || detail?.name}
              </h2>
              <div className="flex flex-wrap gap-2 text-sm text-white/80 mt-2">
                <span>{(detail?.release_date || detail?.first_air_date || '').split('-')[0]}</span>
                {detail?.genres?.slice(0,3).map(g => (
                  <span key={g.id}>• {g.name}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-8 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-10 text-accent animate-pulse"><Info /></div>
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
                    <h3 className="text-lg font-bold mb-3">Reparto Principal</h3>
                    <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                      {cast.map(c => (
                        <div key={c.id} className="flex flex-col gap-2 w-20 shrink-0">
                          <div className="w-20 h-20 rounded-full bg-border-card overflow-hidden shrink-0">
                            {c.profile_path && (
                              <img src={`${TMDB_IMAGE_BASE_URL}${c.profile_path}`} alt={c.name} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <span className="text-xs text-center font-medium leading-tight truncate">{c.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {allProviders.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold mb-3">Dónde Ver</h3>
                    <div className="flex gap-3">
                      {allProviders.map(p => (
                        <div key={p.provider_name} className="w-12 h-12 rounded-xl bg-border-card overflow-hidden shrink-0" title={p.provider_name}>
                          <img src={`${TMDB_IMAGE_BASE_URL}${p.logo_path}`} alt={p.provider_name} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
