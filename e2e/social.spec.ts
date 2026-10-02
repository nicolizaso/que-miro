import { test, expect } from './fixtures';

/**
 * Lo social de punta a punta, en el demo: la gente inventada de
 * `lib/demoSocial.ts` no pasa por Firestore, así que el flujo entero —feed,
 * reacciones, notificaciones, perfiles, guardar lo de otro— se recorre sin
 * cuenta ni red.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // La primera vez se cae en Explorar, y el demo lleva a las listas.
  await page.getByRole('button', { name: /Ver una biblioteca de ejemplo/i }).click();
  await expect(page.getByText(/Estás viendo el demo/)).toBeVisible();
  // Se espera a que lleguen: cambiar de página cierra el buscador, y un ⌘K
  // apretado antes de que termine el cambio se cerraría solo.
  await expect(page.getByRole('tablist')).toBeVisible();
});

test('el feed muestra lo que hace la gente que seguís, con la reseña tapada si la estás viendo', async ({ page }) => {
  await page.getByRole('link', { name: /^Social/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Social' })).toBeVisible();

  await expect(page.getByRole('article', { name: 'Ana le puso 5 a Past Lives' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ana está viendo The Bear/ })).toBeVisible();

  // El demo está viendo Severance: la reseña de Ana sale tapada.
  const severance = page.getByRole('article', { name: /Ana le puso 4,5 a Severance/ });
  await expect(severance.getByText(/cuando Helly/)).toHaveCount(0);
  await severance.getByRole('button', { name: /Mostrar la reseña/ }).click();
  await expect(severance.getByText(/cuando Helly/)).toBeVisible();

  // Reaccionar: se elige y queda apretada.
  await severance.getByRole('button', { name: 'Reaccionar' }).click();
  await severance.getByRole('button', { name: 'Fuego' }).click();
  await expect(severance.getByRole('button', { name: /Fuego: 1/ })).toHaveAttribute('aria-pressed', 'true');
});

test('guardar algo del feed lo deja en Por Ver con de quién vino', async ({ page }) => {
  await page.goto('/social');
  const card = page.getByRole('article', { name: 'Ana le puso 5 a Past Lives' });
  await card.getByRole('button', { name: /Guardar en Por Ver/ }).click();
  await expect(card.getByText('En tu biblioteca')).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('Lo sacaste del feed de Ana')).toBeVisible();
});

test('aceptar una solicitud desde las notificaciones', async ({ page }) => {
  await page.goto('/social/notificaciones');
  await expect(page.getByText(/quiere seguirte/)).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByText(/quiere seguirte/)).toHaveCount(0);
  await expect(page.getByText(/Dani\s+empezó a seguirte/)).toBeVisible();
});

test('los perfiles: una privada sin aceptar, y "En común" con una amiga', async ({ page }) => {
  await page.goto('/u/dani-demo');
  await expect(page.getByText('Esta cuenta es privada')).toBeVisible();
  await page.getByRole('button', { name: /Solicitar seguir/ }).click();
  await expect(page.getByRole('button', { name: /Solicitado/ })).toBeVisible();

  await page.goto('/u/ana-demo');
  await expect(page.getByText('Te sigue')).toBeVisible();
  await page.getByRole('tab', { name: 'En común' }).click();
  await expect(page.getByText(/títulos que puntuaron los dos/)).toBeVisible();
});

test('crear el usuario no hace falta en el demo, y Ajustes muestra la cuenta social', async ({ page }) => {
  await page.goto('/perfil/ajustes');
  await expect(page.getByRole('heading', { name: 'Tu cuenta social' })).toBeVisible();
  await expect(page.getByRole('link', { name: '@demo' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Pausar mi actividad/ }).check();
  await expect(page.getByRole('checkbox', { name: /Pausar mi actividad/ })).toBeChecked();
});
