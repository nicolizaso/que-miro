const LOCALE = 'es-AR';

/** "12 de marzo de 2026". Se usa en el historial y en el perfil. */
export function formatWatchDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * El día de una fecha, `YYYY-MM-DD`, en la zona horaria del dispositivo.
 *
 * Es la forma en que TMDB da las fechas de emisión, así que comparar dos días
 * es comparar dos textos. Local y no UTC a propósito: "ya salió" se decide
 * con el calendario de quien mira, no con el de Greenwich.
 */
export function toDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * El día de TMDB como fecha local, a las 00:00.
 *
 * `new Date('2026-10-03')` lo lee como medianoche en UTC, que en Buenos Aires
 * es el día anterior a las 21: un episodio que sale el 3 se mostraría el 2.
 */
export function fromDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "3 de octubre de 2026", para un día de TMDB, sin mover zonas horarias. */
export function formatDay(dayKey: string): string {
  if (!isDayKey(dayKey)) return '';
  return fromDayKey(dayKey).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "jueves 3 de octubre", para un día de TMDB cercano, sin el año. */
export function formatWeekday(dayKey: string): string {
  if (!isDayKey(dayKey)) return '';
  return fromDayKey(dayKey).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "3 oct", para listas donde el año se sobreentiende. */
export function formatShortDay(dayKey: string): string {
  if (!isDayKey(dayKey)) return '';
  return fromDayKey(dayKey).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
  });
}

/** Si un texto tiene forma de día de TMDB, `YYYY-MM-DD`. */
export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** "mar 2026". Para ejes y listas donde el día no aporta. */
export function formatMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });
}
