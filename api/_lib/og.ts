import type { VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Páginas públicas con su vista previa resuelta del lado del servidor.
 *
 * La app es un SPA: los scrapers de redes sociales no ejecutan JavaScript, así
 * que cualquier `<meta>` que escriba React llega tarde. Las funciones de
 * `api/u` y `api/l` devuelven el mismo `index.html` de siempre, pero con el
 * título, la descripción y las etiquetas Open Graph reemplazados. React monta
 * después y toma el control como en cualquier otra ruta.
 *
 * Los documentos se leen por la API REST de Firestore y no con el SDK de
 * admin: lo público se puede leer sin sesión por diseño, así que no hacen
 * falta credenciales de servidor.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reemplaza el contenido de un meta tag, o lo deja igual si no existe. */
export function setMeta(html: string, attribute: string, name: string, content: string): string {
  const pattern = new RegExp(`(<meta\\s+${attribute}="${name}"\\s+content=")[^"]*(")`, 'i');
  return html.replace(pattern, `$1${escapeHtml(content)}$2`);
}

export interface PageMeta {
  title: string;
  description: string;
  /** Absoluta: varios scrapers no resuelven rutas relativas. */
  image?: { url: string; width: number; height: number };
}

/** El `index.html` con el título, la descripción y la imagen de la página. */
export function withPageMeta(html: string, { title, description, image }: PageMeta): string {
  let result = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  result = setMeta(result, 'name', 'description', description);
  result = setMeta(result, 'property', 'og:title', title);
  result = setMeta(result, 'property', 'og:description', description);
  result = setMeta(result, 'name', 'twitter:title', title);
  result = setMeta(result, 'name', 'twitter:description', description);
  if (image) {
    result = setMeta(result, 'property', 'og:image', image.url);
    result = setMeta(result, 'property', 'og:image:width', String(image.width));
    result = setMeta(result, 'property', 'og:image:height', String(image.height));
    result = setMeta(result, 'name', 'twitter:image', image.url);
    // Una imagen vertical recortada en la tarjeta grande de Twitter se ve
    // rota: con una así va la chica, que la muestra entera.
    if (image.height > image.width) result = setMeta(result, 'name', 'twitter:card', 'summary');
  }
  return result;
}

export async function readIndexHtml(): Promise<string> {
  return readFile(path.join(process.cwd(), 'dist', 'index.html'), 'utf8');
}

/** La URL REST de un documento, en la base que use la app. `null` sin proyecto configurado. */
export function firestoreDocumentUrl(documentPath: string): string | null {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  const database = process.env.VITE_FIREBASE_DATABASE_ID?.trim() || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/databases/${encodeURIComponent(database)}/documents/${documentPath}`;
}

/** Un documento público, crudo como lo da la API REST; `null` si no existe o no se pudo leer. */
export async function fetchPublicDocument(documentPath: string): Promise<unknown | null> {
  const url = firestoreDocumentUrl(documentPath);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('[páginas públicas] No se pudo leer el documento:', error);
    return null;
  }
}

/**
 * Manda la página. Corto en el borde: lo publicado cambia cuando su dueño
 * republica, no en cada visita.
 */
export function sendPage(res: VercelResponse, html: string) {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}

/** Lectores de valores de la API REST, donde cada uno viene envuelto en su tipo. */
export type RestFields = Record<string, RestValue | undefined>;
export interface RestValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  mapValue?: { fields?: RestFields };
  arrayValue?: { values?: RestValue[] };
}

export function restFields(document: unknown): RestFields | null {
  const fields = (document as { fields?: RestFields } | null)?.fields;
  return fields ?? null;
}

export function restString(value: RestValue | undefined): string {
  return value?.stringValue ?? '';
}

export function restNumber(value: RestValue | undefined): number {
  return Number(value?.integerValue ?? value?.doubleValue ?? 0) || 0;
}

/** Lo que la vista previa muestra de una cuenta sin perfil publicado. */
export function accountMeta(handle: string, account: { displayName: string; isPrivate: boolean; bio: string }) {
  return {
    title: `${account.displayName} (@${handle}) — Qué Miro?`,
    description: account.isPrivate
      ? 'Cuenta privada en Qué Miro?.'
      : account.bio || 'Su biblioteca de películas y series en Qué Miro?',
  };
}
