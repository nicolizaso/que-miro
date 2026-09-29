import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  RestFields,
  fetchPublicDocument,
  readIndexHtml,
  restFields,
  restNumber,
  restString,
  sendPage,
  withPageMeta,
} from '../_lib/og.js';

/**
 * Sirve el HTML del perfil público con sus meta tags ya resueltos (ver
 * `_lib/og.ts`).
 */

interface ProfileSummary {
  displayName: string;
  watches: number;
  averageRating: number;
  timeLabel: string;
}

/** Lo que la vista previa muestra del perfil. */
function readProfile(document: unknown): ProfileSummary | null {
  const fields = restFields(document);
  if (!fields) return null;
  const summary: RestFields = fields.summary?.mapValue?.fields ?? {};

  return {
    displayName: restString(fields.displayName) || 'Alguien',
    watches: restNumber(summary.watches),
    averageRating: restNumber(summary.averageRating),
    timeLabel: restString(summary.timeLabel),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = String(req.query.slug ?? '').trim();

  let html: string;
  try {
    html = await readIndexHtml();
  } catch (error) {
    console.error('[perfil público] No se encontró el index.html:', error);
    return res.status(500).send('No se pudo servir la página.');
  }

  // Solo slugs con la forma que acepta la app: nada que sirva para pedir
  // otro documento.
  const profile = /^[a-z0-9-]{3,24}$/.test(slug)
    ? readProfile(await fetchPublicDocument(`public_profiles/${slug}`))
    : null;

  if (profile) {
    const title = `La biblioteca de ${profile.displayName} — Qué Miro?`;
    const description = profile.watches
      ? `${profile.watches} ${
          profile.watches === 1 ? 'título visto' : 'títulos vistos'
        }, ${profile.timeLabel} mirando, promedio ${profile.averageRating
          .toString()
          .replace('.', ',')}.`
      : 'Su biblioteca de películas y series en Qué Miro?';
    html = withPageMeta(html, { title, description });
  }

  return sendPage(res, html);
}
