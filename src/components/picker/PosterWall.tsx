import { TMDB_AVATAR_URL } from '@/lib/tmdb';

/** Lugares de la grilla: alcanza para cubrir el ancho de una pantalla grande. */
const SLOTS = 24;

/**
 * El fondo del picker: los pósters de la propia lista, apagados y en diagonal.
 *
 * Es decoración y nada más —`aria-hidden`, sin eventos—, pero hace que la
 * pantalla tenga la cara de lo que la persona quiere ver en vez de un vacío
 * negro. La deriva lenta se apaga con `prefers-reduced-motion`.
 *
 * Los pósters van en 185 px: se ven chicos y apagados, y el de 500 pesaría
 * cinco veces más para nada.
 */
export function PosterWall({ posters }: { posters: string[] }) {
  if (posters.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] sm:h-[26rem] overflow-hidden -z-10"
    >
      <div className="poster-wall absolute -inset-x-1/4 -top-24 grid grid-cols-6 sm:grid-cols-9 lg:grid-cols-12 gap-3 -rotate-6 motion-safe:animate-drift">
        {Array.from({ length: SLOTS }, (_, i) => (
          <img
            key={i}
            src={`${TMDB_AVATAR_URL}${posters[i % posters.length]}`}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full aspect-[2/3] object-cover rounded-md"
          />
        ))}
      </div>
      <div className="poster-wall-scrim absolute inset-0" />
    </div>
  );
}
