import { useState } from 'react';
import { Check, Film, Plus, Tv } from 'lucide-react';
import { TMDbResult } from '@/types';
import { TMDB_IMAGE_BASE_URL, getGenreNames } from '@/lib/tmdb';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useMediaStore } from '@/store';
import { useToast } from '@/contexts/ToastContext';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { cn } from '@/lib/utils';

/** Placeholder con la misma forma que una tarjeta, para que no salte la fila. */
function CardSkeleton() {
  return (
    <li className="w-32 sm:w-36 shrink-0">
      <div className="aspect-[2/3] w-full rounded-xl bg-border-card animate-pulse" />
      <div className="h-3 w-3/4 rounded bg-border-card animate-pulse mt-2" />
    </li>
  );
}

function ResultCard({ result }: { result: TMDbResult }) {
  const mediaList = useMediaStore((state) => state.mediaList);
  const { addMedia } = useMediaActions();
  const { showToast } = useToast();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const saved = mediaList.find((media) => media.tmdbId === result.id);
  const title = result.title || result.name || '';
  const date = result.release_date || result.first_air_date || '';
  const year = date ? date.split('-')[0] : '';

  const handleAdd = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (saved || isAdding) return;

    setIsAdding(true);
    try {
      await addMedia({
        tmdbId: result.id,
        mediaType: result.media_type,
        title,
        posterPath: result.poster_path,
        backdropPath: result.backdrop_path,
        releaseYear: year,
        genres: getGenreNames(result.genre_ids ?? []),
        status: 'por_ver',
      });
      showToast(`"${title}" se agregó a Por Ver.`);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <li className="w-32 sm:w-36 shrink-0">
      <div className="relative group">
        <button
          type="button"
          onClick={() => setIsDetailOpen(true)}
          className="block w-full text-left"
        >
          <span className="relative block aspect-[2/3] w-full rounded-xl overflow-hidden bg-border-card">
            {result.poster_path ? (
              <img
                src={`${TMDB_IMAGE_BASE_URL}${result.poster_path}`}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-text-subtle">
                {result.media_type === 'movie' ? (
                  <Film size={32} aria-hidden="true" />
                ) : (
                  <Tv size={32} aria-hidden="true" />
                )}
              </span>
            )}
          </span>
          <span className="sr-only">Ver detalle de {title}</span>
        </button>

        <button
          type="button"
          onClick={handleAdd}
          disabled={Boolean(saved) || isAdding}
          aria-label={
            saved ? `"${title}" ya está en tu biblioteca` : `Agregar "${title}" a Por Ver`
          }
          className={cn(
            'absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors',
            saved
              ? 'bg-bg-main/80 text-status-completada cursor-default'
              : 'bg-bg-main/80 text-text-main hover:bg-accent hover:text-accent-contrast',
            isAdding && 'opacity-50',
          )}
        >
          {saved ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Plus size={16} aria-hidden="true" />
          )}
        </button>
      </div>

      <p className="text-sm font-medium mt-2 line-clamp-2 leading-tight">{title}</p>
      <p className="text-xs text-text-subtle">
        {year}
        {year && ' · '}
        {result.media_type === 'movie' ? 'Película' : 'Serie'}
      </p>

      {isDetailOpen && (
        <TitleDetailModal
          id={result.id}
          mediaType={result.media_type}
          media={saved}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
    </li>
  );
}

/**
 * Fila horizontal de títulos.
 *
 * Scrollea de forma nativa en vez de con botones de flecha: en el celular —que
 * es donde más se usa— el gesto ya existe, y en desktop la barra alcanza. Un
 * carrusel con controles propios sería más código para replicar algo que el
 * navegador hace mejor.
 */
export function TitleCarousel({
  title,
  subtitle,
  results,
  isLoading,
  error,
}: {
  title: string;
  subtitle?: string;
  results: TMDbResult[];
  isLoading?: boolean;
  error?: string;
}) {
  if (!isLoading && !error && results.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-serif italic font-bold text-2xl">{title}</h2>
        {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-text-muted">
          {error}
        </p>
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {isLoading
            ? Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)
            : results.map((result) => (
                <ResultCard key={`${result.media_type}-${result.id}`} result={result} />
              ))}
        </ul>
      )}
    </section>
  );
}
