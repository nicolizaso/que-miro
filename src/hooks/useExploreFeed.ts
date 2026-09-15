import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMediaStore } from '@/store';
import { usePreferences } from '@/preferences';
import { tasteProfile } from '@/lib/taste';
import { FeedBlock, buildBlocks } from '@/lib/recipes';
import {
  PAGE_SIZE,
  TitleRegistry,
  createRegistry,
  orderBlocks,
  randomSeed,
} from '@/lib/feed';

export interface ExploreFeed {
  /** Las filas que ya se pueden dibujar. */
  blocks: FeedBlock[];
  /** Quedan filas para la próxima tanda. */
  hasMore: boolean;
  loadMore: () => void;
  /** Rearma el feed con un orden nuevo. */
  shuffle: () => void;
  /** Reparte los títulos entre las filas para que ninguno se repita. */
  registry: TitleRegistry;
  /** Si hay biblioteca suficiente como para personalizar algo. */
  isPersonal: boolean;
  /** Total de filas que se pueden armar con esta biblioteca. */
  total: number;
}

/**
 * El feed de Explorar: qué filas hay, en qué orden y de a cuántas.
 *
 * La semilla se estrena en cada visita a la pestaña, así que el orden cambia
 * aunque no hayas tocado la biblioteca; dentro de una visita, en cambio, se
 * mantiene igual, que es lo que el scroll infinito necesita para no reacomodar
 * las filas abajo del dedo.
 *
 * La biblioteca se congela al entrar por el mismo motivo: agregar algo desde
 * una fila cambiaría las semillas y rearmaría el feed entero en el momento
 * exacto en que la persona está mirando otra cosa. La foto se vuelve a sacar
 * solo cuando llega la sincronización —entrás con la biblioteca vacía y a los
 * dos segundos aparece— o cuando pedís barajar.
 */
export function useExploreFeed(): ExploreFeed {
  const mediaList = useMediaStore((state) => state.mediaList);
  const region = usePreferences((state) => state.region);

  const [seed, setSeed] = useState(randomSeed);
  const [pages, setPages] = useState(1);
  const [library, setLibrary] = useState(mediaList);

  useEffect(() => {
    if (library.length === 0 && mediaList.length > 0) setLibrary(mediaList);
  }, [mediaList, library.length]);

  const taste = useMemo(() => tasteProfile(library), [library]);

  const blocks = useMemo(
    () => orderBlocks(buildBlocks({ taste, region }), seed),
    [taste, region, seed],
  );

  // Un registro nuevo por cada orden nuevo: si no, las filas rearmadas
  // encontrarían todos sus títulos tomados por el orden anterior.
  const registry = useMemo(
    () => createRegistry(taste.savedIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taste, seed, region],
  );

  const loadMore = useCallback(() => setPages((current) => current + 1), []);

  const shuffle = useCallback(() => {
    setSeed(randomSeed());
    setPages(1);
    setLibrary(useMediaStore.getState().mediaList);
  }, []);

  const visible = blocks.slice(0, pages * PAGE_SIZE);

  return {
    blocks: visible,
    hasMore: visible.length < blocks.length,
    loadMore,
    shuffle,
    registry,
    isPersonal: taste.hasSignal,
    total: blocks.length,
  };
}
