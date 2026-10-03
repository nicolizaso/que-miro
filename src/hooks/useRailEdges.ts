import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

export interface RailEdges {
  atStart: boolean;
  atEnd: boolean;
  /** Si hay más contenido del que entra. Sin esto no hace falta ningún control. */
  overflows: boolean;
}

const INITIAL: RailEdges = { atStart: true, atEnd: true, overflows: false };

/**
 * Mide una fila que se desplaza en horizontal y le da flechas.
 *
 * Lo comparten las filas de pósters (`ScrollRail`) y las de filtros del picker
 * (`FilterRail`): las dos esconden la barra de scroll y necesitan saber si
 * desbordan y si llegaron a una punta para prender flechas y degradados.
 */
export function useRailEdges<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  edges: RailEdges;
  scrollBy: (direction: 1 | -1) => void;
} {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<RailEdges>(INITIAL);
  const reduceMotion = useReducedMotion();

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;
    // El margen de 1px es por los anchos fraccionarios: con zoom del navegador
    // `scrollLeft` llega a 248.5 sobre un máximo de 249 y la flecha quedaría
    // habilitada para siempre.
    const next: RailEdges = {
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft >= max - 1,
      overflows: max > 1,
    };

    setEdges((prev) =>
      prev.atStart === next.atStart &&
      prev.atEnd === next.atEnd &&
      prev.overflows === next.overflows
        ? prev
        : next,
    );
  }, []);

  // Sin dependencias: corre después de cada render, que es justo cuando puede
  // haber cambiado el contenido —los esqueletos de carga dan paso a los
  // resultados, o un filtro cambia las cuentas— y la fila pasa de no desbordar
  // a desbordar. `measure` solo lee el layout y descarta el `setState` si nada
  // cambió, así que no se realimenta.
  useEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // El listener va en el elemento y no en `window`, y es pasivo: no bloquea
    // el scroll ni dibuja nada por frame, solo prende y apaga dos flechas.
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  const scrollBy = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // Casi una pantalla, no una entera: deja algo de la vista anterior como
    // punto de referencia de dónde estabas.
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  return { ref, edges, scrollBy };
}
