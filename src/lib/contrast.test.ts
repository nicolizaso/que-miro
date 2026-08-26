import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, parseTokens } from './contrast';

// Desde la raíz del repo, que es donde corre vitest. `import.meta.url` no
// sirve: en el entorno de test no es una URL `file:`.
const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** El bloque que arranca en `selector {` hasta su llave de cierre. */
function block(selector: string): string {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`No encontré el bloque ${selector}`);
  const open = CSS.indexOf('{', start);
  const end = CSS.indexOf('}', open);
  return CSS.slice(open, end);
}

const light = parseTokens(block('/* Tema claro (por defecto). */\n:root {'));
const dark = parseTokens(block(":root[data-theme='dark'],"));
const systemLight = parseTokens(block(":root:not([data-theme='dark']) {"));

/**
 * Los pares que tienen que cumplir WCAG AA.
 *
 * El mínimo sale del trabajo que hace el color: 4.5:1 para texto chico, 3:1
 * para el borde de un control, que es lo único que dice dónde empieza el
 * campo (WCAG 1.4.11).
 */
const PAIRS: { fg: string; bg: string; min: number; what: string }[] = [
  { fg: 'text-main', bg: 'bg-main', min: 4.5, what: 'texto principal sobre el fondo' },
  { fg: 'text-main', bg: 'bg-card', min: 4.5, what: 'texto principal sobre una tarjeta' },
  { fg: 'text-muted', bg: 'bg-main', min: 4.5, what: 'texto atenuado sobre el fondo' },
  { fg: 'text-muted', bg: 'bg-card', min: 4.5, what: 'texto atenuado sobre una tarjeta' },
  { fg: 'text-subtle', bg: 'bg-main', min: 4.5, what: 'texto sutil sobre el fondo' },
  { fg: 'text-subtle', bg: 'bg-card', min: 4.5, what: 'texto sutil sobre una tarjeta' },
  { fg: 'accent', bg: 'bg-main', min: 4.5, what: 'el acento como texto sobre el fondo' },
  { fg: 'accent', bg: 'bg-card', min: 4.5, what: 'el acento como texto sobre una tarjeta' },
  { fg: 'accent-contrast', bg: 'accent', min: 4.5, what: 'la etiqueta de un botón de acento' },
  { fg: 'border-control', bg: 'bg-card', min: 3, what: 'el borde de un campo sobre una tarjeta' },
  { fg: 'border-control', bg: 'bg-main', min: 3, what: 'el borde de un campo sobre el fondo' },
  { fg: 'status-viendo', bg: 'bg-card', min: 4.5, what: 'el estado "viendo"' },
  { fg: 'status-por-ver', bg: 'bg-card', min: 4.5, what: 'el estado "por ver"' },
  { fg: 'status-completada', bg: 'bg-card', min: 4.5, what: 'el estado "completada"' },
];

describe.each([
  ['claro', light],
  ['oscuro', dark],
])('paleta del tema %s', (_name, tokens) => {
  it.each(PAIRS)('$what llega a $min:1', ({ fg, bg, min }) => {
    expect(tokens[fg], `falta --qm-${fg}`).toBeDefined();
    expect(tokens[bg], `falta --qm-${bg}`).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  // El panel de "Tu año en Qué Miro?" pinta el acento al 10% sobre el fondo;
  // el texto que va encima se mide contra esa mezcla, no contra el fondo.
  it('el panel del año deja leer lo que lleva encima', () => {
    const panel = blend(tokens.accent, tokens['bg-main'], 0.1);
    expect(contrastRatio(tokens.accent, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens['text-main'], panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens['text-muted'], panel)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('las dos copias del tema claro', () => {
  // `:root` y el bloque de `prefers-color-scheme: light` definen la misma
  // paleta dos veces, a mano. Si una se edita y la otra no, quien tiene el
  // sistema en claro ve una app distinta de quien eligió claro a mano.
  it('definen exactamente los mismos valores', () => {
    expect(systemLight).toEqual(light);
  });
});
