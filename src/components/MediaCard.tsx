import React, { useState } from 'react';
import { useMediaActions } from '@/hooks/useMediaActions';
import { SavedMedia, MediaStatus } from '@/types';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { Check, Tv, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewDrawer } from './ReviewDrawer';
import { TitleDetailModal } from './TitleDetailModal';

export function MediaCard({ media, onClick }: { media: SavedMedia; onClick?: () => void }) {
  const { updateStatus } = useMediaActions();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const statusColors = {
    por_ver: 'text-status-por-ver bg-status-por-ver/10 border-status-por-ver/20',
    viendo: 'text-status-viendo bg-status-viendo/10 border-status-viendo/20',
    completada: 'text-status-completada bg-status-completada/10 border-status-completada/20'
  };

  const statusLabels = {
    por_ver: 'Por Ver',
    viendo: 'Viendo',
    completada: 'Completada'
  };

  const handleStatusChange = (e: React.MouseEvent, newStatus: MediaStatus) => {
    e.stopPropagation();
    if (newStatus === 'completada' && media.status !== 'completada') {
      setIsReviewOpen(true);
    } else {
      updateStatus(media.tmdbId, newStatus);
    }
  };

  const handleClick = () => {
    setIsDetailOpen(true);
    if (onClick) onClick();
  };

  return (
    <>
      <div 
        onClick={handleClick}
        className="group relative bg-bg-card border border-border-card rounded-2xl overflow-hidden cursor-pointer hover:border-gray-500 transition-colors flex flex-col h-full"
      >
        <div className="relative aspect-[2/3] w-full bg-border-card overflow-hidden">
          {media.posterPath ? (
            <img src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`} alt={media.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              {media.mediaType === 'movie' ? <Film size={48} /> : <Tv size={48} />}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-card to-transparent" />
          
          <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1">
            <h3 className="font-serif italic font-bold text-lg leading-tight line-clamp-2">{media.title}</h3>
            <div className="flex flex-wrap gap-2 text-xs text-gray-300">
              <span>{media.releaseYear}</span>
              {media.genres.length > 0 && (
                <>
                  <span>•</span>
                  <span className="truncate">{media.genres[0]}</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="p-3 flex items-center justify-between gap-2 border-t border-border-card mt-auto shrink-0">
          <span className={cn("text-[10px] sm:text-xs px-2 py-1 rounded-md border truncate", statusColors[media.status])}>
            {statusLabels[media.status]}
          </span>
          
          <div className="flex items-center gap-1 shrink-0">
            {media.status !== 'viendo' && media.status !== 'completada' && (
              <button 
                onClick={(e) => handleStatusChange(e, 'viendo')}
                className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-gray-400"
                title="Mover a Viendo"
              >
                <Tv size={16} />
              </button>
            )}
            {media.status !== 'completada' && (
              <button 
                onClick={(e) => handleStatusChange(e, 'completada')}
                className="w-10 h-10 rounded-xl bg-bg-main border border-border-card flex items-center justify-center hover:bg-border-card text-status-completada"
                title="Marcar Completada"
              >
                <Check size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <ReviewDrawer 
        media={media} 
        isOpen={isReviewOpen} 
        onClose={() => setIsReviewOpen(false)} 
      />
      
      <TitleDetailModal
        id={media.tmdbId}
        mediaType={media.mediaType}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
    </>
  );
}
