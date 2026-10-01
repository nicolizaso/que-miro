/**
 * El logo de Qué Miro?: un signo de pregunta cuyo punto es un "play".
 *
 * La geometría vive acá y no en un SVG suelto porque la usan tres lugares que
 * tienen que verse idénticos: el componente `Logo` de la interfaz, el
 * `favicon.svg` y los PNG de instalación que arma `scripts/generate-icons.ts`.
 * `brand.test.ts` avisa si el archivo de `public/` se desincroniza de esto.
 */

/** Lado del cuadrado en el que están dibujadas todas las coordenadas. */
export const LOGO_SIZE = 512;

/** Los colores del ícono instalado. Son fijos: el sistema no aplica el tema de la app. */
export const BRAND_RED = '#E63946';
export const BRAND_INK = '#0B0D0E';

/**
 * El trazo del signo y el "play" que hace de punto.
 *
 * La inclinación copia la cursiva de Playfair, la tipografía del nombre, para
 * que el ícono y el wordmark se lean como una sola marca. El corrimiento final
 * centra el conjunto: la inclinación y el gancho cargan el peso arriba a la
 * derecha.
 */
export const LOGO_GLYPH = {
  hook: 'M170 198C170 138 212 100 262 100C316 100 354 136 354 186C354 232 322 252 294 270C272 284 262 298 262 326',
  hookWidth: 62,
  play: 'M232 378L306 416L232 454Z',
  // El "play" lleva contorno redondeado para que sus puntas no queden más
  // filosas que las del gancho.
  playWidth: 24,
  transform: 'translate(-14 -12) translate(256 272) skewX(-8) translate(-256 -272)',
} as const;

/** Radio de las esquinas del ícono redondeado: el 22 % del lado, como los íconos de iOS. */
export const LOGO_RADIUS = 112;

/**
 * Cómo se presenta el logo según dónde va.
 *
 * - `rounded`: esquinas redondeadas y transparentes. Favicon e íconos `any`.
 * - `full-bleed`: fondo hasta el borde y el signo achicado. Android recorta
 *   los íconos `maskable` con la forma que quiera (círculo, gota) y solo
 *   garantiza el círculo central del 80 %; iOS redondea el `apple-touch-icon`
 *   por su cuenta y pinta de negro lo transparente.
 * - `glyph`: solo el signo, sin fondo. Es el `badge` de las notificaciones:
 *   Android usa nada más que su silueta.
 */
export type LogoVariant = 'rounded' | 'full-bleed' | 'glyph';

const GLYPH_SCALE: Record<LogoVariant, number> = {
  rounded: 1,
  'full-bleed': 0.76,
  glyph: 1.1,
};

/** El logo como SVG autónomo, listo para escribir a disco o rasterizar. */
export function logoSvg(variant: LogoVariant): string {
  const half = LOGO_SIZE / 2;
  const scale = GLYPH_SCALE[variant];
  const background =
    variant === 'glyph'
      ? ''
      : `  <rect width="${LOGO_SIZE}" height="${LOGO_SIZE}"${
          variant === 'rounded' ? ` rx="${LOGO_RADIUS}"` : ''
        } fill="${BRAND_RED}"/>\n`;
  const scaled =
    scale === 1 ? '' : `translate(${half} ${half}) scale(${scale}) translate(${-half} ${-half}) `;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}">\n` +
    background +
    `  <g transform="${scaled}${LOGO_GLYPH.transform}" fill="${BRAND_INK}" stroke="${BRAND_INK}" stroke-linecap="round" stroke-linejoin="round">\n` +
    `    <path d="${LOGO_GLYPH.hook}" fill="none" stroke-width="${LOGO_GLYPH.hookWidth}"/>\n` +
    `    <path d="${LOGO_GLYPH.play}" stroke-width="${LOGO_GLYPH.playWidth}"/>\n` +
    `  </g>\n` +
    `</svg>\n`
  );
}

export interface BrandIcon {
  /** Nombre del archivo dentro de `public/`. */
  file: string;
  size: number;
  variant: LogoVariant;
  /** Solo los que van al manifest de la PWA. */
  purpose?: 'any' | 'maskable';
}

/**
 * Todos los PNG del logo. De acá salen el manifest (`vite.config.ts`), el
 * script que los genera y el test que revisa que existan con su tamaño.
 */
export const BRAND_ICONS: BrandIcon[] = [
  { file: 'pwa-192x192.png', size: 192, variant: 'rounded', purpose: 'any' },
  { file: 'pwa-512x512.png', size: 512, variant: 'rounded', purpose: 'any' },
  { file: 'pwa-maskable-512x512.png', size: 512, variant: 'full-bleed', purpose: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, variant: 'full-bleed' },
  { file: 'favicon-32x32.png', size: 32, variant: 'rounded' },
  { file: 'pwa-badge-96x96.png', size: 96, variant: 'glyph' },
];

/** Las entradas `icons` del manifest de la PWA. */
export function manifestIcons() {
  return BRAND_ICONS.filter((icon) => icon.purpose).map((icon) => ({
    src: icon.file,
    sizes: `${icon.size}x${icon.size}`,
    type: 'image/png',
    purpose: icon.purpose,
  }));
}
