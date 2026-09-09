import { useState } from 'react';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { SavedMedia, MediaStatus } from '@/types';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { latestRating, watchCount } from '@/lib/schema';
import { progressPercent, watchedEpisodes } from '@/lib/progress';
import { Check, Tv, Film, Repeat, Trash2, Star } from 'lucide-react';
import { ReviewDrawer } from './ReviewDrawer';
import { TitleDetailModal } from './TitleDetailModal';
import { ConfirmDialog } from './ConfirmDialog';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<MediaStatus, string> = {
  por_ver: 'Por Ver',
  viendo: 'Viendo',
  completada: 'Completada',
};

export function MediaCard({
  media,
  onClick,
}: {
  media: SavedMedia;
  onClick?: () => void;
}) {
  const { updateStatus, removeMedia } = useMediaActions();
  const { showToast } = useToast();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleStatusChange = (newStatus: MediaStatus) => {
    // Pasar a "completada" abre la reseña en vez de cambiar el estado directo:
    // el estado lo termina de guardar el drawer junto con la calificación.
    if (newStatus === 'completada' && media.status !== 'completada') {
      setIsReviewOpen(true);
      return;
    }
    updateStatus(media.tmdbId, newStatus);
  };

  const rating = latestRating(media);
  const times = watchCount(media);
  // El progreso solo se muestra en series empezadas y sin terminar: al 0% no
  // dice nada y al 100% lo dice el puntaje.
  const percent = media.mediaType === 'tv' ? progressPercent(media) : 0;
  const showProgress =
    media.mediaType === 'tv' && watchedEpisodes(media) > 0 && percent < 100;

  const handleDelete = async () => {
    await removeMedia(media.tmdbId);
    setIsConfirmingDelete(false);
    showToast(`Sacamos "${media.title}" de tu biblioteca.`);
  };

  return (
    <>
      <article
        className={cn(
          'group relative surface overflow-hidden flex flex-col h-full',
          // La tarjeta se levanta al pasarle el cursor por encima. Antes el
          // único cambio era el color del borde, que a un metro de distancia no
          // se ve: la sombra sí.
          'shadow-card transition-[border-color,box-shadow,transform] duration-200',
          'hover:border-text-subtle hover:shadow-lift hover:-translate-y-0.5',
        )}
      >
        {/* Un botón de verdad y no un div con onClick: es la única forma de que
            la tarjeta se pueda abrir con teclado. Los botones de acción quedan
            afuera porque no se pueden anidar dentro de otro botón. */}
        <button
          type="button"
          onClick={() => {
            setIsDetailOpen(true);
            onClick?.();
          }}
          // Nombre accesible explícito. Sin él, el nombre sale de concatenar
          // todo lo que la tarjeta tiene adentro —"5 de 5 estrellas Parásitos
          // 2019 Comedia..."— y queda una sopa que arranca por el puntaje en
          // vez de por lo que el botón hace.
          aria-label={[
            `Ver detalle de ${media.title}`,
            STATUS_LABELS[media.status],
            rating !== undefined && `${rating} de 5 estrellas`,
            showProgress && `${percent}% visto`,
          ]
            .filter(Boolean)
            .join('. ')}
          className="text-left cursor-pointer"
        >
          <span className="relative block aspect-[2/3] w-full bg-border-card overflow-hidden">
            {media.posterPath ? (
              <img
                src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-text-subtle">
                {media.mediaType === 'movie' ? (
                  <Film size={48} aria-hidden="true" />
                ) : (
                  <Tv size={48} aria-hidden="true" />
                )}
              </span>
            )}
            {/* El velo va solo al pie y no sobre el póster entero: cubriéndolo
                todo, cada portada terminaba lavada del color de la tarjeta. Acá
                oscurece lo justo para que el título se lea encima. */}
            <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-bg-card via-bg-card/80 to-transparent" />

            {rating !== undefined && (
              <span className="absolute top-3 right-3 flex items-center gap-1 bg-bg-main/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold">
                {rating}
                <Star size={12} className="fill-accent text-accent" aria-hidden="true" />
              </span>
            )}

            {times > 1 && (
              <span className="absolute top-3 left-3 flex items-center gap-1 bg-bg-main/80 backdrop-blur-sm px-2 py-1 rounded-lg text-[11px] font-medium">
                <Repeat size={11} aria-hidden="true" />
                {times}
              </span>
            )}

            <span className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5">
              <span className="font-semibold text-base leading-snug line-clamp-2">
                {media.title}
              </span>
              <span className="flex flex-wrap gap-2 text-xs text-text-muted">
                <span>{media.releaseYear}</span>
                {media.genres.length > 0 && (
                  <>
                    <span aria-hidden="true">•</span>
                    <span className="truncate">{media.genres[0]}</span>
                  </>
                )}
              </span>

              {showProgress && (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-1 flex-1 bg-border-card rounded-full overflow-hidden"
                  >
                    <span
                      className="block h-full bg-accent rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {percent}%
                  </span>
                </span>
              )}
            </span>
          </span>
        </button>

        {/* Sin chip de estado: la tarjeta siempre se ve dentro de la pestaña de
            su estado, así que repetirlo solo servía para robarle ancho a los
            botones y dejar el texto cortado en "P..". Para lectores de pantalla
            el estado sigue estando, en el nombre accesible del botón de arriba. */}
        {/* Los botones se reparten todo el ancho en lugar de apretarse contra
            la derecha: quedaban tres cuadraditos flotando al final de una fila
            vacía, y con el dedo son un blanco más chico de lo que hace falta. */}
        <div className="p-3 mt-auto shrink-0 border-t border-border-card grid grid-flow-col auto-cols-fr gap-2">
          {media.status === 'por_ver' && (
            <button
              onClick={() => handleStatusChange('viendo')}
              className="btn-icon w-full h-10 bg-bg-main border border-border-card text-text-muted hover:bg-border-card hover:text-text-main"
              aria-label={`Mover "${media.title}" a Viendo`}
              title="Mover a Viendo"
            >
              <Tv size={16} aria-hidden="true" />
            </button>
          )}
          {media.status !== 'completada' && (
            <button
              onClick={() => handleStatusChange('completada')}
              className="btn-icon w-full h-10 bg-bg-main border border-border-card text-status-completada hover:bg-border-card"
              aria-label={`Marcar "${media.title}" como completada`}
              title="Marcar Completada"
            >
              <Check size={16} aria-hidden="true" />
            </button>
          )}
          <button
            onClick={() => setIsConfirmingDelete(true)}
            className="btn-icon w-full h-10 bg-bg-main border border-border-card text-text-muted hover:bg-border-card hover:text-accent"
            aria-label={`Eliminar "${media.title}" de la biblioteca`}
            title="Eliminar de mi biblioteca"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </article>

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Sacar de tu biblioteca"
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onClose={() => setIsConfirmingDelete(false)}
        description={
          <p>
            ¿Sacar <strong className="text-text-main">{media.title}</strong> de tu
            biblioteca? Si tenía reseña, también se borra.
          </p>
        }
      />

      {isReviewOpen && (
        <ReviewDrawer
          media={media}
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
        />
      )}

      {isDetailOpen && (
        <TitleDetailModal
          id={media.tmdbId}
          mediaType={media.mediaType}
          media={media}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
    </>
  );
}
