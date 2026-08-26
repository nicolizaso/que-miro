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

/** "mar 2026". Para ejes y listas donde el día no aporta. */
export function formatMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });
}
