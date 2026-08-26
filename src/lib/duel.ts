import { SavedMedia } from '@/types';

/**
 * Puntaje inicial de un título que nunca peleó.
 *
 * Es el estándar de Elo. El valor exacto da igual —lo único que importa son las
 * diferencias— pero arrancar todos iguales es lo que hace que las primeras
 * comparaciones muevan mucho y las siguientes vayan afinando.
 */
export const BASE_SCORE = 1200;

/**
 * Cuánto mueve cada duelo.
 *
 * Alto a propósito: acá no hay miles de partidas como en ajedrez, hay diez o
 * quince comparaciones. Con un K chico el ranking no se separaría nunca de
 * {@link BASE_SCORE}.
 */
const K = 48;

/** El puntaje actual de un título. */
export function scoreOf(media: SavedMedia): number {
  return media.duelScore ?? BASE_SCORE;
}

/** Probabilidad de que `a` le gane a `b`, según la fórmula de Elo. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export interface DuelResult {
  winner: { tmdbId: number; duelScore: number };
  loser: { tmdbId: number; duelScore: number };
}

/**
 * Resuelve un duelo y devuelve los puntajes nuevos.
 *
 * Ganarle a algo que ya estaba arriba suma mucho; ganarle a algo que estaba
 * abajo suma poco. Es lo que hace que el ranking converja rápido sin necesidad
 * de comparar todos contra todos.
 */
export function resolveDuel(winner: SavedMedia, loser: SavedMedia): DuelResult {
  const winnerScore = scoreOf(winner);
  const loserScore = scoreOf(loser);
  const expected = expectedScore(winnerScore, loserScore);
  const delta = Math.round(K * (1 - expected));

  return {
    winner: { tmdbId: winner.tmdbId, duelScore: winnerScore + delta },
    loser: { tmdbId: loser.tmdbId, duelScore: loserScore - delta },
  };
}

/**
 * Elige el próximo par a comparar.
 *
 * Prioriza los títulos con menos duelos encima: un ranking se arma mucho más
 * rápido dándole al menos visto que sorteando al azar, que insistiría con los
 * mismos y dejaría a otros sin puntaje.
 */
export function nextPair(
  pool: SavedMedia[],
  random: () => number = Math.random,
): [SavedMedia, SavedMedia] | null {
  if (pool.length < 2) return null;

  const byDuels = [...pool].sort(
    (a, b) => (a.duelCount ?? 0) - (b.duelCount ?? 0),
  );

  // Se toma el que menos peleó y se lo enfrenta a otro de entre los que menos
  // pelearon, elegido al azar para que la secuencia no sea siempre la misma.
  const first = byDuels[0];
  const contenders = byDuels.slice(1, Math.max(2, Math.ceil(byDuels.length / 2)));
  const second = contenders[Math.floor(random() * contenders.length)];

  return second ? [first, second] : null;
}

/** El ranking, de mejor a peor, solo con los que pelearon alguna vez. */
export function ranking(pool: SavedMedia[]): SavedMedia[] {
  return pool
    .filter((media) => (media.duelCount ?? 0) > 0)
    .sort(
      (a, b) =>
        scoreOf(b) - scoreOf(a) || a.title.localeCompare(b.title, 'es'),
    );
}

/**
 * Cuántos duelos hacen falta para que el ranking signifique algo.
 *
 * Con n títulos, alrededor de n comparaciones alcanzan para separarlos: cada
 * una mueve dos puntajes.
 */
export function suggestedRounds(poolSize: number): number {
  return Math.max(5, poolSize);
}
