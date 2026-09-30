import { TMDB_AVATAR_URL } from '@/lib/tmdb';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
} as const;

/**
 * El avatar de alguien: un póster o una imagen de fondo de TMDB recortada en
 * un círculo, o su inicial si no eligió ninguna. Decorativo: el nombre siempre
 * está escrito al lado.
 */
export function Avatar({
  name,
  avatarPath,
  size = 'md',
  className,
}: {
  name: string;
  avatarPath: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'rounded-full bg-border-card overflow-hidden flex items-center justify-center shrink-0 font-bold uppercase text-text-muted',
        SIZES[size],
        className,
      )}
    >
      {avatarPath ? (
        <img src={`${TMDB_AVATAR_URL}${avatarPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        (name.trim()[0] ?? '?')
      )}
    </span>
  );
}
