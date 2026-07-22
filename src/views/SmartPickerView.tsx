import React, { useState, useMemo } from 'react';
import { useMediaStore } from '@/store';
import { Shuffle } from 'lucide-react';
import { MediaCard } from '@/components/MediaCard';
import { SavedMedia } from '@/types';
import { cn } from '@/lib/utils';

export function SmartPickerView() {
  const { mediaList } = useMediaStore();
  const porVerList = mediaList.filter(m => m.status === 'por_ver');
  
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    porVerList.forEach(m => m.genres.forEach(g => genres.add(g)));
    return Array.from(genres).sort();
  }, [porVerList]);

  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [pickedMedia, setPickedMedia] = useState<SavedMedia | null>(null);
  const [isPicking, setIsPicking] = useState(false);

  const handlePick = () => {
    setIsPicking(true);
    setPickedMedia(null);
    
    setTimeout(() => {
      const listToPick = selectedGenre 
        ? porVerList.filter(m => m.genres.includes(selectedGenre))
        : porVerList;
        
      if (listToPick.length > 0) {
        const randomIndex = Math.floor(Math.random() * listToPick.length);
        setPickedMedia(listToPick[randomIndex]);
      }
      setIsPicking(false);
    }, 600); // Fake delay for animation
  };

  if (porVerList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center h-full max-w-lg mx-auto pb-24">
        <Shuffle className="text-border-card w-16 h-16 mb-6" />
        <h2 className="font-serif italic font-bold text-2xl mb-2">Smart Picker</h2>
        <p className="text-text-main/50">Agrega títulos a tu lista "Por Ver" para usar el selector aleatorio.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-4 pt-10 pb-24 min-h-[calc(100vh-80px)]">
      <h2 className="font-serif italic font-bold text-4xl mb-2">Qué Ver Hoy</h2>
      <p className="text-text-main/50 mb-10 text-center">Deja que el destino elija tu próxima historia.</p>
      
      <div className="flex flex-wrap justify-center gap-2 mb-12">
        <button
          onClick={() => setSelectedGenre(null)}
          className={cn(
            "px-4 py-2 rounded-full border text-sm transition-colors",
            selectedGenre === null 
              ? "bg-text-main text-bg-main border-text-main" 
              : "bg-transparent border-border-card text-text-main/70 hover:border-text-main/30"
          )}
        >
          Todos
        </button>
        {allGenres.map(genre => (
          <button
            key={genre}
            onClick={() => setSelectedGenre(genre)}
            className={cn(
              "px-4 py-2 rounded-full border text-sm transition-colors",
              selectedGenre === genre 
                ? "bg-text-main text-bg-main border-text-main" 
                : "bg-transparent border-border-card text-text-main/70 hover:border-text-main/30"
            )}
          >
            {genre}
          </button>
        ))}
      </div>

      {!pickedMedia ? (
        <button
          onClick={handlePick}
          disabled={isPicking}
          className="group relative w-48 h-48 rounded-full bg-bg-card border-2 border-accent flex items-center justify-center hover:bg-accent/10 transition-colors disabled:opacity-50"
        >
          <div className={cn("flex flex-col items-center gap-2", isPicking && "animate-pulse")}>
            <Shuffle className="text-accent group-hover:scale-110 transition-transform" size={40} />
            <span className="font-bold text-accent font-serif italic text-xl">Elegir</span>
          </div>
        </button>
      ) : (
        <div className="flex flex-col items-center w-full max-w-sm animate-in fade-in zoom-in duration-500">
          <div className="w-full mb-6">
            <MediaCard media={pickedMedia} />
          </div>
          <button
            onClick={handlePick}
            className="text-sm text-text-main/50 hover:text-text-main underline underline-offset-4"
          >
            Probar otra vez
          </button>
        </div>
      )}
    </div>
  );
}
