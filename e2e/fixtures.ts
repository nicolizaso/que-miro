import { test as base, expect } from '@playwright/test';

/**
 * Tests aislados de la red.
 *
 * Todo pedido que salga del origen de la app se corta antes de salir: la
 * tipografía de Google, los pósters de TMDB, cualquier cosa. Son tests de
 * *nuestra* app, y hacerlos depender de que un CDN ajeno esté arriba los
 * convierte en una fuente de fallos que no dicen nada.
 *
 * Hay además una razón concreta: una hoja de estilos externa que nunca resuelve
 * deja colgado el evento `load` de la página, y con eso `page.reload()` expira
 * aunque la app haya terminado de renderizar hace rato.
 *
 * La app está hecha para aguantar esto —degrada a placeholders y avisos— así
 * que cortar la red externa no invalida ningún flujo de los que se prueban acá.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', (route) => {
      const { hostname } = new URL(route.request().url());
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
      return isLocal ? route.continue() : route.abort();
    });

    await use(page);
  },
});

export { expect };
