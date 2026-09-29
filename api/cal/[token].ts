import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FEED_TOKEN, Feed, buildIcs, parseFeedDocument } from '../_lib/ics.js';

/**
 * `/cal/{token}.ics`: el calendario de próximos episodios para suscribirse
 * desde Google Calendar, Apple Calendar u Outlook (ver el rewrite en
 * `vercel.json`).
 *
 * El documento se lee por la API REST de Firestore, igual que el perfil
 * público: `calendar_feeds` se puede leer de a uno sin sesión, así que no
 * hacen falta credenciales de servidor. Lo que no existe —un token mal
 * copiado o uno que se regeneró— es un 404: el calendario externo deja de
 * mostrar esos eventos.
 */

function plainText(res: VercelResponse, status: number, message: string) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(status).send(message);
}

async function fetchFeed(token: string): Promise<Feed | null> {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  // La misma base con nombre que use la app, si usa una.
  const database = process.env.VITE_FIREBASE_DATABASE_ID?.trim() || '(default)';

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(
      database,
    )}/documents/calendar_feeds/${token}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore respondió ${response.status}.`);
  return parseFeedDocument(await response.json());
}

/** El origen de la app, para enlazar las fichas desde cada evento. */
function appOrigin(req: VercelRequest): string | undefined {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return undefined;
  const protocol = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim();
  return `${protocol === 'http' ? 'http' : 'https'}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Se valida antes de armar la URL de Firestore: con el formato cerrado no
  // hay forma de pedir otra colección ni otro documento.
  const token = String(req.query.token ?? '').replace(/\.ics$/, '');
  if (!FEED_TOKEN.test(token)) {
    return plainText(res, 404, 'No existe este calendario.');
  }

  let feed: Feed | null;
  try {
    feed = await fetchFeed(token);
  } catch (error) {
    console.error('[calendario] No se pudo leer el documento:', error);
    return plainText(res, 502, 'No pudimos armar el calendario.');
  }
  if (!feed) return plainText(res, 404, 'No existe este calendario.');

  const stamp = feed.updatedAt ? new Date(feed.updatedAt) : new Date();
  const ics = buildIcs(feed.events, {
    stamp: Number.isNaN(stamp.getTime()) ? new Date() : stamp,
    appOrigin: appOrigin(req),
  });

  // Poco tiempo en el borde y sin servir copias vencidas: regenerar el link
  // tiene que revocar el anterior, y un calendario viejo cacheado una hora
  // seguiría andando todo ese rato.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="que-miro.ics"');
  // La dirección es el secreto: que no quede en el índice de ningún buscador.
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(200).send(ics);
}
