import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  RestFields,
  accountMeta,
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

/** La tarjeta de la cuenta dueña de ese usuario, si existe. */
async function readAccount(handle: string): Promise<{ displayName: string; isPrivate: boolean; bio: string } | null> {
  const owner = restFields(await fetchPublicDocument(`handles/${handle}`));
  const uid = owner ? restString(owner.uid) : '';
  // Solo uids con la forma de Firebase: nada que sirva para pedir otro documento.
  if (!/^[A-Za-z0-9]{1,128}$/.test(uid)) return null;
  const fields = restFields(await fetchPublicDocument(`accounts/${uid}`));
  if (!fields) return null;
  return {
    displayName: restString(fields.displayName) || handle,
    isPrivate: fields.private?.booleanValue === true,
    bio: restString(fields.bio),
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

  // Sin perfil publicado puede haber igual una cuenta con ese usuario: una
  // privada. La vista previa la nombra, sin nada de su biblioteca.
  const account = !profile && /^[a-z0-9-]{3,24}$/.test(slug) ? await readAccount(slug) : null;

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
  } else if (account) {
    html = withPageMeta(html, accountMeta(slug, account));
  }

  return sendPage(res, html);
}
