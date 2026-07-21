import React from 'react';
import { useMediaStore } from '@/store';
import { Star } from 'lucide-react';

export function ProfileView() {
  const { mediaList } = useMediaStore();
  
  const completedList = mediaList
    .filter(m => m.status === 'completada' && m.review)
    .sort((a, b) => new Date(b.review!.completedAt).getTime() - new Date(a.review!.completedAt).getTime());

  const totalWatched = completedList.length;
  const avgRating = totalWatched > 0 
    ? (completedList.reduce((acc, curr) => acc + (curr.review?.rating || 0), 0) / totalWatched).toFixed(1)
    : '0.0';

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl mx-auto px-4 pt-10 pb-24">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-serif italic font-bold text-4xl mb-6">Mi Perfil</h2>
        
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="bg-bg-card border border-border-card rounded-2xl p-6 flex flex-col items-center justify-center">
            <span className="text-5xl font-serif italic font-bold text-accent mb-2">{totalWatched}</span>
            <span className="text-sm text-text-main/50 uppercase tracking-wider">Vistas</span>
          </div>
          <div className="bg-bg-card border border-border-card rounded-2xl p-6 flex flex-col items-center justify-center">
            <span className="text-5xl font-serif italic font-bold text-accent mb-2 flex items-baseline gap-1">
              {avgRating} <Star size={20} className="fill-accent text-accent" />
            </span>
            <span className="text-sm text-text-main/50 uppercase tracking-wider">Promedio</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-8">
        <h3 className="font-bold text-lg mb-2">Historial Reciente</h3>
        
        {completedList.length === 0 ? (
          <div className="text-center text-text-main/50 py-10">
            Aún no has calificado ningún título.
          </div>
        ) : (
          completedList.map(media => (
            <div key={media.tmdbId} className="bg-bg-card border border-border-card rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-serif italic font-bold text-xl">{media.title}</h4>
                  <span className="text-xs text-text-main/40">
                    {new Date(media.review!.completedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-bg-main px-3 py-1 rounded-lg border border-border-card">
                  <span className="font-bold">{media.review?.rating}</span>
                  <Star size={14} className="fill-accent text-accent" />
                </div>
              </div>
              
              {media.review?.text && (
                <div className="relative pt-4">
                  <span className="absolute -top-2 left-0 text-4xl text-accent font-serif opacity-30">"</span>
                  <p className="text-text-main/80 italic pl-4 text-sm leading-relaxed relative z-10">
                    {media.review.text}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
