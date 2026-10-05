import { expect, test } from './fixtures';
import { seedSampleLibrary, startEmpty } from './seed';

/**
 * Los flujos que alguien realmente hace en la app, de punta a punta.
 *
 * Todos arrancan como un invitado con una biblioteca de ejemplo ya guardada
 * (`seed.ts`), sin depender de TMDB ni de Firebase. Es lo que hace que estos tests corran igual
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

/**
 * Pone un puntaje con las estrellas.
 *
 * Se hace clic en el `<label>` de la media estrella, que es lo que toca una
 * persona. El radio está oculto (`sr-only`), y forzar el clic sobre él lo
 * mandaba a sus coordenadas sin esperar a que el drawer terminara de entrar:
 * si todavía se estaba deslizando, el clic caía en otro lado, el puntaje no se
 * marcaba y "Guardar Reseña" quedaba deshabilitado. Por eso, además, se
 * confirma que quedó elegido antes de seguir.
 */
async function rate(scope: import('@playwright/test').Locator, label: string) {
  await scope
    .locator('label')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first()
    .click();
  await expect(scope.getByLabel(label, { exact: true }).first()).toBeChecked();
}

test.beforeEach(async ({ page }) => {
  // Con biblioteca, abrir la app lleva a las listas.
  await seedSampleLibrary(page);
  // Se espera a que lleguen: cambiar de página cierra el buscador, y un ⌘K
  // apretado antes de que termine el cambio se cerraría solo.
  await expect(page.getByRole('tablist')).toBeVisible();
});

test('la biblioteca tiene títulos en las tres listas', async ({ page }) => {
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

  await rate(drawer, '4 de 5 estrellas');
  await drawer.getByRole('button', { name: 'Para llorar' }).click();
  await drawer.getByRole('button', { name: /Guardar Reseña/ }).click();

  await expect(page.getByRole('dialog').getByText(/La viste 2 veces/)).toBeVisible();
});

test('el picker filtra los candidatos y sortea uno', async ({ page }) => {
  await page.getByRole('link', { name: 'Picker' }).click();

  const counter = page.getByText(/\d+ candidatos?|Ningún título/);
  await expect(counter).toBeVisible();
  const before = await counter.textContent();

  const types = page.getByRole('group', { name: 'Filtrar por tipo' });
  await types.getByRole('button', { name: /^Series/ }).click();
  await expect(types.getByRole('button', { name: /^Series/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(counter).not.toHaveText(before!);

  await types.getByRole('button', { name: 'Todo' }).click();
  await expect(counter).toHaveText(before!);
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

test('una lista compartida inexistente muestra su propia página, no el login', async ({
  page,
}) => {
  await page.goto('/l/abcdefghijkl1234');

  await expect(
    page.getByRole('heading', { name: /Esta lista no existe|No pudimos cargar la lista/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/l\/abcdefghijkl1234/);
});

test('sin cuenta se entra a la app, y la primera vez cae en Explorar', async ({ page }) => {
  // Sin nada guardado: como quien abre la app por primera vez.
  await startEmpty(page);
  // Abrir la app de cero: el navegador conserva el estado del historial al
  // recargar, y la llegada a Explorar es solo para quien recién la abre.
  await page.evaluate(() => history.replaceState(null, '', '/'));
  await page.reload();

  await expect(page).toHaveURL(/\/explorar$/);
  await expect(page.getByRole('heading', { name: 'Armá tu biblioteca, sin cuenta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toHaveCount(0);

  // Mis listas, tocado a propósito, no rebota a Explorar.
  await page.getByRole('link', { name: 'Mis Listas', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('No tenés títulos en esta lista.')).toBeVisible();
});

test('se navega con teclado desde el salto al contenido', async ({ page }) => {
  // Se tabula desde el `body` y no con `keyboard.press` suelto: eso fija el
  // punto de partida de la navegación secuencial en el principio del
  // documento.
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

  // La biblioteca de ejemplo viene con el cuestionario contestado: es lo que hace que Explorar
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

test('lo que no te interesa se guarda y sobrevive a una recarga', async ({ page }) => {
  await page.getByRole('link', { name: 'Perfil' }).click();
  await page.getByRole('link', { name: 'Contanos de vos' }).click();

  const section = page.getByRole('region', { name: 'Lo que no te interesa' });
  const year = section.getByRole('button', { name: '1990', exact: true });
  await year.click();
  await expect(year).toHaveAttribute('aria-pressed', 'true');

  const western = section.getByRole('button', { name: 'Western', exact: true });
  await western.click();
  await expect(western).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  const reloaded = page.getByRole('region', { name: 'Lo que no te interesa' });
  await expect(reloaded.getByRole('button', { name: '1990', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(reloaded.getByRole('button', { name: 'Western', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('marcar el siguiente episodio desde el inicio', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Continuar viendo' })).toBeVisible();

  // Severance va por T2E4 en la biblioteca de ejemplo: el "+1" lo marca sin abrir la ficha.
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

  // En la biblioteca de ejemplo, The Bear está al día y ya anunció la temporada que viene.
  await expect(page.getByRole('heading', { name: 'Calendario', level: 1 })).toBeVisible();
  await expect(page.getByText('The Bear')).toBeVisible();
  await expect(page.getByText('Estreno de la temporada 4')).toBeVisible();

  // Las que siguen en emisión sin fecha van aparte.
  await expect(page.getByRole('heading', { name: 'Sin fecha confirmada' })).toBeVisible();
});

test('abandonar una serie la manda a Archivadas, y retomarla la devuelve', async ({ page }) => {
  await selectTab(page, /Viendo/);
  const card = page.getByRole('button', { name: /^Ver detalle de Arcane/ });
  await card.click();

  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Abandonar' }).click();

  const confirm = page.getByRole('dialog', { name: /¿Abandonás Arcane\?/ });
  await confirm.getByLabel(/¿Por qué la dejás\?/).fill('No me enganchó');
  await rate(confirm, '2 de 5 estrellas');
  await confirm.getByRole('button', { name: 'Abandonar' }).click();

  // Se va de Viendo, y el aviso dice adónde.
  await expect(page.getByText(/Abandonaste "Arcane"/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ver detalle de Arcane/ })).toHaveCount(0);

  // La biblioteca de ejemplo ya trae una en pausa y una abandonada: con Arcane son tres.
  await page.getByRole('button', { name: /Archivadas\s*3/ }).click();
  await expect(page.getByRole('heading', { name: 'Archivadas' })).toBeVisible();
  await page.getByRole('button', { name: /Abandonadas/ }).click();
  await expect(page.getByRole('button', { name: /^Ver detalle de/ })).toHaveCount(2);

  // La ficha cuenta dónde quedó y por qué.
  await page.getByRole('button', { name: /^Ver detalle de Arcane/ }).click();
  const archived = page.getByRole('dialog');
  await expect(archived.getByText(/La abandonaste el .*, en T1E5\./)).toBeVisible();
  await expect(archived.getByText('No me enganchó')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Retomar "Arcane"' }).click();
  await expect(page.getByText(/"Arcane" volvió a Viendo/)).toBeVisible();

  await page.getByRole('button', { name: 'Volver a las listas' }).click();
  await selectTab(page, /Viendo/);
  await expect(page.getByRole('button', { name: /^Ver detalle de Arcane/ })).toBeVisible();
});

test('una novedad de plataforma se descarta y no vuelve', async ({ page }) => {
  // En la biblioteca de ejemplo, Duna llegó a Max.
  await expect(page.getByRole('heading', { name: 'Novedades' })).toBeVisible();
  await expect(page.getByText('ya está en Max.')).toBeVisible();

  await page.getByRole('button', { name: 'Descartar la novedad de Duna' }).click();
  await expect(page.getByRole('heading', { name: 'Novedades' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Novedades' })).toHaveCount(0);
});

test('importar el export de Letterboxd, revisando lo dudoso', async ({ page }) => {
  // Sobre una biblioteca vacía, para que se vea solo lo importado.
  await startEmpty(page);

  // TMDB contesta lo que diría para cada título del export.
  await page.route('**/api/tmdb/find**', (route) => {
    const query = new URL(route.request().url()).searchParams.get('query');
    const movie = (id: number, title: string, year: number) => ({
      id,
      media_type: 'movie',
      title,
      original_title: title,
      year,
      poster_path: null,
      backdrop_path: null,
      genre_ids: [18],
    });
    const results =
      query === 'Past Lives'
        ? [movie(666277, 'Vidas pasadas', 2023)]
        : query === 'Oppenheimer'
          ? [movie(872585, 'Oppenheimer', 2023), movie(1, 'Oppenheimer', 2023)]
          : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
  });

  await page.goto('/perfil/ajustes');
  await page.getByRole('button', { name: 'Importar de Letterboxd, IMDb o Trakt' }).click();
  await page.getByLabel('Elegir los archivos del export').setInputFiles([
    'src/lib/importers/__fixtures__/letterboxd/diary.csv',
    'src/lib/importers/__fixtures__/letterboxd/ratings.csv',
  ]);
  await expect(page.getByText(/Letterboxd:/)).toBeVisible();

  await page.getByRole('button', { name: 'Buscar en TMDB' }).click();
  await expect(page.getByRole('heading', { name: 'Dudosos' })).toBeVisible();
  // El dudoso arranca en la primera opción, que es la buena.
  await expect(page.getByRole('radio', { name: /Oppenheimer · 2023$/ }).first()).toBeChecked();

  await page.getByRole('button', { name: /^Importar 2 títulos$/ }).click();
  await expect(page.getByText(/Importamos 2 títulos nuevos/)).toBeVisible();

  await page.goto('/');
  await selectTab(page, /Completadas/);
  await expect(page.getByRole('button', { name: /Ver detalle de Vidas pasadas/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ver detalle de Oppenheimer/ })).toBeVisible();
});

test('del reparto de una ficha a la página de la persona, y de vuelta', async ({ page }) => {
  // TMDB contesta la búsqueda, la ficha de Duna y la página de Javier Bardem.
  const duna = {
    id: 438631,
    media_type: 'movie',
    title: 'Duna',
    poster_path: null,
    backdrop_path: null,
    release_date: '2021-09-15',
    genre_ids: [878],
    overview: '',
  };
  await page.route('**/api/tmdb/search**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [duna] }) }),
  );
  await page.route('**/api/tmdb/detail**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...duna,
        genres: [{ id: 878, name: 'Ciencia ficción' }],
        runtime: 155,
        credits: { cast: [{ id: 3810, name: 'Javier Bardem', character: 'Stilgar', profile_path: null }] },
      }),
    }),
  );
  const credit = (id: number, title: string, date: string, vote_average: number, character: string) => ({
    id,
    media_type: 'movie',
    title,
    date,
    poster_path: null,
    role: 'reparto',
    character,
    job: null,
    vote_average,
    vote_count: 5000,
  });
  await page.route('**/api/tmdb/person-page**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        person: {
          id: 3810,
          name: 'Javier Bardem',
          profile_path: null,
          biography: 'Actor español.',
          birthday: '1969-03-01',
          deathday: null,
          place_of_birth: 'Las Palmas de Gran Canaria, España',
          known_for_department: 'Acting',
        },
        credits: [
          credit(438631, 'Duna', '2021-09-15', 7.8, 'Stilgar'),
          credit(6977, 'Sin lugar para los débiles', '2007-11-09', 7.9, 'Anton Chigurh'),
          credit(1913, 'Mar adentro', '2004-09-03', 7.8, 'Ramón Sampedro'),
        ],
      }),
    }),
  );

  // Desde el buscador, que vive en el marco y no en la página: tiene que
  // cerrarse solo al irse a otra.
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByRole('searchbox', { name: 'Buscar películas, series o personas' }).fill('duna');
  await search.getByRole('button', { name: 'Ver detalle de Duna', exact: true }).click();
  await page.getByRole('link', { name: 'Javier Bardem' }).click();

  await expect(page).toHaveURL(/\/persona\/3810$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Javier Bardem' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Duna está en el Por Ver de la biblioteca de ejemplo: no cuenta como vista ni como "te falta".
  await expect(page.getByText('Viste 0 de 3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Te faltan estas 2 bien puntuadas' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: /Filmografía/ }).getByRole('button', { name: /Duna/ }),
  ).toContainText('Por ver');

  // "Atrás" vuelve a la lista, sin ficha ni buscador encima.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('el catálogo filtra por género y guarda en Por Ver', async ({ page }) => {
  // TMDB contesta lo popular, o una de terror si se pide terror (27).
  const movie = (id: number, title: string, genre: number) => ({
    id,
    media_type: 'movie',
    title,
    poster_path: null,
    backdrop_path: null,
    release_date: '2013-07-19',
    genre_ids: [genre],
    overview: '',
  });
  await page.route('**/api/tmdb/discover**', (route) => {
    const url = new URL(route.request().url());
    const results =
      url.searchParams.get('genre') === '27'
        ? [movie(138843, 'El conjuro', 27)]
        : [movie(550, 'El club de la pelea', 18)];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results, page: 1, totalPages: 1 }),
    });
  });

  await page.goto('/explorar');
  await page.getByRole('link', { name: 'Catálogo' }).click();
  await expect(page).toHaveURL(/\/explorar\/catalogo$/);
  await expect(page.getByText('El club de la pelea', { exact: true })).toBeVisible();

  await page
    .getByRole('group', { name: /Filtrar por género/ })
    .getByRole('button', { name: 'Terror' })
    .click();
  await expect(page).toHaveURL(/genero=Terror/);
  await expect(page.getByText('El conjuro', { exact: true })).toBeVisible();
  await expect(page.getByText('El club de la pelea', { exact: true })).toHaveCount(0);

  const add = page.getByRole('button', { name: 'Agregar "El conjuro" a Por Ver' });
  await page.getByRole('button', { name: 'Ver detalle de El conjuro' }).hover();
  await add.click();
  await expect(
    page.getByRole('button', { name: '"El conjuro" ya está en tu biblioteca' }),
  ).toBeVisible();

  // Con "Ocultar lo que ya tengo", lo recién guardado se va de la grilla.
  await page.getByRole('button', { name: 'Ocultar lo que ya tengo' }).click();
  await expect(page.getByText('El conjuro', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ya tenés todo lo que hay con estos filtros.')).toBeVisible();

  await page.getByRole('link', { name: 'Mis Listas', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Ver detalle de El conjuro/ })).toBeVisible();
});

test('buscar un nombre lleva a la página de la persona', async ({ page }) => {
  // TMDB rankea primero a la persona: quien escribe "bardem" la busca a ella.
  await page.route('**/api/tmdb/search**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [],
        people: [
          {
            id: 3810,
            name: 'Javier Bardem',
            profile_path: null,
            known_for_department: 'Acting',
            known_for: ['Sin lugar para los débiles', 'Duna'],
          },
        ],
        people_first: true,
      }),
    }),
  );
  await page.route('**/api/tmdb/person-page**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        person: {
          id: 3810,
          name: 'Javier Bardem',
          profile_path: null,
          biography: '',
          birthday: null,
          deathday: null,
          place_of_birth: null,
          known_for_department: 'Acting',
        },
        credits: [],
      }),
    }),
  );

  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Buscar' });
  await search.getByRole('searchbox', { name: 'Buscar películas, series o personas' }).fill('bardem');
  await search.getByRole('link', { name: /Javier Bardem/ }).click();

  await expect(page).toHaveURL(/\/persona\/3810$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Javier Bardem' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.describe('en un celular', () => {
  // Con pantalla táctil Chromium responde `pointer: coarse`, igual que un iPhone.
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('los campos no tienen letra chica que dispare el zoom de iOS', async ({ page }) => {
    const search = page.getByLabel('Buscar en esta lista');
    await expect(search).toBeVisible();
    const fontSize = await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });
});
