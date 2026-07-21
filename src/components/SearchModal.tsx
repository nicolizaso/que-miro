import React, { useState } from 'react';
import { useMediaStore } from '@/store';
import { Search, Plus, Check, Tv, Film } from 'lucide-react';
import { searchMulti, getGenreNames, TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { TMDbResult } from '@/types';
import { cn } from '@/lib/utils';

export function SearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMDbResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { addMedia, mediaList } = useMediaStore();

  React.useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await searchMulti(query);
      setResults(res);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg-main/90 backdrop-blur-sm p-4 flex flex-col pt-16">
      <div className="relative max-w-2xl w-full mx-auto flex flex-col gap-4 h-full">
        <button onClick={onClose} className="absolute -top-12 right-0 text-text-main p-2">Cerrar</button>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            autoFocus
            placeholder="Buscar películas o series..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-bg-card border border-border-card rounded-2xl py-4 pl-12 pr-4 text-text-main focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-20">
          {isSearching && <div className="text-center text-sm text-gray-400 mt-4">Buscando...</div>}
          {!isSearching && results.map(result => {
            const isAdded = mediaList.some(m => m.tmdbId === result.id);
            const title = result.title || result.name || '';
            const date = result.release_date || result.first_air_date || '';
            const year = date ? date.split('-')[0] : '';
            
            return (
              <div key={result.id} className="flex gap-4 p-3 bg-bg-card border border-border-card rounded-2xl items-center">
                <div className="w-16 h-24 bg-border-card rounded-lg flex-shrink-0 overflow-hidden">
                  {result.poster_path ? (
                    <img src={`${TMDB_IMAGE_BASE_URL}${result.poster_path}`} alt={title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      {result.media_type === 'movie' ? <Film /> : <Tv />}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-text-main truncate">{title}</h4>
                  <div className="text-sm text-gray-400 flex items-center gap-2">
                    <span>{year}</span>
                    <span>•</span>
                    <span>{result.media_type === 'movie' ? 'Película' : 'Serie'}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {isAdded ? (
                    <span className="p-3 bg-border-card rounded-xl text-gray-400 flex items-center justify-center">
                      <Check size={20} />
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          addMedia({
                            tmdbId: result.id,
                            mediaType: result.media_type as 'movie' | 'tv',
                            title,
                            posterPath: result.poster_path,
                            backdropPath: result.backdrop_path,
                            releaseYear: year,
                            genres: getGenreNames(result.genre_ids),
                            status: 'por_ver'
                          });
                          onClose();
                        }}
                        className="p-3 bg-bg-main border border-border-card rounded-xl text-status-por-ver hover:bg-border-card transition-colors flex items-center justify-center"
                        title="Por Ver"
                      >
                        <Plus size={20} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
