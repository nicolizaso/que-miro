import type { Page } from '@playwright/test';
import { SCHEMA_VERSION } from '../src/lib/schema';
import {
  buildSampleGoals,
  buildSampleLibrary,
  buildSamplePicks,
  buildSampleRestrictions,
  buildSampleSubscriptions,
} from '../src/test/fixtures/sampleLibrary';

/**
 * Arranca la app como un invitado que ya tiene su biblioteca armada.
 *
 * Se escribe directo en el localStorage, con el mismo formato que guarda el
 * store, y se vuelve a abrir: la app la lee al arrancar y pasa por `parseMedia` como
 * cualquier biblioteca guardada. Así los tests no dependen ni de TMDB ni de
 * Firebase, y lo que prueban es lo que ve alguien que usa la app sin cuenta.
 */
export async function seedSampleLibrary(page: Page) {
  const persisted = {
    state: {
      mediaList: buildSampleLibrary(),
      picks: buildSamplePicks(),
      goals: buildSampleGoals(),
      subscriptions: buildSampleSubscriptions(),
      restrictions: buildSampleRestrictions(),
      ownerUid: null,
      syncedUid: null,
    },
    version: SCHEMA_VERSION,
  };
  await page.goto('/');
  await page.evaluate((value) => {
    localStorage.clear();
    localStorage.setItem('que-miro-storage', value);
  }, JSON.stringify(persisted));
  // A `/` de nuevo y no `reload()`: con la biblioteca vacía la app manda a
  // Explorar, y si esa redirección llega antes que el `setItem`, recargar
  // dejaría el test parado en Explorar en vez de en las listas.
  await page.goto('/');
}

/** Arranca la app como quien la abre por primera vez: sin nada guardado. */
export async function startEmpty(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}
