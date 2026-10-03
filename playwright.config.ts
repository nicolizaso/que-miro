import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de los tests de punta a punta.
 *
 * Corren contra el server de desarrollo, que monta las mismas rutas `/api` que
 * las funciones serverless de producción. No hace falta una `TMDB_API_KEY`: los
 * flujos que se prueban acá son los que no dependen de TMDB —progreso,
 * reseñas, filtros, navegación, sobre una biblioteca de ejemplo— y los que sí dependen se cubren en
 * los tests unitarios de `api/`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  /**
   * Pocos workers a propósito.
   *
   * Todos comparten el mismo server de Vite, que compila los módulos a pedido:
   * con un worker por núcleo, la app tarda tanto en responder que los tests
   * empiezan a expirar por congestión y no por un problema real.
   */
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  // Margen para la primera vez que se pide cada ruta, que es cuando Vite la
  // compila.
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    // Traza solo del reintento: guardar todas engorda el artefacto de CI sin
    // aportar nada cuando el test pasa.
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // El entorno trae Chromium preinstalado en otra ruta que la que espera
        // Playwright por defecto.
        launchOptions: process.env.CHROMIUM_PATH
          ? { executablePath: process.env.CHROMIUM_PATH }
          : {},
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
