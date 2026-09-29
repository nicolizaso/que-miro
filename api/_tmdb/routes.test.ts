import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TMDB_ROUTES, dispatchTmdb } from './routes';

const ROOT = process.cwd();

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** Un `res` de mentira: guarda el estado y el cuerpo que se respondió. */
function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader(name: string, value: unknown) {
      res.headers[name] = value;
      return res;
    },
  };
  return res;
}

function request(query: Record<string, string>): VercelRequest {
  return { query } as unknown as VercelRequest;
}

describe('las rutas de /api/tmdb', () => {
  it('están todas las que pide el cliente', () => {
    const used = new Set<string>();
    for (const file of filesUnder(join(ROOT, 'src'))) {
      if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/\/api\/tmdb\/([a-z-]+)/g)) used.add(name);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(Object.keys(TMDB_ROUTES), `falta /api/tmdb/${name}`).toContain(name);
  });

  it('el server de desarrollo monta las mismas', () => {
    const server = readFileSync(join(ROOT, 'server.ts'), 'utf8');
    const mounted = Array.from(server.matchAll(/app\.get\(\s*'\/api\/tmdb\/([a-z-]+)'/g), ([, name]) => name);
    expect(mounted.sort()).toEqual(Object.keys(TMDB_ROUTES).sort());
  });

  it('cada nombre va a su handler, y uno que no existe es un 404', async () => {
    // Sin `query`, la búsqueda contesta 400 sin salir a la red: alcanza para
    // saber que llegó a su handler.
    const search = fakeRes();
    await dispatchTmdb(request({ endpoint: 'search' }), search as unknown as VercelResponse);
    expect(search.statusCode).toBe(400);
    expect(search.body).toEqual({ error: "Falta el parámetro 'query'." });

    for (const endpoint of ['nada', 'toString', '__proto__', '']) {
      const res = fakeRes();
      await dispatchTmdb(request({ endpoint }), res as unknown as VercelResponse);
      expect(res.statusCode, endpoint).toBe(404);
    }
  });
});

describe('las funciones de Vercel', () => {
  it('no pasan de 12, el tope del plan Hobby por deploy', () => {
    // Cada archivo de `api/` es una función, salvo lo que está en una
    // carpeta o archivo que empieza con guion bajo. Pasarse no rompe el
    // build local: Vercel rechaza el deploy entero.
    const functions = filesUnder(join(ROOT, 'api'))
      .map((file) => relative(join(ROOT, 'api'), file))
      .filter((file) => /\.(ts|js|mjs|cjs)$/.test(file) && !/\.d\.ts$/.test(file))
      .filter((file) => !file.split(/[\\/]/).some((part) => part.startsWith('_') || part.startsWith('.')));
    expect(functions.length, functions.join('\n')).toBeLessThanOrEqual(12);
  });
});
