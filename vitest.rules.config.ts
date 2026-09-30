import { defineConfig } from 'vitest/config';

/**
 * Los tests de las reglas de Firestore: corren en Node contra el emulador,
 * que levanta `npm run test:rules`. Van aparte de `npm test` porque sin el
 * emulador no hay contra qué correrlos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Todos comparten el mismo emulador y lo vacían antes de cada caso.
    fileParallelism: false,
  },
});
