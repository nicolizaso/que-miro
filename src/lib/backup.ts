import { MediaStatus, MediaType, Review, SavedMedia } from '@/types';

/**
 * Versión del formato de la biblioteca.
 *
 * Sube cada vez que cambia la forma de `SavedMedia`. El importador usa este
 * número para saber qué migraciones aplicarle a un archivo viejo, así un export
 * hecho hoy se sigue pudiendo importar dentro de varias versiones.
 */
export const SCHEMA_VERSION = 1;

export interface LibraryBackup {
  /** Marca de formato, para no intentar importar un JSON cualquiera. */
  app: 'que-miro';
  version: number;
  exportedAt: string;
  media: SavedMedia[];
}

const VALID_STATUSES: MediaStatus[] = ['por_ver', 'viendo', 'completada'];
const VALID_TYPES: MediaType[] = ['movie', 'tv'];

/** Error de importación con un mensaje pensado para mostrarle a la persona. */
export class ImportError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseReview(value: unknown): Review | undefined {
  if (!isRecord(value)) return undefined;

  const rating = Number(value.rating);
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return undefined;

  const completedAt =
    typeof value.completedAt === 'string' && !Number.isNaN(Date.parse(value.completedAt))
      ? value.completedAt
      : new Date().toISOString();

  return {
    rating,
    text: typeof value.text === 'string' && value.text ? value.text : undefined,
    completedAt,
  };
}

/**
 * Valida y normaliza un título del archivo importado.
 *
 * Devuelve `null` en vez de tirar: un título corrupto no debería hacer fallar
 * la importación entera, se descarta y se informa cuántos quedaron afuera.
 */
export function parseMediaEntry(value: unknown): SavedMedia | null {
  if (!isRecord(value)) return null;

  const tmdbId = Number(value.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const mediaType = value.mediaType as MediaType;
  if (!VALID_TYPES.includes(mediaType)) return null;

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) return null;

  const status = VALID_STATUSES.includes(value.status as MediaStatus)
    ? (value.status as MediaStatus)
    : 'por_ver';

  const updatedAt =
    typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt))
      ? value.updatedAt
      : new Date().toISOString();

  const review = parseReview(value.review);

  return {
    tmdbId,
    mediaType,
    title,
    posterPath: typeof value.posterPath === 'string' ? value.posterPath : null,
    backdropPath:
      typeof value.backdropPath === 'string' ? value.backdropPath : null,
    releaseYear:
      typeof value.releaseYear === 'string' ? value.releaseYear : '',
    genres: Array.isArray(value.genres)
      ? value.genres.filter((genre): genre is string => typeof genre === 'string')
      : [],
    // Una reseña implica que el título está terminado, aunque el archivo diga
    // otra cosa: es la misma regla que aplica el store al guardar una.
    status: review ? 'completada' : status,
    updatedAt,
    review,
  };
}

/** Arma el objeto que se descarga como backup. */
export function buildBackup(media: SavedMedia[]): LibraryBackup {
  return {
    app: 'que-miro',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    media,
  };
}

export interface ParsedBackup {
  media: SavedMedia[];
  /** Títulos descartados por estar incompletos o corruptos. */
  skipped: number;
}

/**
 * Lee el contenido de un archivo de backup.
 *
 * @throws {ImportError} si el archivo no es un backup de Qué Miro, o si es de
 * una versión del formato que esta build todavía no sabe leer.
 */
export function parseBackup(contents: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    throw new ImportError('El archivo no es un JSON válido.');
  }

  if (!isRecord(raw) || raw.app !== 'que-miro' || !Array.isArray(raw.media)) {
    throw new ImportError(
      'Este archivo no parece un backup de Qué Miro. Usá el que descargaste desde tu perfil.',
    );
  }

  const version = Number(raw.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new ImportError('El archivo no declara una versión válida.');
  }
  if (version > SCHEMA_VERSION) {
    throw new ImportError(
      `El backup es de una versión más nueva de la app (v${version}). Actualizá la página e intentá de nuevo.`,
    );
  }

  const media: SavedMedia[] = [];
  let skipped = 0;
  for (const entry of raw.media) {
    const parsed = parseMediaEntry(entry);
    if (parsed) media.push(parsed);
    else skipped++;
  }

  return { media, skipped };
}

export interface MergeResult {
  media: SavedMedia[];
  added: number;
  updated: number;
}

/**
 * Fusiona el backup con la biblioteca actual sin perder nada.
 *
 * Ante un título repetido gana el que se modificó más tarde. Es la regla menos
 * sorpresiva: importar un backup viejo no debería pisar reseñas nuevas.
 */
export function mergeLibraries(
  current: SavedMedia[],
  incoming: SavedMedia[],
): MergeResult {
  const byId = new Map(current.map((media) => [media.tmdbId, media]));
  let added = 0;
  let updated = 0;

  for (const media of incoming) {
    const existing = byId.get(media.tmdbId);
    if (!existing) {
      byId.set(media.tmdbId, media);
      added++;
      continue;
    }
    if (new Date(media.updatedAt) > new Date(existing.updatedAt)) {
      byId.set(media.tmdbId, media);
      updated++;
    }
  }

  return { media: Array.from(byId.values()), added, updated };
}

const CSV_HEADERS = [
  'titulo',
  'tipo',
  'anio',
  'estado',
  'generos',
  'puntaje',
  'resena',
  'actualizado',
] as const;

/** Escapa un campo para CSV: comillas dobles y todo entre comillas. */
function csvCell(value: string | number | undefined): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Exporta a CSV para abrir en una planilla.
 *
 * Es de ida nada más: el importador solo acepta el JSON, que es el formato que
 * conserva toda la estructura.
 */
export function toCsv(media: SavedMedia[]): string {
  const rows = media.map((item) =>
    [
      csvCell(item.title),
      csvCell(item.mediaType === 'movie' ? 'Película' : 'Serie'),
      csvCell(item.releaseYear),
      csvCell(item.status),
      csvCell(item.genres.join(', ')),
      csvCell(item.review?.rating),
      csvCell(item.review?.text),
      csvCell(item.updatedAt),
    ].join(','),
  );

  // BOM al principio para que Excel abra los acentos bien.
  return `\uFEFF${CSV_HEADERS.join(',')}\n${rows.join('\n')}\n`;
}

/** Dispara la descarga de un archivo generado en el navegador. */
export function downloadFile(
  filename: string,
  contents: string,
  mimeType: string,
): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Nombre con fecha, para que dos backups no se pisen en la carpeta. */
export function backupFilename(extension: 'json' | 'csv'): string {
  const date = new Date().toISOString().split('T')[0];
  return `que-miro-${date}.${extension}`;
}
