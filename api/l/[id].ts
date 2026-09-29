import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  PageMeta,
  fetchPublicDocument,
  readIndexHtml,
  restFields,
  restString,
  sendPage,
  withPageMeta,
} from '../_lib/og.js';

/**
 * Sirve el HTML de una lista compartida (`/l/{id}`) con su vista previa: el
 * nombre de la lista, de quién es, cuántos títulos tiene y el póster del
 * primero (ver `_lib/og.ts`).
 */

/** El mismo formato de id que exigen las reglas. */
const LIST_ID = /^[A-Za-z0-9_-]{12,32}$/;

/** Lo que la vista previa muestra de la lista. */
function readList(document: unknown): PageMeta | null {
  const fields = restFields(document);
  if (!fields) return null;
  const name = restString(fields.name).trim();
  if (!name) return null;

  const owner = restString(fields.ownerName).trim() || 'alguien';
  const items = fields.items?.arrayValue?.values ?? [];
  const description = restString(fields.description).trim();
  const count = `${items.length} ${items.length === 1 ? 'título' : 'títulos'}`;

  const poster = items
    .map((item) => restString(item.mapValue?.fields?.posterPath))
    .find((path) => /^\/[\w.-]+$/.test(path));

  return {
    title: `${name} — una lista de ${owner} en Qué Miro?`,
    description: description ? `${count}. ${description}` : `${count}, para ver.`,
    // El póster del primero con imagen: el que eligió ponerlo arriba. Los de
    // TMDB son de 2:3.
    ...(poster
      ? { image: { url: `https://image.tmdb.org/t/p/w780${poster}`, width: 780, height: 1170 } }
      : {}),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? '').trim();

  let html: string;
  try {
    html = await readIndexHtml();
  } catch (error) {
    console.error('[lista compartida] No se encontró el index.html:', error);
    return res.status(500).send('No se pudo servir la página.');
  }

  const meta = LIST_ID.test(id) ? readList(await fetchPublicDocument(`public_lists/${id}`)) : null;
  return sendPage(res, meta ? withPageMeta(html, meta) : html);
}
