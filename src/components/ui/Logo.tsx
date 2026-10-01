import { LOGO_GLYPH, LOGO_RADIUS, LOGO_SIZE } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * El logo dentro de la app.
 *
 * Es el mismo dibujo que el ícono instalado, pero con los colores del tema en
 * vez de los fijos: así en tema claro sigue al acento más oscuro, igual que
 * los botones.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`}
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={LOGO_SIZE} height={LOGO_SIZE} rx={LOGO_RADIUS} className="fill-accent" />
      <g
        transform={LOGO_GLYPH.transform}
        className="fill-accent-contrast stroke-accent-contrast"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={LOGO_GLYPH.hook} fill="none" strokeWidth={LOGO_GLYPH.hookWidth} />
        <path d={LOGO_GLYPH.play} strokeWidth={LOGO_GLYPH.playWidth} />
      </g>
    </svg>
  );
}
