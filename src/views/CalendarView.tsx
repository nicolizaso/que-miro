import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Film, Tv } from 'lucide-react';
import { useMediaStore } from '@/store';
import { useCalendarSeasons } from '@/hooks/useCalendarSeasons';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import {
  CalendarItem,
  buildCalendar,
  episodesLabel,
  seasonsToFetch,
} from '@/lib/calendar';
import { formatWeekday, toDayKey } from '@/lib/dates';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';

/** Qué sale: "T2E4 · Nombre", "Estreno de la temporada 3", "Estreno". */
function whatAirs(item: CalendarItem): string {
  if (item.media.mediaType === 'movie') return 'Estreno';

  const [first] = item.episodes;
  if (item.isWholeSeason) {
    return `Temporada ${first.seasonNumber} completa · ${item.episodes.length} episodios`;
  }
  if (item.episodes.length > 1) {
    return `${episodesLabel(item)} · ${item.episodes.length} episodios`;
  }
  if (first.episodeNumber === 1) {
    return first.seasonNumber === 1
      ? 'Estreno de la serie'
      : `Estreno de la temporada ${first.seasonNumber}`;
  }
  return first.name ? `${episodesLabel(item)} · ${first.name}` : episodesLabel(item);
}

function CalendarRow({ item, onOpen }: { item: CalendarItem; onOpen: () => void }) {
  const { media } = item;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-border-card/40 transition-colors"
      >
        <span className="w-12 aspect-[2/3] shrink-0 rounded-lg bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
          {media.posterPath ? (
            <img
              src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : media.mediaType === 'movie' ? (
            <Film size={18} aria-hidden="true" />
          ) : (
            <Tv size={18} aria-hidden="true" />
          )}
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="font-semibold truncate">{media.title}</span>
          <span className="text-sm text-text-muted truncate">
            {item.isPremiere && (
              <span className="text-accent font-medium">● </span>
            )}
            {whatAirs(item)}
          </span>
          {/* En el teléfono el día va abajo: a la derecha le robaba el ancho
              al título. */}
          <span className="sm:hidden text-sm text-text-subtle first-letter:uppercase">
            {formatWeekday(item.date)}
          </span>
        </span>
        {/* El día, no la hora: TMDB no la da, y convertirla a la zona de
            quien mira inventaría una precisión que el dato no tiene. */}
        <span className="hidden sm:block text-sm text-text-muted shrink-0 text-right first-letter:uppercase">
          {formatWeekday(item.date)}
        </span>
      </button>
    </li>
  );
}

/**
 * El calendario: lo que sale de las series que seguís y de lo que tenés en
 * *Por Ver*.
 *
 * Se arma con lo que la biblioteca ya sabe —el próximo episodio de cada serie,
 * que refresca el segundo plano— y, para lo que sale en el próximo mes, con la
 * temporada entera, que es lo que deja ver bien una que se estrena de una vez.
 */
export function CalendarView() {
  const mediaList = useMediaStore((state) => state.mediaList);
  const [openId, setOpenId] = useState<number | null>(null);

  // El día se calcula una vez por visita: pasadas las doce, recargar lo pone
  // al día, y un calendario que se reacomoda solo a medianoche no le sirve a
  // nadie.
  const [today] = useState(() => toDayKey(new Date()));
  const wanted = useMemo(() => seasonsToFetch(mediaList, today), [mediaList, today]);
  const seasons = useCalendarSeasons(wanted);
  const calendar = useMemo(
    () => buildCalendar(mediaList, today, seasons),
    [mediaList, today, seasons],
  );

  const open = mediaList.find((media) => media.tmdbId === openId);
  const isEmpty = calendar.groups.length === 0 && calendar.undated.length === 0;

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl mx-auto px-4 pt-8">
      <header>
        <h1 className="text-display mb-1">Calendario</h1>
        <p className="text-text-muted">
          Lo que sale de las series que seguís y lo que tenés anotado para ver.
        </p>
      </header>

      {isEmpty ? (
        <div className="flex flex-col items-center text-center gap-3 py-16 text-text-muted">
          <CalendarDays className="w-12 h-12 text-border-card" aria-hidden="true" />
          <p className="max-w-sm">
            Nada anunciado por ahora. Cuando una serie que estás viendo anuncie
            episodios, o algo de tu lista <em>Por Ver</em> tenga fecha de
            estreno, aparece acá.
          </p>
          <Link to="/" className="btn btn-secondary mt-2 px-4 py-2.5 text-sm">
            Ir a Mis listas
          </Link>
        </div>
      ) : (
        <>
          {calendar.groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-3">
              <h2 className="text-section">{group.label}</h2>
              <ul className="surface divide-y divide-border-card overflow-hidden">
                {group.items.map((item) => (
                  <CalendarRow
                    key={item.key}
                    item={item}
                    onOpen={() => setOpenId(item.media.tmdbId)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {calendar.undated.length > 0 && (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-section">Sin fecha confirmada</h2>
                <p className="text-sm text-text-muted">
                  Siguen en emisión, pero todavía no anunciaron el próximo episodio.
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {calendar.undated.map((media) => (
                  <li key={media.tmdbId}>
                    <button
                      type="button"
                      onClick={() => setOpenId(media.tmdbId)}
                      className="px-3 py-1.5 rounded-full border border-border-control text-sm text-text-muted hover:text-text-main hover:border-accent transition-colors"
                    >
                      {media.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {open && (
        <TitleDetailModal
          id={open.tmdbId}
          mediaType={open.mediaType}
          media={open}
          isOpen
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
