import { expect, test } from './fixtures';

/**
 * Los flujos que alguien realmente hace en la app, de punta a punta.
 *
 * Todos arrancan del modo demo, que carga una biblioteca de ejemplo sin
 * depender de TMDB ni de Firebase. Es lo que hace que estos tests corran igual
 * en CI que en una máquina sin credenciales.
 */
/**
 * Abre la ficha del primer título de la lista visible.
 *
 * Se lo busca por su nombre accesible en vez de por la estructura del DOM: la
 * grilla se reordena con animación, y un locator estructural puede resolver a
 * un elemento que deja de existir justo cuando se lo clickea.
 */
async function selectTab(
  page: import('@playwright/test').Page,
  name: RegExp,
) {
  const tab = page.getByRole('tab', { name });
  await tab.click();
  // Se espera a que la pestaña quede seleccionada antes de seguir: el cambio
  // de lista es asincrónico, y sin esta espera el clic siguiente puede caer
  // sobre una tarjeta de la lista anterior.
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function openFirstCard(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Ver detalle de/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Ver una biblioteca de ejemplo/i }).click();
  await expect(page.getByText(/Estás viendo el demo/)).toBeVisible();
});

test('el demo carga títulos en las tres listas', async ({ page }) => {
  await expect(page.getByRole('tab', { name: /Por Ver/ })).toContainText(/\d/);
  await expect(page.locator('article').first()).toBeVisible();

  await selectTab(page, /Viendo/);
  await expect(page.locator('article').first()).toBeVisible();

  await selectTab(page, /Completadas/);
  await expect(page.locator('article').first()).toBeVisible();
});

test('filtrar deja el filtro en la URL y se puede limpiar', async ({ page }) => {
  const search = page.getByLabel('Buscar en esta lista');
  await search.fill('duna');

  await expect(page).toHaveURL(/q=duna/);
  await expect(page.locator('article')).toHaveCount(1);

  await page.getByRole('button', { name: /Limpiar filtros/ }).first().click();
  await expect(page).not.toHaveURL(/q=duna/);
});

test('los botones de Películas y Series filtran la lista', async ({ page }) => {
  const types = page.getByRole('group', { name: 'Filtrar por tipo' });
  const movies = types.getByRole('button', { name: 'Películas' });
  const series = types.getByRole('button', { name: 'Series' });
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();

  await series.click();
  await expect(series).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/tipo=tv/);
  const seriesCount = await cards.count();

  await movies.click();
  await expect(movies).toHaveAttribute('aria-pressed', 'true');
  await expect(series).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL(/tipo=movie/);
  await expect(cards).toHaveCount(total - seriesCount);

  // Tocar el que está prendido lo apaga y vuelve a mostrar todo.
  await movies.click();
  await expect(page).not.toHaveURL(/tipo=/);
  await expect(cards).toHaveCount(total);
});

test('una vista filtrada sobrevive a recargar la página', async ({ page }) => {
  await page.getByLabel('Buscar en esta lista').fill('duna');
  // El filtro vive en la URL, así que primero se confirma que llegó ahí: es lo
  // que después tiene que sobrevivir a la recarga.
  await expect(page).toHaveURL(/q=duna/);
  await expect(page.locator('article')).toHaveCount(1);

  await page.reload();

  await expect(page.getByLabel('Buscar en esta lista')).toHaveValue('duna');
  await expect(page.locator('article')).toHaveCount(1);
});

test('marcar un episodio mueve el progreso de la serie', async ({ page }) => {
  await selectTab(page, /Viendo/);
  await openFirstCard(page);

  const dialog = page.getByRole('dialog');
  const bar = dialog.getByRole('progressbar').first();
  await expect(bar).toBeVisible();

  const before = Number(await bar.getAttribute('aria-valuenow'));
  const episodes = dialog.getByRole('button', { name: /^Episodio \d+ de/ });
  await episodes.last().click();

  await expect
    .poll(async () => Number(await bar.getAttribute('aria-valuenow')))
    .toBeGreaterThan(before);
});

test('el progreso persiste al cerrar y volver a abrir la ficha', async ({ page }) => {
  await selectTab(page, /Viendo/);
  await openFirstCard(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Episodio \d+ de/ }).last().click();
  const after = await dialog
    .getByRole('progressbar')
    .first()
    .getAttribute('aria-valuenow');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openFirstCard(page);

  await expect(
    page.getByRole('dialog').getByRole('progressbar').first(),
  ).toHaveAttribute('aria-valuenow', after!);
});

test('volver a ver algo suma al historial sin pisar lo anterior', async ({ page }) => {
  await selectTab(page, /Completadas/);
  await openFirstCard(page);

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Tu reseña|La viste \d+ veces/)).toBeVisible();

  await dialog.getByRole('button', { name: /La volví a ver/ }).click();
  const drawer = page.getByRole('dialog').last();
  await expect(drawer.getByText(/vez número/)).toBeVisible();

  await drawer.getByLabel('4 de 5 estrellas').first().click({ force: true });
  await drawer.getByRole('button', { name: 'Para llorar' }).click();
  await drawer.getByRole('button', { name: /Guardar Reseña/ }).click();

  await expect(page.getByRole('dialog').getByText(/La viste 2 veces/)).toBeVisible();
});

test('el picker filtra los candidatos y sortea uno', async ({ page }) => {
  await page.getByRole('link', { name: 'Picker' }).click();

  const counter = page.getByText(/\d+ candidatos?|Ningún título/);
  await expect(counter).toBeVisible();
  const before = await counter.textContent();

  await page.getByLabel('Filtrar por tipo').selectOption('tv');
  await expect(counter).not.toHaveText(before!);

  await page.getByLabel('Filtrar por tipo').selectOption('');
  await page.getByRole('button', { name: /Elegir/ }).click();

  await expect(page.locator('article')).toHaveCount(1, { timeout: 10_000 });
});

test('el duelo arma un ranking y se puede ordenar por él', async ({ page }) => {
  await page.getByRole('link', { name: 'Picker' }).click();
  await page.getByRole('tab', { name: /Duelo/ }).click();

  await expect(page.getByText(/Cuál mirarías antes/)).toBeVisible();
  for (let round = 0; round < 3; round++) {
    await page.getByRole('button', { name: /^Elegir / }).first().click();
    await expect(page.getByText(/Cuál mirarías antes/)).toBeVisible();
  }

  await expect(page.getByRole('heading', { name: 'Tu ranking' })).toBeVisible();

  await page.getByRole('link', { name: 'Mis Listas' }).click();
  await page.getByLabel('Ordenar por').selectOption('ranking');
  await expect(page).toHaveURL(/orden=ranking/);
});

test('el panel de estadísticas calcula sobre el historial', async ({ page }) => {
  await page.getByRole('link', { name: 'Perfil' }).click();

  await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible();
  await expect(page.getByText('Tiempo mirando')).toBeVisible();

  // Cada gráfico ofrece su tabla: es lo que lo hace legible sin ver colores.
  await page.getByRole('button', { name: 'Ver tabla' }).first().click();
  await expect(page.locator('table').first()).toBeVisible();
});

test('exportar descarga un backup con la biblioteca adentro', async ({ page }) => {
  await page.getByRole('link', { name: 'Perfil' }).click();
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/perfil\/ajustes/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar JSON' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^que-miro-\d{4}-\d{2}-\d{2}\.json$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const backup = JSON.parse(Buffer.concat(chunks).toString());

  expect(backup.app).toBe('que-miro');
  expect(backup.media.length).toBeGreaterThan(0);
});

test('una biblioteca guardada con el schema viejo se migra al cargar', async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'que-miro-storage',
      JSON.stringify({
        version: 1,
        state: {
          ownerUid: null,
          mediaList: [
            {
              tmdbId: 603,
              mediaType: 'movie',
              title: 'Matrix',
              posterPath: null,
              backdropPath: null,
              releaseYear: '1999',
              genres: ['Ciencia Ficción'],
              status: 'completada',
              updatedAt: '2024-01-01T00:00:00.000Z',
              review: {
                rating: 4.5,
                text: 'Guardada con el schema viejo.',
                completedAt: '2024-01-01T00:00:00.000Z',
              },
            },
          ],
        },
      }),
    );
  });
  await page.reload();

  const migrated = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('que-miro-storage') ?? '{}');
    const media = raw.state?.mediaList?.[0];
    return {
      version: raw.version,
      historyLength: media?.history?.length ?? 0,
      rating: media?.history?.[0]?.rating,
      legacyGone: media?.review === undefined,
    };
  });

  expect(migrated.version).toBe(2);
  expect(migrated.historyLength).toBe(1);
  expect(migrated.rating).toBe(4.5);
  expect(migrated.legacyGone).toBe(true);
});

test('un perfil público inexistente muestra su propia página, no el login', async ({
  page,
}) => {
  await page.goto('/u/no-existe');

  await expect(
    page.getByText(/Este perfil no existe|No pudimos cargar el perfil/),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/u\/no-existe/);
});

test('se navega con teclado desde el salto al contenido', async ({ page }) => {
  // Se recarga primero para que el foco arranque desde el principio del
  // documento: el botón del demo se desmontó al hacer clic, y el navegador
  // sigue tabulando desde donde estaba ese botón.
  await page.reload();
  // Se tabula desde el `body` y no con `keyboard.press` suelto: eso fija el
  // punto de partida de la navegación secuencial, que si no queda donde estaba
  // el botón del demo antes de desmontarse.
  await page.locator('body').press('Tab');

  await expect(page.locator(':focus')).toHaveText('Saltar al contenido');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenido/);
});

test('el tema elegido sobrevive a recargar, sin fogonazo', async ({ page }) => {
  const toggle = page.getByRole('button', { name: /^Tema:/ });

  for (let i = 0; i < 3; i++) {
    const label = await toggle.getAttribute('aria-label');
    if (label?.includes('Tema: Oscuro')) break;
    await toggle.click();
  }

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  // El script inline de index.html lo aplica antes de que monte React.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('las respuestas de "Contanos de vos" se guardan y sobreviven a una recarga', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Perfil' }).click();
  await page.getByRole('link', { name: 'Contanos de vos' }).click();
  await expect(page).toHaveURL(/\/perfil\/gustos/);

  // El demo viene con el cuestionario contestado: es lo que hace que Explorar
  // tenga filas personales apenas se entra.
  await expect(page.getByText(/de 7$/)).toBeVisible();

  const decade = page.getByRole('button', { name: 'Los 80', exact: true });
  await decade.click();
  await expect(decade).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Los 80', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('marcar el siguiente episodio desde el inicio', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Continuar viendo' })).toBeVisible();

  // Severance va por T2E4 en el demo: el "+1" lo marca sin abrir la ficha.
  await page
    .getByRole('button', { name: 'Marcar T2E4 de Severance como visto' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Marcar T2E5 de Severance como visto' }),
  ).toBeVisible();

  // El aviso deja deshacerlo, por si el dedo se adelantó.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(
    page.getByRole('button', { name: 'Marcar T2E4 de Severance como visto' }),
  ).toBeVisible();

  // Y lo marcado sobrevive a recargar la página.
  await page
    .getByRole('button', { name: 'Marcar T2E4 de Severance como visto' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Marcar T2E5 de Severance como visto' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Marcar T2E5 de Severance como visto' }),
  ).toBeVisible();
});

test('el calendario muestra lo que sale de lo que seguís', async ({ page }) => {
  await page.getByRole('link', { name: 'Calendario' }).click();
  await expect(page).toHaveURL(/\/calendario/);

  // En el demo, The Bear está al día y ya anunció la temporada que viene.
  await expect(page.getByRole('heading', { name: 'Calendario', level: 1 })).toBeVisible();
  await expect(page.getByText('The Bear')).toBeVisible();
  await expect(page.getByText('Estreno de la temporada 4')).toBeVisible();

  // Las que siguen en emisión sin fecha van aparte.
  await expect(page.getByRole('heading', { name: 'Sin fecha confirmada' })).toBeVisible();
});
