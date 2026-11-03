import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { SavedMedia, SeasonInfo, SeriesProgress } from '@/types';
import { useSeasonDetail } from '@/hooks/useSeasonDetail';
import { EpisodeCard } from '@/components/series/EpisodeCard';
import { SeasonStrip } from '@/components/series/SeasonStrip';
import {
  EpisodeRef,
  episodeRating,
  focusEpisode,
  isEpisodeWatched,
  markEpisodes,
  previousEpisodesQuestion,
  toggleEpisode,
  unwatchedRunBefore,
} from '@/lib/progress';
import { isEpisodeAired, seasonTotalRuntime } from '@/lib/episodes';
import { toDayKey } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Props {
  /** El título con las temporadas que se están mostrando. */
  media: SavedMedia;
  season: SeasonInfo;
  /** Cuántos episodios de la temporada ya salieron. */
  aired: number;
  /** El panel de las pestañas, si hay más de una temporada. */
  tabPanel?: { id: string; labelledBy: string };
  /** La temporada que sigue, para ofrecerla al terminar esta. */
  nextSeason?: SeasonInfo;
  onSelectSeason: (seasonNumber: number) => void;
  onProgress: (progress: SeriesProgress) => void;
  onRateEpisode: (seasonNumber: number, episode: number, rating: number) => void;
  onToggleSeason: (season: SeasonInfo) => void;
  /** Avisa cuánto dura la temporada entera, cuando se supo. */
  onRuntimeKnown: (seasonNumber: number, totalRuntime: number) => void;
}

/** La pregunta por los anteriores: sobre qué episodio y cuáles faltan. */
interface PendingMark {
  episode: number;
  run: EpisodeRef[];
}

/** Mientras llegan los episodios: la forma de la tarjeta, sin saltos. */
function CardSkeleton() {
  return (
    <div aria-hidden="true" className="surface overflow-hidden">
      <div className="aspect-video bg-border-card animate-pulse" />
      <div className="flex flex-col gap-2 p-4">
        <span className="h-4 w-3/5 rounded bg-border-card animate-pulse" />
        <span className="h-3 w-2/5 rounded bg-border-card animate-pulse" />
        <span className="h-12 mt-2 rounded-control bg-border-card animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Una temporada, de a un episodio.
 *
 * Las tarjetas se deslizan con el dedo o con las flechas, y la tira de números
 * de abajo es el mapa. Abre en el episodio que te toca, que es el que casi
 * siempre se viene a marcar.
 *
 * Pide sus episodios a TMDB al mostrarse. Mientras no llegan —o si no hay
 * conexión, o TMDB no contesta— las tarjetas muestran el número en lugar de la
 * imagen y se pueden marcar igual: para eso no hace falta nadie más.
 */
export function SeasonPanel({
  media,
  season,
  aired,
  tabPanel,
  nextSeason,
  onSelectSeason,
  onProgress,
  onRateEpisode,
  onToggleSeason,
  onRuntimeKnown,
}: Props) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [current, setCurrent] = useState(() => focusEpisode(media, season));
  const [pending, setPending] = useState<PendingMark | null>(null);
  const { season: detail, status } = useSeasonDetail(media.tmdbId, season.seasonNumber, true);
  const today = toDayKey(new Date());

  const episodes = status === 'ready' && detail?.episodes.length ? detail.episodes : null;
  const count = episodes?.length ?? season.episodeCount;
  const number = season.seasonNumber;

  // Sin los datos de TMDB no se sabe qué salió: se puede marcar todo, como en
  // la grilla de números de antes.
  const isAired = (episode: number) => {
    const known = episodes?.find((item) => item.episode_number === episode);
    return known ? isEpisodeAired(known, today) : true;
  };
  const isWatched = (episode: number) => isEpisodeWatched(media.progress, number, episode);

  // Contra lo que salió: en una temporada en emisión, "4/10" diría que faltan
  // seis que todavía nadie pudo ver.
  const seen = (media.progress?.watched[number] ?? []).filter((e) => e <= aired).length;
  const isComplete = aired > 0 && seen >= aired;
  const upcoming = season.episodeCount - aired;

  // La duración se anota solo si la temporada trae los mismos episodios que
  // la biblioteca cree que tiene: si no, la suma sería de otra temporada.
  const totalRuntime =
    episodes && episodes.length === season.episodeCount ? seasonTotalRuntime(episodes) : undefined;
  useEffect(() => {
    if (totalRuntime !== undefined && totalRuntime !== season.totalRuntime) {
      onRuntimeKnown(number, totalRuntime);
    }
    // `onRuntimeKnown` cambia en cada render del padre; lo que importa es el dato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalRuntime, season.totalRuntime, number]);

  /** Lleva la lista hasta la tarjeta de un episodio. */
  const scrollToCard = (episode: number, smooth: boolean) => {
    const list = listRef.current;
    const card = list?.querySelector<HTMLElement>(`[data-episode="${episode}"]`);
    if (!list || !card) return;
    const left = card.offsetLeft - parseFloat(getComputedStyle(list).paddingLeft || '0');
    // jsdom no implementa el scroll de elementos.
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ left, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    } else {
      list.scrollLeft = left;
    }
  };

  // Al abrir, y cuando llegan los episodios y las tarjetas cambian de forma,
  // la lista se para en la tarjeta del episodio elegido.
  useLayoutEffect(() => {
    scrollToCard(current, false);
    // Solo al montar y al cambiar la cantidad de tarjetas: el resto de los
    // movimientos los hacen `goTo` y el dedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, status === 'loading']);

  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  /**
   * La fila mide lo que mide la tarjeta a la vista.
   *
   * Sin esto la fila tomaba la altura de la tarjeta más alta de la temporada
   * —una vista, con sinopsis y estrellas—, y debajo de un episodio sin ver
   * quedaba un hueco del tamaño de esa diferencia.
   */
  const [listHeight, setListHeight] = useState<number>();
  useLayoutEffect(() => {
    const card = listRef.current?.querySelector<HTMLElement>(`[data-episode="${current}"]`);
    if (!card || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setListHeight(card.offsetHeight);
      // La fila no scrollea en vertical, pero el navegador igual la corre si
      // algo de adentro pide estar a la vista mientras cambia de alto. Solo si
      // se corrió: escribir `scrollTop`, aunque sea el mismo valor, corta el
      // deslizamiento horizontal en curso, y tocar un número de la tira dejaba
      // la tarjeta donde estaba.
      const list = listRef.current;
      if (list && list.scrollTop !== 0) list.scrollTop = 0;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [current, count, status]);

  const goTo = (episode: number) => {
    const target = Math.min(Math.max(episode, 1), count);
    setCurrent(target);
    scrollToCard(target, true);
  };

  /** Al soltar el dedo, la tarjeta que quedó a la vista pasa a ser la elegida. */
  const handleScroll = () => {
    if (listRef.current?.scrollTop) listRef.current.scrollTop = 0;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const padding = parseFloat(getComputedStyle(list).paddingLeft || '0');
      let closest = 0;
      let distance = Infinity;
      list.querySelectorAll<HTMLElement>('[data-episode]').forEach((card) => {
        const gap = Math.abs(card.offsetLeft - padding - list.scrollLeft);
        if (gap < distance) {
          distance = gap;
          closest = Number(card.dataset.episode);
        }
      });
      if (closest > 0) setCurrent(closest);
    }, 120);
  };

  const handleToggle = (episode: number) => {
    if (isWatched(episode)) {
      setPending(null);
      onProgress(toggleEpisode(media.progress, number, episode));
      return;
    }
    // Marcar un episodio avanzado con lo de antes sin ver casi siempre es
    // registrar que viste todo hasta ahí: se pregunta en vez de adivinar,
    // porque a veces uno saltea episodios a propósito.
    const run = unwatchedRunBefore(media, number, episode);
    if (run.length > 0) {
      setPending({ episode, run });
      return;
    }
    setPending(null);
    onProgress(toggleEpisode(media.progress, number, episode));
  };

  const nextFor = (episode: number) => {
    if (episode < count) {
      return { label: `Siguiente: E${episode + 1}`, onGo: () => goTo(episode + 1) };
    }
    if (nextSeason) {
      return {
        label: `Seguir con la T${nextSeason.seasonNumber}`,
        onGo: () => onSelectSeason(nextSeason.seasonNumber),
      };
    }
    return undefined;
  };

  return (
    <div
      {...(tabPanel
        ? { id: tabPanel.id, role: 'tabpanel', 'aria-labelledby': tabPanel.labelledBy }
        : {})}
      className="@container flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm min-w-0">
          <span className="font-medium">{season.name}</span>
          {/* Con pastillas, la cuenta ya está en la pastilla elegida. */}
          {!tabPanel && (
            <span
              className={cn('tabular-nums', isComplete ? 'text-status-completada' : 'text-text-subtle')}
            >
              {' · '}
              {seen}/{aired}
            </span>
          )}
          {upcoming > 0 && <span className="text-text-subtle"> · {upcoming} por salir</span>}
        </p>
        {/* Una temporada que todavía no salió no tiene nada para marcar. */}
        {aired > 0 && (
          <button
            type="button"
            onClick={() => onToggleSeason(season)}
            className="btn btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
          >
            {isComplete ? 'Desmarcar' : 'Marcar toda'}
          </button>
        )}
      </div>

      {/* Arriba de la tarjeta y no abajo: la tarjeta cambia de alto según el
          episodio, y lo que va debajo se corre. Acá, la tira y las flechas
          quedan siempre en el mismo lugar. */}
      <div className="flex items-center gap-2">
        {/* Las flechas, solo con mouse: en pantalla táctil la tarjeta ya se
            desliza con el dedo, y le robarían ancho a la tira. */}
        <div className="hidden sm:flex shrink-0">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current <= 1}
            aria-label="Episodio anterior"
            className="btn-icon w-9 h-9 border border-border-card text-text-muted hover:bg-border-card hover:text-text-main disabled:opacity-30"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        </div>
        <SeasonStrip
          episodeCount={count}
          current={current}
          isAired={isAired}
          isWatched={isWatched}
          onGo={goTo}
          className="flex-1 min-w-0 -mx-6 px-6 sm:mx-0 sm:px-1"
        />
        <div className="hidden sm:flex shrink-0">
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={current >= count}
            aria-label="Episodio siguiente"
            className="btn-icon w-9 h-9 border border-border-card text-text-muted hover:bg-border-card hover:text-text-main disabled:opacity-30"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* El anillo de la tira ya dice cuál es; esto es para el lector de
          pantalla, que se entera al deslizar. */}
      <p className="sr-only" aria-live="polite">
        Episodio {current} de {count}
      </p>

      {status === 'loading' ? (
        <CardSkeleton />
      ) : (
        // La siguiente se asoma por el costado: es lo que dice, sin palabras,
        // que se puede deslizar. Imantada con `mandatory` y no con el
        // `proximity` de las filas de pósters: acá se ve un episodio por vez,
        // y un arrastre corto tiene que terminar en una tarjeta entera.
        <ul
          ref={listRef}
          onScroll={handleScroll}
          aria-label={`Episodios de ${season.name}`}
          style={{ height: listHeight }}
          // El ancho de cada tarjeta sale del panel (`cqw`) y no de la fila:
          // así el relleno de la derecha puede ser más ancho sin achicarlas.
          // Ese relleno es lo que deja que la última tarjeta se imante al
          // mismo lugar que las otras; con uno común quedaba corrida a la
          // derecha, con un pedazo grande de la anterior a la vista.
          className="relative -mx-6 pl-6 pr-14 md:pr-[calc(15cqw+1.5rem)] scroll-px-6 grid grid-flow-col auto-cols-[calc(100cqw-2rem)] md:auto-cols-[85cqw] gap-3 items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain transition-[height] duration-200 motion-reduce:transition-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {Array.from({ length: count }, (_, index) => {
            const episodeNumber = index + 1;
            const watched = isWatched(episodeNumber);
            return (
              <li key={episodeNumber} data-episode={episodeNumber} className="snap-start">
                <EpisodeCard
                  seasonNumber={number}
                  seasonName={season.name}
                  episodeNumber={episodeNumber}
                  episode={episodes?.find((item) => item.episode_number === episodeNumber)}
                  aired={isAired(episodeNumber)}
                  watched={watched}
                  rating={episodeRating(media.progress, number, episodeNumber)}
                  next={nextFor(episodeNumber)}
                  prompt={
                    pending?.episode === episodeNumber
                      ? {
                          question: previousEpisodesQuestion(pending.run),
                          onConfirm: () => {
                            setPending(null);
                            onProgress(
                              markEpisodes(media.progress, [
                                ...pending.run,
                                { seasonNumber: number, episode: episodeNumber },
                              ]),
                            );
                          },
                          onOnlyThis: () => {
                            setPending(null);
                            onProgress(toggleEpisode(media.progress, number, episodeNumber));
                          },
                          onCancel: () => setPending(null),
                        }
                      : undefined
                  }
                  onToggle={() => handleToggle(episodeNumber)}
                  onRate={(rating) => onRateEpisode(number, episodeNumber, rating)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
