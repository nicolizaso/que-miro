import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMediaStore } from '@/store';
import { usePreferences } from '@/preferences';
import { tasteProfile } from '@/lib/taste';
import { hasPicks, pickedTitleIds } from '@/lib/picks';
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
  /** Si hay con qué personalizar: biblioteca puntuada, respuestas, o las dos. */
  isPersonal: boolean;
  /** Si el cuestionario de "Contanos de vos" tiene alguna respuesta. */
  hasAnswers: boolean;
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
  const storedPicks = useMediaStore((state) => state.picks);
  const region = usePreferences((state) => state.region);

  const [seed, setSeed] = useState(randomSeed);
  const [pages, setPages] = useState(1);
  const [library, setLibrary] = useState(mediaList);
  const [picks, setPicksSnapshot] = useState(storedPicks);

  useEffect(() => {
    if (library.length === 0 && mediaList.length > 0) setLibrary(mediaList);
  }, [mediaList, library.length]);

  // El cuestionario se congela igual que la biblioteca, y por el mismo motivo:
  // lo único que lo mueve mientras alguien mira Explorar es la sincronización
  // —contestaste en el celular y llega acá—, que sí tiene que entrar.
  useEffect(() => {
    if (Date.parse(storedPicks.updatedAt) > Date.parse(picks.updatedAt)) {
      setPicksSnapshot(storedPicks);
    }
  }, [storedPicks, picks.updatedAt]);

  const taste = useMemo(() => tasteProfile(library), [library]);

  const blocks = useMemo(
    () => orderBlocks(buildBlocks({ taste, picks, region }), seed),
    [taste, picks, region, seed],
  );

  // Un registro nuevo por cada orden nuevo: si no, las filas rearmadas
  // encontrarían todos sus títulos tomados por el orden anterior.
  //
  // Los títulos que alguien declaró favoritos se descartan junto con los de la
  // biblioteca: recomendarle su propia película favorita es el único resultado
  // que con seguridad ya vio.
  const registry = useMemo(
    () => createRegistry(new Set([...taste.savedIds, ...pickedTitleIds(picks)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taste, picks, seed, region],
  );

  const loadMore = useCallback(() => setPages((current) => current + 1), []);

  const shuffle = useCallback(() => {
    setSeed(randomSeed());
    setPages(1);
    setLibrary(useMediaStore.getState().mediaList);
    setPicksSnapshot(useMediaStore.getState().picks);
  }, []);

  const visible = blocks.slice(0, pages * PAGE_SIZE);

  return {
    blocks: visible,
    hasMore: visible.length < blocks.length,
    loadMore,
    shuffle,
    registry,
    isPersonal: taste.hasSignal || hasPicks(picks),
    hasAnswers: hasPicks(picks),
    total: blocks.length,
  };
}
