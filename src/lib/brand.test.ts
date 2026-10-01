import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_ICONS, logoSvg, manifestIcons } from './brand';

// Desde la raíz del repo, que es donde corre vitest (ver contrast.test.ts).
const publicFile = (name: string) => resolve(process.cwd(), 'public', name);

/**
 * Ancho y alto de un PNG, leídos de su cabecera IHDR.
 *
 * Los íconos estuvieron un tiempo commiteados con 0 bytes: el build pasaba,
 * el manifest los listaba y el celular instalaba la app sin ícono.
 */
function pngSize(name: string): { width: number; height: number } {
  const bytes = readFileSync(publicFile(name));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte)) {
    throw new Error(`public/${name} no es un PNG`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('logo', () => {
  it('el favicon.svg es el que sale de brand.ts', () => {
    // Si falla, corré `npx tsx scripts/generate-icons.ts`.
    expect(readFileSync(publicFile('favicon.svg'), 'utf8')).toBe(logoSvg('rounded'));
  });

  it.each(BRAND_ICONS)('public/$file es un PNG de $size px', ({ file, size }) => {
    expect(pngSize(file)).toEqual({ width: size, height: size });
  });

  it('el manifest trae un ícono maskable y uno de 512 px para la pantalla de inicio', () => {
    const icons = manifestIcons();
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(icons.some((icon) => icon.purpose === 'any' && icon.sizes === '512x512')).toBe(true);
  });

  it('index.html y el service worker apuntan a íconos que existen', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const sw = readFileSync(resolve(process.cwd(), 'src/sw.ts'), 'utf8');
    const referenced = [
      ...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g),
      ...sw.matchAll(/(?:icon|badge): '\/([^']+)'/g),
    ].map((match) => match[1]);

    expect(referenced.length).toBeGreaterThanOrEqual(5);
    for (const name of referenced) {
      if (name.endsWith('.png')) expect(() => pngSize(name)).not.toThrow();
      else expect(readFileSync(publicFile(name), 'utf8').length).toBeGreaterThan(0);
    }
  });
});
