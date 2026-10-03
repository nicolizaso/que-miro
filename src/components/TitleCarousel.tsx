import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Film, Plus, Tv } from 'lucide-react';
import { TMDbResult } from '@/types';
import { TMDB_IMAGE_BASE_URL, getGenreNames } from '@/lib/tmdb';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useMediaStore } from '@/store';
import { useToast } from '@/contexts/ToastContext';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { cn } from '@/lib/utils';

/** Placeholder con la misma forma que una tarjeta, para que no salte la fila. */
function CardSkeleton() {
  return (
    <li className="rail-item w-32 sm:w-36 shrink-0">
      <div className="aspect-[2/3] w-full rounded-control bg-border-card animate-pulse" />
      {/* Dos renglones, del mismo alto que reserva el título de una tarjeta de
          verdad: así al llegar los resultados la fila no cambia de altura. */}
      <div className="mt-3 flex flex-col gap-1.5">
        <div className="h-3 w-4/5 rounded bg-border-card animate-pulse" />
        <div className="h-2.5 w-1/2 rounded bg-border-card animate-pulse" />
      </div>
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
      const outcome = await addMedia({
        tmdbId: result.id,
        mediaType: result.media_type,
        title,
        posterPath: result.poster_path,
        backdropPath: result.backdrop_path,
        releaseYear: year,
        genres: getGenreNames(result.genre_ids ?? []),
        status: 'por_ver',
      });
      if (outcome === 'saved') showToast(`"${title}" se agregó a Por Ver.`);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <li className="rail-item w-32 sm:w-36 shrink-0">
      <div className="relative group">
        <button
          type="button"
          onClick={() => setIsDetailOpen(true)}
          className="block w-full text-left"
        >
          <span
            className={cn(
              'relative block aspect-[2/3] w-full rounded-control overflow-hidden bg-border-card',
              // El póster es la tarjeta: no lleva marco, lo lleva la sombra.
              // Al pasar el cursor sube un poco y la sombra se abre, que es lo
              // que hace evidente cuál de los siete de la fila está apuntado.
              'shadow-card transition-[transform,box-shadow] duration-200',
              'group-hover:-translate-y-1 group-hover:shadow-lift',
            )}
          >
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
            {/* Un borde por dentro, del color del texto a un 10%: separa el
                póster del fondo cuando la imagen termina en negro, sin dibujar
                una línea que compita con la sombra. */}
            <span className="absolute inset-0 rounded-control ring-1 ring-inset ring-text-main/10" />
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
            'absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center',
            'backdrop-blur-md transition-[background-color,color,opacity,transform] duration-150 active:scale-90',
            saved
              ? 'bg-bg-main/70 text-status-completada cursor-default'
              : 'bg-bg-main/70 text-text-main hover:bg-accent hover:text-accent-contrast',
            // Con mouse se esconde hasta que el cursor entra en la tarjeta: era
            // lo más llamativo de cada póster y el póster es lo que hay que
            // mirar. Con el dedo no hay hover que valga, así que queda fijo.
            'hover-device:opacity-0 hover-device:group-hover:opacity-100 hover-device:group-focus-within:opacity-100',
            isAdding && 'opacity-50',
          )}
        >
          {saved ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Plus size={15} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Alto fijo para el título: sin esto, uno de dos renglones empuja su
          año una línea más abajo que el de al lado y la fila queda despareja. */}
      <p className="text-sm font-medium mt-3 line-clamp-2 leading-tight min-h-[2.5em]">
        {title}
      </p>
      <p className="text-xs text-text-subtle mt-0.5">
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

/** La cara de quien protagoniza la fila, o sus iniciales si TMDB no la tiene. */
function Avatar({ name, profilePath }: { name: string; profilePath?: string | null }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('');

  return (
    <span
      className="shrink-0 w-11 h-11 rounded-full overflow-hidden bg-border-card flex items-center justify-center text-sm font-medium text-text-muted ring-1 ring-inset ring-text-main/10"
      aria-hidden="true"
    >
      {profilePath ? (
        <img
          src={`${TMDB_IMAGE_BASE_URL}${profilePath}`}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

/**
 * Fila horizontal de títulos.
 *
 * El desplazamiento sigue siendo el nativo —rueda, trackpad, dedo—; `ScrollRail`
 * le agrega arriba las flechas y los bordes desvanecidos, y le saca la barra de
 * scroll del sistema, que era lo único que decía "esta fila sigue" y lo decía
 * mal.
 */
export function TitleCarousel({
  title,
  subtitle,
  avatar,
  results,
  isLoading,
  error,
}: {
  title: string;
  subtitle?: string;
  /**
   * Cuando la fila habla de alguien, su cara al lado del título. Con el id,
   * el título lleva a su página.
   */
  avatar?: { id?: number; name: string; profilePath?: string | null };
  results: TMDbResult[];
  isLoading?: boolean;
  error?: string;
}) {
  if (!isLoading && !error && results.length === 0) return null;

  const personPath = avatar?.id ? `/persona/${avatar.id}` : null;
  const header = (
    <div className="min-w-0 flex items-center gap-3">
      {avatar &&
        (personPath ? (
          // La cara lleva al mismo lugar que el título, pero fuera del orden
          // de tabulación: con un enlace por fila alcanza para el teclado y el
          // lector de pantalla, y dos iguales seguidos son ruido.
          <Link to={personPath} tabIndex={-1} aria-hidden="true" className="shrink-0 rounded-full">
            <Avatar {...avatar} />
          </Link>
        ) : (
          <Avatar {...avatar} />
        ))}
      <div className="min-w-0">
        <h2 className="text-section">
          {personPath ? (
            <Link to={personPath} className="group inline-flex items-center gap-1 hover:text-accent transition-colors">
              {title}
              <ChevronRight
                size={18}
                className="shrink-0 text-text-subtle group-hover:text-accent motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          ) : (
            title
          )}
        </h2>
        {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );

  if (error) {
    return (
      <section className="flex flex-col gap-2">
        {header}
        <p role="alert" className="text-sm text-text-muted">
          {error}
        </p>
      </section>
    );
  }

  return (
    <section>
      <ScrollRail label={title} header={header}>
        {isLoading
          ? Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)
          : results.map((result) => (
              <ResultCard key={`${result.media_type}-${result.id}`} result={result} />
            ))}
      </ScrollRail>
    </section>
  );
}
