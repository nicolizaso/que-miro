import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { TMDbEpisode } from '@/types';
import { StarRatingInput } from '@/components/ui/StarRating';
import { episodeTypeLabel } from '@/lib/episodes';
import { formatDay, formatShortDay } from '@/lib/dates';
import { TMDB_STILL_LARGE_URL, TMDB_STILL_URL } from '@/lib/tmdb';
import { cn } from '@/lib/utils';

/** La pregunta por los anteriores sin ver, abierta sobre esta tarjeta. */
export interface PreviousPrompt {
  question: string;
  onConfirm: () => void;
  onOnlyThis: () => void;
  onCancel: () => void;
}

interface Props {
  seasonNumber: number;
  seasonName: string;
  episodeNumber: number;
  /** Lo que mandó TMDB. Sin él —sin conexión, o TMDB no contesta— va el número. */
  episode?: TMDbEpisode;
  /** Si ya salió. Sin los datos de TMDB se da por salido: no hay con qué saberlo. */
  aired: boolean;
  watched: boolean;
  rating: number | undefined;
  /** Lo que se ofrece al terminar de puntuar: el siguiente, o la temporada que sigue. */
  next?: { label: string; onGo: () => void };
  prompt?: PreviousPrompt;
  onToggle: () => void;
  onRate: (rating: number) => void;
}

/** Las sinopsis cortas entran enteras en tres renglones: no hace falta el botón. */
const LONG_OVERVIEW = 160;

/**
 * Un episodio, de a uno y con su imagen grande.
 *
 * La imagen va arriba y a todo el ancho, y el texto abajo: así no cambia de
 * tamaño cuando aparece la sinopsis, que era lo que la dejaba mínima al lado
 * de seis renglones de texto.
 *
 * La sinopsis de lo que no viste queda detrás de un botón. Es la regla
 * anti-spoiler: quien abre la temporada para marcar el episodio de anoche no
 * tiene por qué enterarse de qué pasa en el siguiente.
 */
export function EpisodeCard({
  seasonNumber,
  seasonName,
  episodeNumber,
  episode,
  aired,
  watched,
  rating,
  next,
  prompt,
  onToggle,
  onRate,
}: Props) {
  const [isOverviewShown, setIsOverviewShown] = useState(false);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isAsking = prompt !== undefined;
  const wasAsking = useRef(false);

  // La pregunta ocupa el lugar del botón que se tocó: el foco va a ella, si no
  // quien usa teclado o lector de pantalla no se entera de que hay algo que
  // contestar. Al contestarla vuelve a "Lo vi", que reaparece. Sin mover la
  // vista: la fila de tarjetas recorta lo que se le corre para abajo.
  useEffect(() => {
    if (isAsking) confirmRef.current?.focus({ preventScroll: true });
    else if (wasAsking.current) toggleRef.current?.focus({ preventScroll: true });
    wasAsking.current = isAsking;
  }, [isAsking]);

  const name = episode?.name || `Episodio ${episodeNumber}`;
  const typeLabel = episodeTypeLabel(episode?.episode_type ?? null);
  const overview = episode?.overview;

  const when = episode
    ? episode.air_date
      ? aired
        ? formatShortDay(episode.air_date)
        : `Sale el ${formatDay(episode.air_date)}`
      : 'Sin fecha todavía'
    : null;
  const meta = [
    when,
    episode?.runtime && `${episode.runtime} min`,
    episode &&
      episode.vote_average > 0 &&
      `${episode.vote_average.toFixed(1).replace('.', ',')} en TMDB`,
  ].filter(Boolean);

  // Lo que todavía no salió no se puede marcar, salvo que ya estuviera
  // marcado: si no, no habría forma de desmarcarlo.
  const canToggle = aired || watched;

  return (
    <div className="surface overflow-hidden flex flex-col">
      <div className="relative aspect-video bg-border-card overflow-hidden">
        {episode?.still_path ? (
          <img
            src={`${TMDB_STILL_URL}${episode.still_path}`}
            // La de 300 alcanzaba para el recuadro de antes; a todo el ancho de
            // un celular con pantalla 2x se ve borrosa.
            srcSet={`${TMDB_STILL_URL}${episode.still_path} 300w, ${TMDB_STILL_LARGE_URL}${episode.still_path} 780w`}
            sizes="(min-width: 768px) 560px, 90vw"
            alt=""
            loading="lazy"
            className={cn('w-full h-full object-cover', !aired && 'opacity-50')}
          />
        ) : (
          // Sin imagen, el número grande: la tarjeta sigue diciendo cuál es.
          <span
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center font-serif italic font-bold text-6xl text-text-subtle"
          >
            {episodeNumber}
          </span>
        )}
        {/* Las etiquetas van sobre la imagen, no sobre el fondo del tema: el
            velo es siempre negro y el texto siempre blanco, como en la portada
            de la ficha. */}
        <span className="absolute top-2.5 left-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">
          T{seasonNumber} · E{episodeNumber}
        </span>
        {watched && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-accent pl-2 pr-2.5 py-0.5 text-xs font-semibold text-accent-contrast">
            <Check size={13} aria-hidden="true" />
            Visto
          </span>
        )}
      </div>

      <div className={cn('flex flex-col gap-2 p-4', !aired && 'text-text-subtle')}>
        <div>
          <h4 className="text-base font-semibold leading-snug">
            {name}
            {typeLabel && (
              <span className="ml-2 inline-block align-middle rounded-full border border-accent/40 px-2 py-px text-[10px] font-medium uppercase tracking-wide text-accent">
                {typeLabel}
              </span>
            )}
          </h4>
          {meta.length > 0 && (
            <p className="text-xs text-text-subtle mt-0.5">{meta.join(' · ')}</p>
          )}
        </div>

        {overview &&
          (watched || isOverviewShown ? (
            <div className="flex flex-col items-start gap-1">
              <p
                className={cn(
                  'text-sm text-text-muted leading-relaxed',
                  !isOverviewExpanded && 'line-clamp-3',
                )}
              >
                {overview}
              </p>
              {overview.length > LONG_OVERVIEW && (
                <button
                  type="button"
                  aria-expanded={isOverviewExpanded}
                  onClick={() => setIsOverviewExpanded((open) => !open)}
                  className="text-xs text-text-muted underline underline-offset-2 hover:text-text-main"
                >
                  {isOverviewExpanded ? 'Leer menos' : 'Leer más'}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsOverviewShown(true)}
              className="self-start text-xs text-text-muted underline underline-offset-2 hover:text-text-main"
            >
              Mostrar sinopsis
              <span className="sr-only"> del episodio {episodeNumber}</span>
            </button>
          ))}

        {prompt && (
          <div
            role="group"
            aria-label="Episodios anteriores sin ver"
            className="flex flex-col gap-2.5 rounded-control border border-accent/30 bg-accent/10 p-3"
          >
            <p className="text-sm text-text-main">{prompt.question}</p>
            <div className="flex flex-wrap gap-2">
              <button
                ref={confirmRef}
                type="button"
                onClick={prompt.onConfirm}
                className="btn btn-primary px-3 py-2 text-sm"
              >
                Sí, marcarlos
              </button>
              <button
                type="button"
                onClick={prompt.onOnlyThis}
                className="btn btn-secondary px-3 py-2 text-sm"
              >
                Solo este
              </button>
              <button
                type="button"
                onClick={prompt.onCancel}
                className="btn btn-ghost px-3 py-2 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Mientras se contesta la pregunta, "Lo vi" se corre: dos botones
            rojos juntos no dicen cuál es el que hay que tocar. */}
        {!prompt && (
          <button
            ref={toggleRef}
            type="button"
            aria-pressed={watched}
            aria-label={`Lo vi: episodio ${episodeNumber} de ${seasonName}`}
            disabled={!canToggle}
            title={canToggle ? undefined : 'Todavía no salió'}
            onClick={onToggle}
            className={cn(
              'btn w-full min-h-12 text-[15px] font-semibold mt-1',
              watched
                ? 'border border-border-control text-text-main hover:bg-border-card'
                : 'btn-primary',
            )}
          >
            <Check
              size={18}
              aria-hidden="true"
              className={watched ? 'text-accent' : undefined}
            />
            Lo vi
          </button>
        )}

        {/* Se puntúa lo que viste: lo demás no tiene con qué. Con una sola
            tarjeta en pantalla las estrellas van del tamaño del dedo, sin
            plegarlas detrás de un botón como en la lista de antes. */}
        {watched && (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <StarRatingInput
              value={rating ?? 0}
              onChange={onRate}
              legend={`Tu puntaje para ${name}`}
              caption="¿Qué te pareció?"
              size={30}
              clearable
              className="items-start gap-1.5"
            />
            {next && (
              <button
                type="button"
                onClick={next.onGo}
                className="inline-flex items-center gap-0.5 py-2 text-sm font-semibold text-accent hover:underline underline-offset-4"
              >
                {next.label}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
