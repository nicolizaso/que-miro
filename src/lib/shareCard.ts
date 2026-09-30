/**
 * Generación de la tarjeta que se comparte.
 *
 * La tarjeta se dibuja como SVG y se convierte a PNG en el navegador. No lleva
 * el póster del título a propósito: las imágenes de TMDB vienen de otro origen
 * y contaminarían el canvas, con lo cual `toBlob` tiraría una excepción de
 * seguridad y no habría imagen para compartir. Con tipografía, color y el dato
 * alcanza — y así la tarjeta se genera sin depender de la red.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
/** La vertical de las historias de Instagram y WhatsApp: 9:16. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** Escapa el texto que entra al SVG, que es XML y no HTML. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parte un texto en renglones que entren en el ancho dado.
 *
 * SVG no sabe hacer saltos de línea: cada renglón es un `<tspan>` propio. La
 * medida es una estimación por cantidad de caracteres, que alcanza porque el
 * tamaño de fuente también se ajusta al largo.
 */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]$/, '')}…`;
  }
  return lines;
}

export interface ShareCardData {
  /** Línea chica de arriba: "Te tocó", "Mi año en Qué Miro". */
  eyebrow: string;
  /** El texto grande. */
  headline: string;
  /** Línea de apoyo: año, géneros, o el dato que resuma la tarjeta. */
  subline?: string;
  /** Hasta tres pares dato/etiqueta que van abajo. */
  stats?: { value: string; label: string }[];
  /**
   * `story`: vertical, para subir como historia. Es la de las reseñas, que
   * además llevan la cita. Por defecto, la apaisada de siempre.
   */
  format?: 'wide' | 'story';
  /** Un pedazo de la reseña, entre comillas. Solo en `story`. */
  quote?: string;
}

/** Las medidas de la imagen según el formato. */
export function cardSize(data: Pick<ShareCardData, 'format'>): { width: number; height: number } {
  return data.format === 'story'
    ? { width: STORY_WIDTH, height: STORY_HEIGHT }
    : { width: CARD_WIDTH, height: CARD_HEIGHT };
}

/**
 * La tarjeta vertical de una reseña: el título grande, el puntaje, la cita y
 * quién la escribió. Igual que la apaisada, sin póster (ver arriba).
 */
function buildStorySvg(data: ShareCardData): string {
  const headlineLines = wrapText(data.headline, 16, 4);
  const headlineSize = headlineLines.length > 2 ? 96 : 120;
  const headlineTop = 620;
  const quoteLines = data.quote ? wrapText(`“${data.quote}”`, 30, 7) : [];
  const quoteTop = headlineTop + headlineLines.length * headlineSize * 1.1 + 120;
  const stats = (data.stats ?? []).slice(0, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}" viewBox="0 0 ${STORY_WIDTH} ${STORY_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0d0e"/>
      <stop offset="100%" stop-color="#1a1416"/>
    </linearGradient>
  </defs>

  <rect width="${STORY_WIDTH}" height="${STORY_HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${STORY_WIDTH}" height="14" fill="#e63946"/>

  <text x="96" y="260" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="52" fill="#f4f5f6">Qué Miro?</text>
  <text x="96" y="400" font-family="Helvetica, Arial, sans-serif" font-size="36" letter-spacing="4" fill="#e63946">${escapeXml(
    data.eyebrow.toUpperCase(),
  )}</text>

  <text x="96" y="${headlineTop}" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="${headlineSize}" fill="#f4f5f6">
    ${headlineLines
      .map((line, index) => `<tspan x="96" dy="${index === 0 ? 0 : headlineSize * 1.1}">${escapeXml(line)}</tspan>`)
      .join('\n    ')}
  </text>

  ${
    quoteLines.length
      ? `<text x="96" y="${quoteTop}" font-family="Georgia, serif" font-style="italic" font-size="52" fill="#d6d8db">
    ${quoteLines
      .map((line, index) => `<tspan x="96" dy="${index === 0 ? 0 : 72}">${escapeXml(line)}</tspan>`)
      .join('\n    ')}
  </text>`
      : ''
  }

  ${stats
    .map((stat, index) => {
      const x = 96 + index * 460;
      return `<text x="${x}" y="1700" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="96" fill="#e63946">${escapeXml(
        stat.value,
      )}</text>
  <text x="${x}" y="1760" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#a3a7ad">${escapeXml(stat.label)}</text>`;
    })
    .join('\n  ')}

  ${
    data.subline
      ? `<text x="96" y="1840" font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#a3a7ad">${escapeXml(data.subline)}</text>`
      : ''
  }
</svg>`;
}

/** El SVG de la tarjeta, listo para mostrar o para convertir a imagen. */
export function buildCardSvg(data: ShareCardData): string {
  if (data.format === 'story') return buildStorySvg(data);
  const headlineLines = wrapText(data.headline, 26, 3);
  // El tamaño baja cuando el título es largo, así ocupa siempre un ancho
  // parecido y no se ve un renglón perdido en el medio.
  const headlineSize = headlineLines.length > 2 ? 76 : 96;
  const headlineTop = 250 - (headlineLines.length - 1) * (headlineSize * 0.5);

  const stats = (data.stats ?? []).slice(0, 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0d0e"/>
      <stop offset="100%" stop-color="#1a1416"/>
    </linearGradient>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="12" height="${CARD_HEIGHT}" fill="#e63946"/>

  <text x="88" y="120" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="34" fill="#f4f5f6">Qué Miro?</text>
  <text x="88" y="188" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="3" fill="#e63946">${escapeXml(
    data.eyebrow.toUpperCase(),
  )}</text>

  <text x="88" y="${headlineTop}" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="${headlineSize}" fill="#f4f5f6">
    ${headlineLines
      .map(
        (line, index) =>
          `<tspan x="88" dy="${index === 0 ? 0 : headlineSize * 1.1}">${escapeXml(line)}</tspan>`,
      )
      .join('\n    ')}
  </text>

  ${
    data.subline
      ? `<text x="88" y="${headlineTop + headlineLines.length * headlineSize * 1.1 + 20}" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#a3a7ad">${escapeXml(
          data.subline,
        )}</text>`
      : ''
  }

  ${stats
    .map((stat, index) => {
      const x = 88 + index * 300;
      return `<text x="${x}" y="530" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="56" fill="#e63946">${escapeXml(
        stat.value,
      )}</text>
  <text x="${x}" y="566" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#a3a7ad">${escapeXml(
    stat.label,
  )}</text>`;
    })
    .join('\n  ')}
</svg>`;
}

/**
 * Convierte el SVG en un PNG.
 *
 * Devuelve `null` si el navegador no puede hacerlo: la parte que comparte tiene
 * un plan B con texto, así que no vale la pena tirar una excepción por esto.
 */
export async function svgToPngBlob(
  svg: string,
  { width, height } = { width: CARD_WIDTH, height: CARD_HEIGHT },
): Promise<Blob | null> {
  try {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No se pudo dibujar la tarjeta.'));
      element.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(url);

    return await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png'),
    );
  } catch (error) {
    console.warn('[compartir] No pudimos generar la imagen:', error);
    return null;
  }
}

export interface SharePayload {
  title: string;
  text: string;
  url?: string;
  card?: ShareCardData;
}

export type ShareOutcome = 'compartido' | 'copiado' | 'cancelado' | 'error';

/**
 * Comparte con la hoja nativa del sistema, cayendo en copiar al portapapeles.
 *
 * Se intenta con imagen primero y sin imagen después: varios navegadores tienen
 * `share` pero no aceptan archivos, y en ese caso `canShare` avisa antes de
 * romper.
 */
export async function share(payload: SharePayload): Promise<ShareOutcome> {
  const { title, text, url, card } = payload;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      if (card && navigator.canShare) {
        const blob = await svgToPngBlob(buildCardSvg(card), cardSize(card));
        if (blob) {
          const file = new File([blob], 'que-miro.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title, text, files: [file] });
            return 'compartido';
          }
        }
      }

      await navigator.share({ title, text, url });
      return 'compartido';
    } catch (error) {
      // Cerrar la hoja de compartir tira `AbortError`: no es una falla.
      if ((error as Error)?.name === 'AbortError') return 'cancelado';
      console.warn('[compartir] La hoja del sistema falló:', error);
    }
  }

  try {
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    return 'copiado';
  } catch {
    return 'error';
  }
}

/**
 * La tarjeta de una reseña, vertical para historias: "Mi reseña de" o "La
 * reseña de Ana", el título, las estrellas y la cita.
 */
export function reviewCard({
  author,
  title,
  releaseYear,
  rating,
  text,
  own,
}: {
  author: string;
  title: string;
  releaseYear?: string;
  rating?: number;
  text?: string;
  own: boolean;
}): ShareCardData {
  return {
    format: 'story',
    eyebrow: own ? 'Mi reseña de' : `La reseña de ${author}`,
    headline: title,
    ...(text ? { quote: text } : {}),
    ...(rating ? { stats: [{ value: `${String(rating).replace('.', ',')} ★`, label: 'de 5 estrellas' }] } : {}),
    ...(releaseYear ? { subline: releaseYear } : {}),
  };
}
