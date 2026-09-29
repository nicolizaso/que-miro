import { TMDbDetail } from '@/types';

/**
 * Regiones a las que se recurre si la elegida no tiene catálogo para el título.
 *
 * Mostrar plataformas de otro país es peor que no mostrar nada solo si no se
 * aclara: por eso quien usa esto siempre recibe también qué región terminó
 * usándose, para poder decirlo en pantalla.
 */
const FALLBACK_REGIONS = ['ES', 'US'];

export interface ProviderLogo {
  provider_name: string;
  logo_path: string;
}

export interface PickedProviders {
  region: string;
  providers: ProviderLogo[];
  /**
   * La página de TMDB con dónde verlo en esa región.
   *
   * La API da nombres y logos pero no el enlace a cada plataforma: esos viven
   * en esta página, que los arma con los datos de JustWatch. Solo hace falta
   * con la ficha abierta, así que no se guarda con el título.
   */
  link?: string;
}

/**
 * Las plataformas donde ver un título, en la región disponible más cercana a la
 * elegida.
 *
 * TMDB reparte la misma plataforma entre `flatrate`, `rent` y `buy`, así que
 * hay que deduplicar: si no, Netflix aparece tres veces.
 */
export function pickProviders(
  detail: TMDbDetail | null | undefined,
  preferredRegion: string,
): PickedProviders | null {
  const results = detail?.['watch/providers']?.results;
  if (!results) return null;

  // La primera región que tenga algo para mostrar: TMDB puede mandar una
  // región con su enlace y ninguna plataforma, y quedarse con esa sería decir
  // "no está en ningún lado" teniendo otra región con datos.
  for (const region of [preferredRegion, ...FALLBACK_REGIONS]) {
    const entry = results[region];
    if (!entry) continue;

    const providers = [
      ...(entry.flatrate ?? []),
      ...(entry.rent ?? []),
      ...(entry.buy ?? []),
    ].filter(
      (provider, index, list) =>
        list.findIndex((p) => p.provider_name === provider.provider_name) === index,
    );
    if (providers.length === 0) continue;

    // El enlace es el de la región que se terminó usando: el de la preferida
    // llevaría a una página que dice que no está en ningún lado.
    const link = safeTmdbLink(entry.link);
    return link ? { region, providers, link } : { region, providers };
  }

  return null;
}

/**
 * El enlace, solo si apunta a TMDB por https.
 *
 * Termina en el `href` de un enlace, así que no se confía en que venga bien:
 * un `javascript:` o un dominio cualquiera no se dibuja.
 */
function safeTmdbLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    const isTmdb =
      url.hostname === 'themoviedb.org' || url.hostname.endsWith('.themoviedb.org');
    return url.protocol === 'https:' && isTmdb ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
