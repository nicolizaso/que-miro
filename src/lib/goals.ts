import { Goals, SavedMedia, YearGoal } from '@/types';
import { allWatches, datedEpisodes, minutesInYear } from '@/lib/stats';

/**
 * Metas anuales y rachas semanales.
 *
 * Todo es cálculo sobre la biblioteca: la meta dice cuánto te propusiste, y lo
 * hecho se cuenta cada vez desde el historial y los episodios con fecha. Así
 * no hay un contador que se desincronice —borrar una reseña resta sola— y
 * cambiar la meta a mitad de año no pierde nada.
 */

export const GOAL_KINDS = ['movies', 'series', 'hours'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** Topes para lo que se puede escribir: más que esto es un error de tipeo. */
export const GOAL_LIMITS: Record<GoalKind, number> = {
  movies: 1000,
  series: 500,
  hours: 5000,
};

const UNITS: Record<GoalKind, [string, string]> = {
  movies: ['película', 'películas'],
  series: ['serie', 'series'],
  hours: ['hora', 'horas'],
};

/** "1 película", "3 películas". */
export function goalUnit(kind: GoalKind, count: number): string {
  const [one, many] = UNITS[kind];
  return `${count} ${count === 1 ? one : many}`;
}

export const GOAL_LABELS: Record<GoalKind, string> = {
  movies: 'Películas',
  series: 'Series',
  hours: 'Horas',
};

export function emptyGoals(): Goals {
  return { byYear: {}, updatedAt: new Date(0).toISOString() };
}

/** Una meta válida: un entero entre 1 y el tope. Lo demás es "sin meta". */
function parseTarget(value: unknown, kind: GoalKind): number | undefined {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > GOAL_LIMITS[kind]) return undefined;
  return number;
}

function parseYearGoal(value: unknown): YearGoal | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const goal: YearGoal = {};
  for (const kind of GOAL_KINDS) {
    const target = parseTarget(raw[kind], kind);
    if (target !== undefined) goal[kind] = target;
  }
  return Object.keys(goal).length > 0 ? goal : null;
}

/**
 * Valida las metas vengan de donde vengan: Firestore, `localStorage` o un
 * backup. Un año sin ninguna meta válida no se guarda.
 */
export function parseGoals(value: unknown): Goals {
  if (typeof value !== 'object' || value === null) return emptyGoals();
  const raw = value as Record<string, unknown>;

  const byYear: Record<string, YearGoal> = {};
  if (typeof raw.byYear === 'object' && raw.byYear !== null) {
    for (const [year, goal] of Object.entries(raw.byYear as Record<string, unknown>)) {
      if (!/^\d{4}$/.test(year)) continue;
      const parsed = parseYearGoal(goal);
      if (parsed) byYear[year] = parsed;
    }
  }

  const updatedAt =
    typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : new Date(0).toISOString();

  return { byYear, updatedAt };
}

/** Si alguna vez se propuso algo. */
export function hasGoals(goals: Goals): boolean {
  return Object.keys(goals.byYear).length > 0;
}

/** El documento de Firestore: ya validado, así que es el mismo objeto. */
export function goalsToDocument(goals: Goals): Record<string, unknown> {
  return { byYear: goals.byYear, updatedAt: goals.updatedAt };
}

export function goalFor(goals: Goals, year: number): YearGoal {
  return goals.byYear[String(year)] ?? {};
}

/** Las metas con la de un año reemplazada. Una meta vacía borra el año. */
export function withYearGoal(goals: Goals, year: number, goal: YearGoal, now = new Date()): Goals {
  const byYear = { ...goals.byYear };
  const parsed = parseYearGoal(goal);
  if (parsed) byYear[String(year)] = parsed;
  else delete byYear[String(year)];
  return { byYear, updatedAt: now.toISOString() };
}

// --- Progreso ---------------------------------------------------------------

/** Cuánto pasó del año, de 0 a 1, en la zona horaria del dispositivo. */
export function yearFraction(year: number, now = new Date()): number {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  if (now.getTime() <= start) return 0;
  if (now.getTime() >= end) return 1;
  return (now.getTime() - start) / (end - start);
}

/** Lo hecho en un año: películas y series terminadas, y horas mirando. */
export function doneInYear(list: SavedMedia[], year: number): Record<GoalKind, number> {
  const watches = allWatches(list).filter(
    ({ entry }) => new Date(entry.completedAt).getFullYear() === year,
  );
  return {
    movies: watches.filter(({ media }) => media.mediaType === 'movie').length,
    series: watches.filter(({ media }) => media.mediaType === 'tv').length,
    hours: Math.floor(minutesInYear(list, year) / 60),
  };
}

export interface GoalProgress {
  kind: GoalKind;
  target: number;
  done: number;
  /** Lo que "tocaba" a esta altura del año, si el ritmo fuera parejo. */
  expected: number;
  /** Lo hecho menos lo esperado: positivo es ir adelantado. */
  ahead: number;
  met: boolean;
}

/** Cómo venís con cada meta del año, en el orden películas, series, horas. */
export function goalProgress(
  list: SavedMedia[],
  goals: Goals,
  year: number,
  now = new Date(),
): GoalProgress[] {
  const goal = goalFor(goals, year);
  const done = doneInYear(list, year);
  const fraction = yearFraction(year, now);

  return GOAL_KINDS.flatMap((kind) => {
    const target = goal[kind];
    if (!target) return [];
    const expected = target * fraction;
    return [
      {
        kind,
        target,
        done: done[kind],
        expected,
        ahead: done[kind] - expected,
        met: done[kind] >= target,
      },
    ];
  });
}

/**
 * El ritmo en una frase: "Vas 3 películas arriba del ritmo".
 *
 * "Arriba" y "abajo" del ritmo y no "adelantado" o "atrasado": son
 * adjetivos que se conjugan con quien lee, y la app no sabe con quién habla.
 * Menos de media unidad de diferencia es ir al ritmo: nadie va "0 películas
 * arriba".
 */
export function paceLabel(progress: GoalProgress): string {
  if (progress.met) return `Cumpliste: ${goalUnit(progress.kind, progress.done)}.`;
  const gap = Math.round(Math.abs(progress.ahead));
  if (gap === 0) return 'Vas justo al ritmo.';
  return progress.ahead > 0
    ? `Vas ${goalUnit(progress.kind, gap)} arriba del ritmo.`
    : `Vas ${goalUnit(progress.kind, gap)} abajo del ritmo.`;
}

// --- Rachas -----------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * El número de semana ISO de una fecha, contado desde 1970, en la zona
 * horaria del dispositivo.
 *
 * Se cuenta desde el día del calendario y no desde el instante: un domingo a
 * las 23:30 es domingo aunque en UTC ya sea lunes. El 1/1/1970 fue jueves, así
 * que el lunes de esa semana es el día -3.
 */
export function weekIndex(date: Date): number {
  const day = Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
  return Math.floor((day + 3) / 7);
}

/**
 * El año ISO de una semana: el de su jueves, como manda la norma. La semana
 * `i` arranca el lunes `7i - 3`, así que su jueves es el día `7i`.
 */
export function weekYear(index: number): number {
  return new Date(index * 7 * DAY_MS).getUTCFullYear();
}

/** Las semanas con actividad: algo terminado o un episodio visto. */
function activeWeeks(list: SavedMedia[]): number[] {
  const weeks = new Set<number>();
  for (const { entry } of allWatches(list)) {
    const date = new Date(entry.completedAt);
    if (!Number.isNaN(date.getTime())) weeks.add(weekIndex(date));
  }
  for (const episode of datedEpisodes(list)) weeks.add(weekIndex(episode.watchedAt));
  return Array.from(weeks).sort((a, b) => a - b);
}

/** La tirada más larga de semanas seguidas en una lista ordenada. */
function longestRun(weeks: number[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < weeks.length; i++) {
    run = i > 0 && weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export interface Streaks {
  /** Semanas seguidas hasta esta, o hasta la pasada si esta todavía no arrancó. */
  current: number;
  best: number;
  /** Si esta semana ya tiene algo: si no, la racha está en juego. */
  activeThisWeek: boolean;
}

/**
 * La racha actual y la mejor.
 *
 * Una semana que todavía no tiene nada no corta la racha: un lunes a la
 * mañana no tendría sentido decirle a nadie que la perdió. Se corta recién
 * cuando termina una semana entera sin nada.
 */
export function weeklyStreaks(list: SavedMedia[], now = new Date()): Streaks {
  const weeks = activeWeeks(list);
  const present = new Set(weeks);
  const thisWeek = weekIndex(now);
  const activeThisWeek = present.has(thisWeek);

  let current = 0;
  for (let week = activeThisWeek ? thisWeek : thisWeek - 1; present.has(week); week--) {
    current++;
  }

  return { current, best: longestRun(weeks), activeThisWeek };
}

/** La mejor racha dentro de un año ISO: la del resumen del año. */
export function bestStreakInYear(list: SavedMedia[], year: number): number {
  return longestRun(activeWeeks(list).filter((week) => weekYear(week) === year));
}
