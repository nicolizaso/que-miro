/**
 * Regenera el favicon, los íconos de instalación y la imagen para redes a
 * partir de `src/lib/brand.ts`.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * Rasteriza con el Chromium de Playwright, que ya es dependencia del repo, en
 * vez de sumar una librería de imágenes solo para esto. Si Chromium está en
 * otra ruta que la que espera Playwright, pasala en `CHROMIUM_PATH`, igual que
 * para los E2E. Detrás de un proxy, sumá `NODE_USE_ENV_PROXY=1` para que Node
 * pueda bajar la tipografía.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { BRAND_ICONS, logoSvg } from '../src/lib/brand';

const PUBLIC = resolve(process.cwd(), 'public');
// El README muestra la misma imagen para redes desde `docs/`.
const OG_COPIES = [resolve(PUBLIC, 'og-image.png'), resolve(process.cwd(), 'docs/screenshots/og-image.png')];

/**
 * Playfair Display embebida en la página.
 *
 * Se baja desde Node y no con un `<link>` porque el Chromium de Playwright no
 * siempre tiene salida a internet, y si la fuente no llega la imagen sale con
 * el serif del sistema sin que nadie se entere.
 */
async function playfairFace(): Promise<string> {
  const css = await (
    await fetch('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700')
  ).text();
  const url = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!url) throw new Error('Google Fonts no devolvió la URL de Playfair Display');
  const font = Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64');
  return `@font-face { font-family: "Playfair Display"; font-style: italic; font-weight: 700; src: url(data:font/ttf;base64,${font}); }`;
}

/** La imagen que se ve al compartir un link: logo, nombre y las tres listas. */
function ogHtml(fontFace: string): string {
  return `<!doctype html>
<html><head>
<style>
  ${fontFace}
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    background: radial-gradient(circle at 82% 18%, rgb(230 57 70 / 0.22), transparent 42%), #0B0D0E;
    color: #F4F5F6;
    font-family: system-ui, "DejaVu Sans", sans-serif;
    padding: 108px 80px;
    box-sizing: border-box;
  }
  .logo { width: 96px; height: 96px; filter: drop-shadow(0 12px 32px rgb(230 57 70 / 0.35)); }
  h1 { font-family: "Playfair Display", serif; font-style: italic; font-weight: 700; font-size: 104px; letter-spacing: -2px; margin: 36px 0 24px; line-height: 1; }
  p { font-size: 34px; color: #A3A7AD; margin: 0 0 44px; }
  .chips { display: flex; gap: 16px; }
  .chip { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 700; color: #D7D9DC;
          background: #14171A; border: 1px solid #26292E; border-radius: 999px; padding: 14px 24px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
</style></head>
<body>
  <img class="logo" src="data:image/svg+xml;base64,${Buffer.from(logoSvg('rounded')).toString('base64')}">
  <h1>Qué Miro?</h1>
  <p>Tu biblioteca personal de películas y series.</p>
  <div class="chips">
    <span class="chip"><span class="dot" style="background:#E9C46A"></span>Por Ver</span>
    <span class="chip"><span class="dot" style="background:#2A9D8F"></span>Viendo</span>
    <span class="chip"><span class="dot" style="background:#AB55F1"></span>Completadas</span>
  </div>
</body></html>`;
}

async function main() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage();

  writeFileSync(resolve(PUBLIC, 'favicon.svg'), logoSvg('rounded'));

  for (const icon of BRAND_ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${logoSvg(icon.variant)}`,
    );
    await page.screenshot({ path: resolve(PUBLIC, icon.file), omitBackground: true });
    console.log(`public/${icon.file}`);
  }

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(ogHtml(await playfairFace()));
  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.load('italic 700 104px "Playfair Display"');
    return document.fonts.check('italic 700 104px "Playfair Display"');
  });
  if (!fontLoaded) throw new Error('Playfair Display no cargó: la imagen saldría con otra tipografía');
  const og = await page.screenshot();
  for (const path of OG_COPIES) writeFileSync(path, og);
  console.log('public/og-image.png, docs/screenshots/og-image.png');

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
