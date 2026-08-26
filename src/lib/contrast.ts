/**
 * Contraste de color según WCAG 2.
 *
 * Vive acá y no en el test porque la paleta se define tres veces en
 * `index.css` —tema claro, tema oscuro y otra vez el claro dentro de la media
 * query de "sistema"— y las tres copias se editan a mano. Un helper con test
 * es más barato que descubrir en producción que una de las tres quedó atrás.
 */

/** Un color `#rrggbb` a sus tres canales. */
export function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`No es un color #rrggbb: ${hex}`);
  }
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Luminancia relativa, tal como la define WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste entre dos colores opacos, de 1:1 a 21:1. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Un color con alfa aplicado sobre un fondo opaco.
 *
 * Los paneles con `bg-accent/10` no tienen un color propio contra el cual
 * medir: hay que resolver la mezcla primero.
 */
export function blend(color: string, background: string, alpha: number): string {
  const fg = parseHex(color);
  const bg = parseHex(background);
  const mixed = fg.map((channel, i) =>
    Math.round(channel * alpha + bg[i] * (1 - alpha)),
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Los `--qm-*` de un bloque de CSS, por nombre sin el prefijo. */
export function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(/--qm-([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}
