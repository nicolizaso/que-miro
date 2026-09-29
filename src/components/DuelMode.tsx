import { useMemo, useState } from 'react';
import { Film, RotateCcw, Trophy, Tv } from 'lucide-react';
import { SavedMedia } from '@/types';
import { useMediaActions } from '@/hooks/useMediaActions';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { nextPair, ranking, resolveDuel, scoreOf, suggestedRounds } from '@/lib/duel';

/** Una de las dos opciones del duelo. */
function Contender({
  media,
  onPick,
}: {
  media: SavedMedia;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      // Sin esto, un lector de pantalla lee "Matrix 1999" y no dice para qué
      // sirve el botón: el nombre accesible tiene que nombrar la acción.
      aria-label={`Elegir ${media.title}`}
      className="group flex-1 flex flex-col gap-2 text-left rounded-surface border border-border-card bg-bg-card overflow-hidden hover:border-accent transition-colors"
    >
      <span className="relative block aspect-[2/3] w-full bg-border-card overflow-hidden">
        {media.posterPath ? (
          <img
            src={`${TMDB_IMAGE_BASE_URL}${media.posterPath}`}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-text-subtle">
            {media.mediaType === 'movie' ? (
              <Film size={40} aria-hidden="true" />
            ) : (
              <Tv size={40} aria-hidden="true" />
            )}
          </span>
        )}
      </span>
      <span className="px-3 pb-3 block">
        <span className="font-semibold leading-snug line-clamp-2 block">
          {media.title}
        </span>
        <span className="text-xs text-text-subtle">{media.releaseYear}</span>
      </span>
    </button>
  );
}

/**
 * Azar reproducible a partir de un número.
 *
 * El par se deriva de la ronda actual, así que tiene que salir igual en cada
 * render de esa ronda: con `Math.random()` el contrincante cambiaría cada vez
 * que el componente se vuelve a dibujar, incluso mientras alguien lo está
 * mirando.
 */
function seededRandom(seed: number): () => number {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

/**
 * Comparaciones de a dos que arman un ranking.
 *
 * Es la respuesta al problema real de una lista larga: nadie puede ordenar
 * cuarenta títulos de una, pero cualquiera puede contestar "¿cuál de estos dos?"
 * treinta veces. El puntaje se acumula con Elo, así que cada respuesta reordena
 * también a los que no aparecieron.
 *
 * El ranking se guarda en el título, así que sobrevive a cerrar la app y se
 * sincroniza como cualquier otro cambio.
 */
export function DuelMode({
  pending: candidates,
  together,
}: {
  pending: SavedMedia[];
  /**
   * De a dos ("¿Qué miramos juntos?"): el ranking vive solo en esta pantalla.
   * Es de los dos y de esta noche, no tiene por qué reordenar tu lista.
   */
  together?: { name: string };
}) {
  const { patchMedia } = useMediaActions();
  const [round, setRound] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [local, setLocal] = useState<Map<string, Pick<SavedMedia, 'duelScore' | 'duelCount'>>>(
    () => new Map(),
  );

  const keyOf = (media: SavedMedia) => `${media.mediaType}:${media.tmdbId}`;
  // De a dos arrancan todos iguales: el puntaje de tu lista no cuenta acá.
  const pending = useMemo(
    () =>
      together
        ? candidates.map((media) => ({
            ...media,
            duelScore: undefined,
            duelCount: undefined,
            ...local.get(keyOf(media)),
          }))
        : candidates,
    [candidates, together, local],
  );

  const board = useMemo(() => ranking(pending), [pending]);
  const target = suggestedRounds(pending.length);

  /**
   * El par se deriva de la biblioteca y de la ronda, en vez de guardarse en el
   * estado.
   *
   * Guardarlo obligaba a acordarse de renovarlo después de cada voto, y bastaba
   * con que las escrituras y el `setState` llegaran en distinto orden para que
   * el duelo se quedara sin par y sin forma de pedir otro. Derivado, la próxima
   * pareja sale sola en cuanto cambia cualquiera de los dos.
   */
  const pair = useMemo(
    () => nextPair(pending, seededRandom(round + 1)),
    [pending, round],
  );

  if (pending.length < 2) {
    return (
      <p className="text-text-muted text-center max-w-sm">
        {together
          ? 'El duelo necesita al menos dos candidatos.'
          : 'El duelo necesita al menos dos títulos en tu lista "Por Ver".'}
      </p>
    );
  }

  const handlePick = async (winner: SavedMedia, loser: SavedMedia) => {
    const result = resolveDuel(winner, loser);

    if (together) {
      setLocal((current) =>
        new Map(current)
          .set(keyOf(winner), { duelScore: result.winner.duelScore, duelCount: (winner.duelCount ?? 0) + 1 })
          .set(keyOf(loser), { duelScore: result.loser.duelScore, duelCount: (loser.duelCount ?? 0) + 1 }),
      );
      setRounds((count) => count + 1);
      setRound((current) => current + 1);
      return;
    }

    await Promise.all([
      patchMedia(result.winner.tmdbId, {
        duelScore: result.winner.duelScore,
        duelCount: (winner.duelCount ?? 0) + 1,
      }),
      patchMedia(result.loser.tmdbId, {
        duelScore: result.loser.duelScore,
        duelCount: (loser.duelCount ?? 0) + 1,
      }),
    ]);

    setRounds((count) => count + 1);
    setRound((current) => current + 1);
  };

  const handleReset = async () => {
    if (together) {
      setLocal(new Map());
      setRounds(0);
      setRound((current) => current + 1);
      return;
    }
    await Promise.all(
      pending
        .filter((media) => (media.duelCount ?? 0) > 0)
        .map((media) =>
          patchMedia(media.tmdbId, { duelScore: undefined, duelCount: undefined }),
        ),
    );
    setRounds(0);
    setRound((current) => current + 1);
  };

  return (
    <div className="w-full flex flex-col items-center gap-8">
      {pair && (
        <div className="w-full flex flex-col items-center gap-4">
          <p className="text-sm text-text-muted">
            {together ? '¿Cuál miran antes?' : '¿Cuál mirarías antes?'}
          </p>
          <div className="flex gap-3 sm:gap-4 w-full max-w-md">
            <Contender
              media={pair[0]}
              onPick={() => handlePick(pair[0], pair[1])}
            />
            <span className="self-center font-serif italic text-text-subtle shrink-0">
              vs
            </span>
            <Contender
              media={pair[1]}
              onPick={() => handlePick(pair[1], pair[0])}
            />
          </div>

          <div className="flex flex-col items-center gap-1">
            <p aria-live="polite" className="text-xs text-text-subtle">
              {rounds === 0
                ? together
                  ? `Con unos ${target} duelos queda claro qué ver.`
                  : `Con unos ${target} duelos tu lista queda ordenada.`
                : `${rounds} de ${target}`}
            </p>
            <button
              onClick={() => setRound((current) => current + 1)}
              className="text-xs text-text-muted hover:text-text-main underline underline-offset-4"
            >
              Ninguno de los dos
            </button>
          </div>
        </div>
      )}

      {board.length > 0 && (
        <section className="w-full flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-bold">
              <Trophy size={16} className="text-accent" aria-hidden="true" />
              {together ? `El ranking de los dos` : 'Tu ranking'}
            </h2>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main transition-colors"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Empezar de nuevo
            </button>
          </div>

          <ol className="flex flex-col gap-1.5">
            {board.slice(0, 10).map((media, index) => (
              <li
                key={keyOf(media)}
                className="flex items-center gap-3 bg-bg-card border border-border-card rounded-control px-3 py-2"
              >
                <span className="w-5 text-sm font-bold text-text-subtle tabular-nums shrink-0">
                  {index + 1}
                </span>
                <span className="flex-1 min-w-0 text-sm truncate">
                  {media.title}
                </span>
                <span className="text-xs text-text-subtle tabular-nums shrink-0">
                  {Math.round(scoreOf(media))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
