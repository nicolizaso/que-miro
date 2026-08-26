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
}

/** El SVG de la tarjeta, listo para mostrar o para convertir a imagen. */
export function buildCardSvg(data: ShareCardData): string {
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
export async function svgToPngBlob(svg: string): Promise<Blob | null> {
  try {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No se pudo dibujar la tarjeta.'));
      element.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT);
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
        const blob = await svgToPngBlob(buildCardSvg(card));
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
