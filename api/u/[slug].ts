import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Sirve el HTML del perfil público con sus meta tags ya resueltos.
 *
 * La app es un SPA: los scrapers de redes sociales no ejecutan JavaScript, así
 * que cualquier `<meta>` que escriba React llega tarde. Esta función devuelve
 * el mismo `index.html` de siempre, pero con el título, la descripción y las
 * etiquetas Open Graph reemplazados del lado del servidor. React monta después
 * y toma el control como en cualquier otra ruta.
 *
 * El perfil se lee por la API REST de Firestore en vez de con el SDK de admin:
 * `public_profiles` es de lectura anónima por diseño, así que no hacen falta
 * credenciales de servidor ni una dependencia más.
 */

interface ProfileSummary {
  displayName: string;
  watches: number;
  averageRating: number;
  timeLabel: string;
}

/** Convierte un documento REST de Firestore a algo usable. */
function readProfile(document: unknown): ProfileSummary | null {
  const fields = (document as { fields?: Record<string, any> })?.fields;
  if (!fields) return null;

  const summary = fields.summary?.mapValue?.fields ?? {};
  const numberOf = (field: any) =>
    Number(field?.integerValue ?? field?.doubleValue ?? 0);

  return {
    displayName: fields.displayName?.stringValue || 'Alguien',
    watches: numberOf(summary.watches),
    averageRating: numberOf(summary.averageRating),
    timeLabel: summary.timeLabel?.stringValue || '',
  };
}

async function fetchProfile(slug: string): Promise<ProfileSummary | null> {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  try {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/public_profiles/${encodeURIComponent(
        slug,
      )}`,
    );
    if (!response.ok) return null;
    return readProfile(await response.json());
  } catch (error) {
    console.error('[perfil público] No se pudo leer el documento:', error);
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reemplaza el contenido de un meta tag, o lo deja igual si no existe. */
function setMeta(html: string, attribute: string, name: string, content: string) {
  const pattern = new RegExp(
    `(<meta\\s+${attribute}="${name}"\\s+content=")[^"]*(")`,
    'i',
  );
  return html.replace(pattern, `$1${escapeHtml(content)}$2`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = String(req.query.slug ?? '').trim();

  let html: string;
  try {
    html = await readFile(path.join(process.cwd(), 'dist', 'index.html'), 'utf8');
  } catch (error) {
    console.error('[perfil público] No se encontró el index.html:', error);
    return res.status(500).send('No se pudo servir la página.');
  }

  const profile = slug ? await fetchProfile(slug) : null;

  if (profile) {
    const title = `La biblioteca de ${profile.displayName} — Qué Miro?`;
    const description = profile.watches
      ? `${profile.watches} ${
          profile.watches === 1 ? 'título visto' : 'títulos vistos'
        }, ${profile.timeLabel} mirando, promedio ${profile.averageRating
          .toString()
          .replace('.', ',')}.`
      : 'Su biblioteca de películas y series en Qué Miro?';

    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    html = setMeta(html, 'name', 'description', description);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'property', 'og:description', description);
    html = setMeta(html, 'name', 'twitter:title', title);
    html = setMeta(html, 'name', 'twitter:description', description);
  }

  // Corto en el borde: el perfil es una instantánea que cambia cuando su dueño
  // decide volver a publicarlo, no en cada visita.
  res.setHeader(
    'Cache-Control',
    'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
