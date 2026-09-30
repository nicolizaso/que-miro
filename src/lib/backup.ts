import {
  Collection,
  Following,
  Goals,
  Restrictions,
  SavedMedia,
  SocialSettings,
  Subscriptions,
  TastePicks,
} from '@/types';
import {
  SCHEMA_VERSION,
  parseCollection,
  parseMediaList,
  toStoredMedia,
} from '@/lib/schema';
import { hasPicks, parsePicks } from '@/lib/picks';
import { hasGoals, parseGoals } from '@/lib/goals';
import { hasSubscriptions, parseSubscriptions } from '@/lib/subscriptions';
import { hasRestrictions, parseRestrictions } from '@/lib/restrictions';
import { hasFollowing, parseFollowing } from '@/lib/following';
import { hasSocialSettings, isValidHandle, parseSocialSettings } from '@/lib/social';
import { progressPercent, watchedEpisodes } from '@/lib/progress';

export { SCHEMA_VERSION };

export interface LibraryBackup {
  /** Marca de formato, para no intentar importar un JSON cualquiera. */
  app: 'que-miro';
  version: number;
  exportedAt: string;
  /**
   * Los títulos, en el formato de Firestore (ver `toStoredMedia`) y no en el
   * del store: es lo que entiende también una versión vieja de la app.
   */
  media: Record<string, unknown>[];
  collections?: Collection[];
  /** Las respuestas de "Contanos de vos", si había alguna. */
  picks?: TastePicks;
  /** Las metas por año, si había alguna. */
  goals?: Goals;
  /** Las plataformas que se pagan, si había alguna. */
  subscriptions?: Subscriptions;
  /** Lo que no interesa que se recomiende, si había algo. */
  restrictions?: Restrictions;
  /** Los perfiles que se siguen, si había alguno. */
  following?: Following;
  /** Qué se comparte, a quién se silenció: si se tocó algo. */
  social?: SocialSettings;
  /**
   * A quiénes seguías con tu cuenta. Las relaciones son de dos personas y
   * no se restauran tal cual: al importar se los vuelve a seguir (y a una
   * cuenta privada se le vuelve a pedir).
   */
  followedAccounts?: FollowedAccount[];
}

/** Alguien que seguías, como va en el backup. */
export interface FollowedAccount {
  uid: string;
  /** Para leerlo en el archivo; vacío si no se sabía. Se sigue por el uid. */
  handle: string;
}

/** Lo social que va al backup, aparte de la biblioteca. */
export interface SocialBackup {
  settings?: SocialSettings;
  followed?: FollowedAccount[];
}

function parseFollowedAccounts(value: unknown): FollowedAccount[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      uid: typeof item.uid === 'string' ? item.uid : '',
      handle: typeof item.handle === 'string' ? item.handle : '',
    }))
    .filter((item) => item.uid.length > 0 && item.uid.length <= 128)
    .map((item) => ({ ...item, handle: isValidHandle(item.handle) ? item.handle : '' }))
    .slice(0, 500);
}

/** Error de importación con un mensaje pensado para mostrarle a la persona. */
export class ImportError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Arma el objeto que se descarga como backup. */
export function buildBackup(
  media: SavedMedia[],
  collections: Collection[] = [],
  picks?: TastePicks,
  goals?: Goals,
  subscriptions?: Subscriptions,
  following?: Following,
  social: SocialBackup = {},
  restrictions?: Restrictions,
): LibraryBackup {
  return {
    app: 'que-miro',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    // Con el mismo formato que Firestore: un backup de esta versión que se
    // importa en una vieja deja lo archivado en Viendo, en vez de en Por Ver.
    media: media.map(toStoredMedia),
    collections,
    // Un cuestionario en blanco no se escribe: el archivo no gana nada con
    // siete campos vacíos adentro, y el importador lo trataría como una
    // respuesta más.
    ...(picks && hasPicks(picks) ? { picks } : {}),
    // Lo mismo con las metas: sin ninguna, no van.
    ...(goals && hasGoals(goals) ? { goals } : {}),
    ...(subscriptions && hasSubscriptions(subscriptions) ? { subscriptions } : {}),
    ...(restrictions && hasRestrictions(restrictions) ? { restrictions } : {}),
    ...(following && hasFollowing(following) ? { following } : {}),
    ...(social.settings && hasSocialSettings(social.settings) ? { social: social.settings } : {}),
    ...(social.followed?.length ? { followedAccounts: social.followed } : {}),
  };
}

export interface ParsedBackup {
  media: SavedMedia[];
  collections: Collection[];
  /** `null` si el archivo no traía cuestionario: un backup de antes de QM-3. */
  picks: TastePicks | null;
  /** `null` si no traía metas. */
  goals: Goals | null;
  /** `null` si no traía suscripciones. */
  subscriptions: Subscriptions | null;
  /** `null` si no traía restricciones. */
  restrictions: Restrictions | null;
  /** `null` si no traía perfiles seguidos. */
  following: Following | null;
  /** `null` si no traía configuración social. */
  social: SocialSettings | null;
  /** A quiénes seguía la cuenta; vacío si no traía. */
  followedAccounts: FollowedAccount[];
  /** Títulos descartados por estar incompletos o corruptos. */
  skipped: number;
}

/**
 * Lee el contenido de un archivo de backup.
 *
 * Un backup de una versión vieja del schema se acepta y se migra: la migración
 * la hace `parseMedia`, que es el mismo camino por el que entran los documentos
 * de Firestore. Uno de una versión más nueva se rechaza, porque no hay forma de
 * adivinar hacia atrás.
 *
 * @throws {ImportError} con un mensaje ya listo para mostrar.
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

  const { media, skipped } = parseMediaList(raw.media);
  const collections = Array.isArray(raw.collections)
    ? raw.collections
        .map(parseCollection)
        .filter((collection): collection is Collection => collection !== null)
    : [];

  const picks = raw.picks === undefined ? null : parsePicks(raw.picks);
  const goals = raw.goals === undefined ? null : parseGoals(raw.goals);
  const subscriptions =
    raw.subscriptions === undefined ? null : parseSubscriptions(raw.subscriptions);
  const restrictions =
    raw.restrictions === undefined ? null : parseRestrictions(raw.restrictions);
  const following = raw.following === undefined ? null : parseFollowing(raw.following);
  const social = raw.social === undefined ? null : parseSocialSettings(raw.social);

  return {
    media,
    collections,
    picks: picks && hasPicks(picks) ? picks : null,
    goals: goals && hasGoals(goals) ? goals : null,
    subscriptions: subscriptions && hasSubscriptions(subscriptions) ? subscriptions : null,
    restrictions: restrictions && hasRestrictions(restrictions) ? restrictions : null,
    following: following && hasFollowing(following) ? following : null,
    social: social && hasSocialSettings(social) ? social : null,
    followedAccounts: parseFollowedAccounts(raw.followedAccounts),
    skipped,
  };
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
  'plataformas',
  'incluido_en',
  'veces_visto',
  'puntaje',
  'tags',
  'resena',
  'episodios_vistos',
  'progreso',
  'agregado',
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
 * Es de ida nada más: aplana el historial a su entrada más reciente y el
 * progreso a un porcentaje. El JSON es el que conserva toda la estructura y el
 * único que el importador acepta.
 */
export function toCsv(media: SavedMedia[]): string {
  const rows = media.map((item) => {
    const latest = item.history?.[0];
    const isSeries = item.mediaType === 'tv';

    return [
      csvCell(item.title),
      csvCell(isSeries ? 'Serie' : 'Película'),
      csvCell(item.releaseYear),
      csvCell(item.status),
      csvCell(item.genres.join(', ')),
      csvCell(item.providers?.join(', ')),
      csvCell(item.streaming?.join(', ')),
      csvCell(item.history?.length ?? 0),
      csvCell(latest?.rating),
      csvCell(latest?.tags?.join(', ')),
      csvCell(latest?.text),
      csvCell(isSeries ? watchedEpisodes(item) : ''),
      csvCell(isSeries ? `${progressPercent(item)}%` : ''),
      csvCell(item.addedAt),
      csvCell(item.updatedAt),
    ].join(',');
  });

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
