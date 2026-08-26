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

  const region = [preferredRegion, ...FALLBACK_REGIONS].find(
    (candidate) => results[candidate],
  );
  if (!region) return null;

  const entry = results[region];
  const providers = [
    ...(entry.flatrate ?? []),
    ...(entry.rent ?? []),
    ...(entry.buy ?? []),
  ].filter(
    (provider, index, list) =>
      list.findIndex((p) => p.provider_name === provider.provider_name) === index,
  );

  return providers.length > 0 ? { region, providers } : null;
}
