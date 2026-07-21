import React, { useState } from 'react';
import { SavedMedia } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { Star, StarHalf, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function ReviewDrawer({ media, isOpen, onClose }: { media: SavedMedia; isOpen: boolean; onClose: () => void }) {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState('');
  const { addReview } = useMediaActions();

  if (!isOpen) return null;

  const handleSave = () => {
    if (rating === 0) return;
    addReview(media.tmdbId, {
      rating,
      text: reviewText,
      completedAt: new Date().toISOString()
    });
    onClose();
  };

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const isHalf = (hoverRating || rating) + 0.5 === i;
      const isFull = (hoverRating || rating) >= i;
      
      stars.push(
        <div 
          key={i} 
          className="relative cursor-pointer"
          onMouseLeave={() => setHoverRating(0)}
        >
          <div 
            className="absolute left-0 w-1/2 h-full z-10" 
            onMouseEnter={() => setHoverRating(i - 0.5)}
            onClick={() => setRating(i - 0.5)}
          />
          <div 
            className="absolute right-0 w-1/2 h-full z-10" 
            onMouseEnter={() => setHoverRating(i)}
            onClick={() => setRating(i)}
          />
          {isFull ? (
            <Star className="text-accent fill-accent" size={40} strokeWidth={1} />
          ) : isHalf ? (
            <div className="relative">
              <Star className="text-border-card" size={40} strokeWidth={1} />
              <div className="absolute inset-0 overflow-hidden w-1/2">
                <Star className="text-accent fill-accent" size={40} strokeWidth={1} />
              </div>
            </div>
          ) : (
            <Star className="text-border-card" size={40} strokeWidth={1} />
          )}
        </div>
      );
    }
    return stars;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 bg-bg-main/80 backdrop-blur-sm">
        <motion.div 
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          className="bg-bg-card border border-border-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-serif italic font-bold text-2xl mb-1">Has completado</h2>
              <p className="text-text-main/70">{media.title}</p>
            </div>
            <button onClick={onClose} className="p-2 bg-border-card rounded-full text-text-main/70 hover:text-text-main">
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col items-center gap-4 py-4">
            <span className="text-sm text-text-main/50 font-medium">TU CALIFICACIÓN</span>
            <div className="flex gap-2">
              {renderStars()}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <textarea 
              placeholder="Escribe un comentario breve (opcional)..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              className="w-full h-32 bg-bg-main border border-border-card rounded-xl p-4 text-text-main focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 rounded-xl border border-border-card font-medium text-text-main/70 hover:bg-border-card transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              disabled={rating === 0}
              className="flex-1 py-4 rounded-xl bg-accent text-white font-medium disabled:opacity-50 transition-colors"
            >
              Guardar Reseña
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
