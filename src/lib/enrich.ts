import { SavedMedia, TMDbDetail } from '@/types';
import { pickProviders } from '@/lib/providers';

/** Cuántas plataformas se guardan por título. Más que esto no aporta nada. */
const MAX_PROVIDERS = 8;

/** Los campos que se completan con la ficha de TMDB al guardar un título. */
export type MediaEnrichment = Pick<
  SavedMedia,
  'runtime' | 'seasons' | 'totalEpisodes' | 'providers' | 'providerRegion'
>;

/**
 * Extrae de la ficha de TMDB lo que la biblioteca necesita cachear.
 *
 * Se guarda en el título, en el momento de agregarlo, porque quienes lo usan
 * —el filtro por plataforma, el progreso por episodio, y el picker de la
 * próxima tanda— trabajan sobre la biblioteca entera. Pedirle a TMDB la ficha
 * de cada título cada vez que alguien mueve un filtro no es viable.
 *
 * La contracara es que son datos que envejecen: una serie suma temporadas y un
 * catálogo de streaming cambia todos los meses. Por eso {@link isStale} marca
 * cuándo conviene refrescarlos.
 */
export function enrichFromDetail(
  detail: TMDbDetail,
  preferredRegion: string,
): MediaEnrichment {
  const picked = pickProviders(detail, preferredRegion);

  const seasons = detail.seasons
    ?.filter((season) => season.episode_count > 0)
    .map((season) => ({
      seasonNumber: season.season_number,
      name: season.name || `Temporada ${season.season_number}`,
      episodeCount: season.episode_count,
    }));

  // En películas TMDB da `runtime`; en series, una lista de duraciones por
  // episodio de la que alcanza con la primera.
  const runtime = detail.runtime ?? detail.episode_run_time?.[0] ?? null;

  return {
    runtime: runtime && runtime > 0 ? runtime : null,
    seasons: seasons?.length ? seasons : undefined,
    totalEpisodes: detail.number_of_episodes ?? null,
    providers: picked?.providers
      .slice(0, MAX_PROVIDERS)
      .map((provider) => provider.provider_name),
    providerRegion: picked?.region,
  };
}

/** Los datos cacheados de un título están vencidos o nunca se trajeron. */
export function isStale(media: SavedMedia, region: string): boolean {
  if (media.providerRegion === undefined) return true;
  // Cambiar el país de las plataformas invalida lo que se había guardado con
  // el catálogo del país anterior.
  return media.providerRegion !== region;
}
