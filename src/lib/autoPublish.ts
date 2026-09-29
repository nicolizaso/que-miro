/**
 * Publicar solo, sin publicar de más.
 *
 * Lo usan las instantáneas que se mantienen al día sin que nadie toque
 * "Actualizar": el perfil público y las listas compartidas. Tres reglas:
 *
 * - **Debounce.** Cada cambio reinicia la espera; se publica una vez, con lo
 *   último, cuando las cosas se quedan quietas.
 * - **Un mínimo entre publicaciones.** Aunque haya cambios, no se escribe más
 *   seguido que eso.
 * - **Sin red, no se intenta.** Lo pendiente espera a `online()`: nada de
 *   reintentos en loop, y cuando vuelve la red se publica lo último, no una
 *   cola de versiones viejas.
 *
 * Y si lo que hay para publicar es igual a lo publicado, no se escribe.
 */

export interface AutoPublisherOptions<T> {
  debounceMs: number;
  minIntervalMs: number;
  /** Cuándo fue la última publicación, en milisegundos; `null` si nunca. */
  lastPublishedAt: () => number | null;
  /** Si esto ya es lo que está publicado. */
  isPublished: (value: T) => boolean;
  publish: (value: T) => void;
  isOnline: () => boolean;
  now?: () => number;
}

export interface AutoPublisher<T> {
  /** Hay algo nuevo: reemplaza lo pendiente y reinicia la espera. */
  schedule: (value: T) => void;
  /** Volvió la red: si quedó algo pendiente, se vuelve a programar. */
  online: () => void;
  /** Se descarta lo pendiente: se cerró sesión o se apagó la opción. */
  cancel: () => void;
}

export function createAutoPublisher<T>(options: AutoPublisherOptions<T>): AutoPublisher<T> {
  const now = options.now ?? Date.now;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const run = () => {
    timer = null;
    if (!pending || !options.isOnline()) return;
    const { value } = pending;
    pending = null;
    if (!options.isPublished(value)) options.publish(value);
  };

  const arm = () => {
    clear();
    const last = options.lastPublishedAt();
    const untilAllowed = last === null ? 0 : last + options.minIntervalMs - now();
    timer = setTimeout(run, Math.max(options.debounceMs, untilAllowed));
  };

  return {
    schedule(value) {
      pending = { value };
      arm();
    },
    online() {
      if (pending && timer === null) arm();
    },
    cancel() {
      clear();
      pending = null;
    },
  };
}
