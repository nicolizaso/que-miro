import { useEffect, useMemo, useState } from 'react';
import { SavedMedia, TMDbResult } from '@/types';
import { getRecommendations } from '@/lib/tmdb';
import { recommendationSeeds } from '@/lib/stats';
import { useMediaStore } from '@/store';

export interface RecommendationGroup {
  /** El título que originó estas recomendaciones. */
  seed: SavedMedia;
  results: TMDbResult[];
}

/** Cuántas recomendaciones se muestran por cada título semilla. */
const PER_SEED = 12;

/**
 * Recomendaciones armadas a partir de lo que puntuaste alto.
 *
 * El trabajo se reparte: TMDB dice qué se parece a qué —eso es lo que se
 * cachea en el servidor, porque es igual para todo el mundo— y el cliente arma
 * la lista final cruzándolo con la biblioteca de esta persona. Así el servidor
 * nunca necesita saber qué vio nadie.
 *
 * Lo que ya está guardado se descarta: recomendarte algo que ya tenés anotado
 * es la forma más rápida de que dejes de mirar la sección.
 */
export function useRecommendations(limitGroups = 3) {
  const mediaList = useMediaStore((state) => state.mediaList);
  const [groups, setGroups] = useState<RecommendationGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const seeds = useMemo(
    () => recommendationSeeds(mediaList, limitGroups),
    [mediaList, limitGroups],
  );
  // Las semillas se recalculan en cada render de la lista, así que el efecto se
  // ata a sus ids y no al array.
  const seedKey = seeds.map((media) => `${media.mediaType}-${media.tmdbId}`).join(',');

  const savedIds = useMemo(
    () => new Set(mediaList.map((media) => media.tmdbId)),
    [mediaList],
  );

  useEffect(() => {
    if (seeds.length === 0) {
      setGroups([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    Promise.allSettled(
      seeds.map((media) => getRecommendations(media.tmdbId, media.mediaType)),
    )
      .then((settled) => {
        if (cancelled) return;

        const seen = new Set<number>();
        const next: RecommendationGroup[] = [];

        settled.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;

          const results = result.value
            .filter((item) => {
              // Sin póster la fila queda con huecos grises; y un título
              // repetido entre dos semillas se muestra una sola vez.
              if (!item.poster_path) return false;
              if (savedIds.has(item.id) || seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            })
            .slice(0, PER_SEED);

          if (results.length > 0) next.push({ seed: seeds[index], results });
        });

        setGroups(next);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, savedIds]);

  return { groups, isLoading, hasSeeds: seeds.length > 0 };
}
