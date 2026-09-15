import { Keyword, Person, SavedMedia, TMDbDetail } from '@/types';
import { pickProviders } from '@/lib/providers';

/** Cuántas plataformas se guardan por título. Más que esto no aporta nada. */
const MAX_PROVIDERS = 8;

/**
 * Cuánta gente se guarda por título.
 *
 * El reparto principal y nada más: en el puesto quince de los créditos de una
 * película están el mozo y el policía de la esquina, y nadie eligió una peli
 * por ellos. Ocho es donde todavía hay caras que alguien podría reconocer.
 */
const MAX_CAST = 8;

/** Temas por título. Son para agrupar, no para describir: con seis alcanza. */
const MAX_KEYWORDS = 8;

/** Los campos que se completan con la ficha de TMDB al guardar un título. */
export type MediaEnrichment = Pick<
  SavedMedia,
  | 'runtime'
  | 'seasons'
  | 'totalEpisodes'
  | 'providers'
  | 'providerRegion'
  | 'people'
  | 'keywords'
  | 'sagaId'
  | 'sagaName'
  | 'originalLanguage'
>;

/**
 * El reparto principal y quienes dirigieron, en una sola lista.
 *
 * En las películas la dirección está en `crew`; en las series, en `created_by`
 * —TMDB no las trata igual, pero para recomendar son lo mismo: la persona
 * cuya firma se reconoce en lo que uno vio.
 */
export function peopleFromDetail(detail: TMDbDetail): Person[] {
  const cast: Person[] = (detail.credits?.cast ?? [])
    .slice(0, MAX_CAST)
    .map((member) => ({
      id: member.id,
      name: member.name,
      role: 'reparto' as const,
      profilePath: member.profile_path,
    }));

  const directors: Person[] = (detail.credits?.crew ?? [])
    .filter((member) => member.job === 'Director')
    .map((member) => ({
      id: member.id,
      name: member.name,
      role: 'direccion' as const,
      profilePath: member.profile_path,
    }));

  const creators: Person[] = (detail.created_by ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    role: 'direccion' as const,
    profilePath: member.profile_path,
  }));

  // Dirección primero: si alguien dirigió y además actuó, el rol que importa
  // para recomendar es el de dirección.
  const all = [...directors, ...creators, ...cast];
  return all.filter(
    (person, index) => all.findIndex((p) => p.id === person.id) === index,
  );
}

/** Los temas del título, vengan del campo de películas o del de series. */
function keywordsFromDetail(detail: TMDbDetail): Keyword[] | undefined {
  const raw = detail.keywords?.keywords ?? detail.keywords?.results ?? [];
  const keywords = raw
    .filter((keyword) => keyword?.id && keyword?.name)
    .slice(0, MAX_KEYWORDS)
    .map((keyword) => ({ id: keyword.id, name: keyword.name }));

  return keywords.length > 0 ? keywords : undefined;
}

/**
 * Extrae de la ficha de TMDB lo que la biblioteca necesita cachear.
 *
 * Se guarda en el título, en el momento de agregarlo, porque quienes lo usan
 * —el filtro por plataforma, el progreso por episodio, el picker de la próxima
 * tanda y las filas de Explorar— trabajan sobre la biblioteca entera. Pedirle a
 * TMDB la ficha de cada título cada vez que alguien mueve un filtro o abre
 * Explorar no es viable.
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

  const people = peopleFromDetail(detail);

  return {
    runtime: runtime && runtime > 0 ? runtime : null,
    seasons: seasons?.length ? seasons : undefined,
    totalEpisodes: detail.number_of_episodes ?? null,
    providers: picked?.providers
      .slice(0, MAX_PROVIDERS)
      .map((provider) => provider.provider_name),
    providerRegion: picked?.region,
    // Siempre un array, aunque venga vacío: es lo que distingue "este título no
    // tiene reparto cargado en TMDB" de "todavía no le pedimos la ficha", que
    // es lo que mira {@link needsPeople} para no repetir el pedido eternamente.
    people,
    keywords: keywordsFromDetail(detail),
    sagaId: detail.belongs_to_collection?.id ?? null,
    sagaName: detail.belongs_to_collection?.name,
    originalLanguage: detail.original_language,
  };
}

/** Los datos cacheados de un título están vencidos o nunca se trajeron. */
export function isStale(media: SavedMedia, region: string): boolean {
  if (media.providerRegion === undefined) return true;
  // Cambiar el país de las plataformas invalida lo que se había guardado con
  // el catálogo del país anterior.
  return media.providerRegion !== region;
}

/**
 * Al título le falta el reparto, que se empezó a guardar después que él.
 *
 * Los títulos guardados antes de que existieran las filas por gente no tienen
 * `people`, y sin eso Explorar no puede hablar de directores ni de actrices.
 * Explorar los completa de a poco, en segundo plano.
 */
export function needsPeople(media: SavedMedia): boolean {
  return media.people === undefined;
}
