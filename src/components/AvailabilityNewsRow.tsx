import { useMemo, useState } from 'react';
import { Film, Tv, X } from 'lucide-react';
import { useMediaStore } from '@/store';
import { useMediaActions } from '@/hooks/useMediaActions';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { JustWatchCredit } from '@/components/Attribution';
import { newsLabel, titlesWithNews } from '@/lib/availability';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';

/** Cuántas se muestran: más que esto ya es una lista, no un aviso. */
const VISIBLE = 3;

/**
 * "Novedades": lo de *Por Ver* que llegó a una plataforma o salió en digital.
 *
 * En el inicio y no arriba de *Por Ver*: es lo que responde "¿qué puedo ver
 * esta noche que antes no podía?", y esa pregunta se hace al abrir la app, no
 * al ir a buscar una pestaña. Sin novedades, no existe.
 */
export function AvailabilityNewsRow() {
  const mediaList = useMediaStore((state) => state.mediaList);
  const { dismissAvailabilityNews } = useMediaActions();
  const [openId, setOpenId] = useState<number | null>(null);

  const items = useMemo(() => titlesWithNews(mediaList), [mediaList]);
  const open = mediaList.find((media) => media.tmdbId === openId);

  if (items.length === 0) return null;

  const hasProviders = items.some(({ news }) => news.some((item) => item.kind === 'provider'));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section">Novedades</h2>
      <ul className="surface divide-y divide-border-card overflow-hidden">
        {items.slice(0, VISIBLE).map(({ media, news }) => (
          <li key={media.tmdbId} className="flex items-center gap-2 pr-2">
            <button
              type="button"
              onClick={() => setOpenId(media.tmdbId)}
              className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left hover:bg-border-card/40 transition-colors"
            >
              <span className="w-10 aspect-[2/3] shrink-0 rounded-md bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
                {media.posterPath ? (
                  <img
                    src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : media.mediaType === 'movie' ? (
                  <Film size={16} aria-hidden="true" />
                ) : (
                  <Tv size={16} aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-semibold">{media.title}</span>{' '}
                <span className="text-text-muted">{newsLabel(news)}.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => dismissAvailabilityNews(media)}
              aria-label={`Descartar la novedad de ${media.title}`}
              title="Descartar"
              className="btn-icon w-9 h-9 shrink-0 rounded-full text-text-muted hover:text-text-main hover:bg-border-card"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {items.length > VISIBLE && (
        <p className="text-sm text-text-muted">
          Y {items.length - VISIBLE} más: las ves en la tarjeta de cada una, en Por Ver.
        </p>
      )}
      {/* Decir en qué plataforma está es mostrar datos de JustWatch. */}
      {hasProviders && <JustWatchCredit />}

      {open && (
        <TitleDetailModal
          id={open.tmdbId}
          mediaType={open.mediaType}
          media={open}
          isOpen
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
