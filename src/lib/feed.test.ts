import { describe, expect, it } from 'vitest';
import {
  MIN_RESULTS,
  PAGE_SIZE,
  createRegistry,
  mulberry32,
  orderBlocks,
} from './feed';
import { BlockFamily, FeedBlock } from '@/lib/recipes';
import { TMDbResult } from '@/types';

function makeBlock(
  id: string,
  family: BlockFamily,
  weight = 5,
): FeedBlock {
  return { id, family, title: id, weight, fetch: async () => [] };
}

function makeResult(id: number, posterPath: string | null = '/p.jpg'): TMDbResult {
  return {
    id,
    media_type: 'movie',
    title: `Título ${id}`,
    poster_path: posterPath,
    backdrop_path: null,
    genre_ids: [],
    overview: '',
  };
}

describe('mulberry32', () => {
  it('con la misma semilla da siempre la misma secuencia', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('con semillas distintas da secuencias distintas', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('devuelve números entre 0 y 1', () => {
    const random = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('orderBlocks', () => {
  const blocks = [
    makeBlock('semilla-1', 'semilla', 10),
    makeBlock('semilla-2', 'semilla', 10),
    makeBlock('semilla-3', 'semilla', 9),
    makeBlock('gente-1', 'gente', 9),
    makeBlock('gente-2', 'gente', 8),
    makeBlock('genero-1', 'genero', 8),
    makeBlock('general-1', 'general', 3),
    makeBlock('general-2', 'general', 3),
  ];

  it('no pierde ni repite ninguna fila', () => {
    const ordered = orderBlocks(blocks, 1234);

    expect(ordered).toHaveLength(blocks.length);
    expect(new Set(ordered.map((block) => block.id)).size).toBe(blocks.length);
  });

  it('con la misma semilla devuelve el mismo orden', () => {
    const ids = (seed: number) =>
      orderBlocks(blocks, seed).map((block) => block.id);

    expect(ids(99)).toEqual(ids(99));
  });

  it('con semillas distintas cambia el orden', () => {
    const uno = orderBlocks(blocks, 1).map((block) => block.id);
    const otro = orderBlocks(blocks, 987654).map((block) => block.id);

    expect(uno).not.toEqual(otro);
  });

  it('no pone dos filas seguidas de la misma familia si puede evitarlo', () => {
    for (const seed of [1, 2, 3, 42, 777, 123456]) {
      const ordered = orderBlocks(blocks, seed);

      // Las últimas pueden repetir familia: cuando solo quedan filas de una,
      // separar significaría tirar filas.
      const head = ordered.slice(0, 5);
      head.forEach((block, index) => {
        if (index === 0) return;
        expect(block.family).not.toBe(head[index - 1].family);
      });
    }
  });

  it('nunca abre el feed con una fila de todos', () => {
    // El azar sacude el orden, no lo da vuelta: "películas populares" no puede
    // ganarle el primer lugar a una fila armada con tu biblioteca.
    for (let seed = 0; seed < 25; seed++) {
      expect(orderBlocks(blocks, seed)[0].weight).toBeGreaterThanOrEqual(8);
    }
  });

  it('deja las filas personales adelante y las de todos atrás', () => {
    const position = (ordered: FeedBlock[], prefix: string) => {
      const indexes = ordered
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.id.startsWith(prefix))
        .map(({ index }) => index);
      return indexes.reduce((sum, index) => sum + index, 0) / indexes.length;
    };

    for (let seed = 0; seed < 25; seed++) {
      const ordered = orderBlocks(blocks, seed);
      expect(position(ordered, 'general')).toBeGreaterThan(
        position(ordered, 'semilla'),
      );
    }
  });

  it('la primera tanda alcanza para llenar la pantalla', () => {
    expect(orderBlocks(blocks, 5).slice(0, PAGE_SIZE)).toHaveLength(PAGE_SIZE);
  });
});

describe('createRegistry', () => {
  it('le da cada título a la primera fila que lo pide', () => {
    const registry = createRegistry(new Set());

    const primera = registry.claim('fila-1', [makeResult(1), makeResult(2)]);
    const segunda = registry.claim('fila-2', [makeResult(2), makeResult(3)]);

    expect(primera.map((result) => result.id)).toEqual([1, 2]);
    expect(segunda.map((result) => result.id)).toEqual([3]);
  });

  it('descarta lo que ya está en tu biblioteca', () => {
    const registry = createRegistry(new Set([1]));

    const claimed = registry.claim('fila', [makeResult(1), makeResult(2)]);
    expect(claimed.map((result) => result.id)).toEqual([2]);
  });

  it('pero no en las filas que muestran tu biblioteca a propósito', () => {
    const registry = createRegistry(new Set([1]));

    const claimed = registry.claim('terminar', [makeResult(1)], true);
    expect(claimed.map((result) => result.id)).toEqual([1]);
  });

  it('descarta lo que no tiene póster', () => {
    const registry = createRegistry(new Set());

    const claimed = registry.claim('fila', [makeResult(1, null), makeResult(2)]);
    expect(claimed.map((result) => result.id)).toEqual([2]);
  });

  it('reclamar dos veces desde la misma fila devuelve lo mismo', () => {
    // React monta dos veces cada componente en desarrollo: sin esto, la segunda
    // pasada encontraría sus propios títulos tomados y dejaría la fila vacía.
    const registry = createRegistry(new Set());
    const results = [makeResult(1), makeResult(2)];

    expect(registry.claim('fila', results)).toEqual(registry.claim('fila', results));
  });

  it('una fila flaca no llega al mínimo para dibujarse', () => {
    const registry = createRegistry(new Set([1, 2, 3]));

    const claimed = registry.claim('fila', [
      makeResult(1),
      makeResult(2),
      makeResult(3),
      makeResult(4),
    ]);

    expect(claimed.length).toBeLessThan(MIN_RESULTS);
  });
});
