/**
 * La primera impresión de quien llega sin cuenta.
 *
 * La app se usa sin iniciar sesión: el login es una puerta que se abre cuando
 * la persona quiere sincronizar, no la pantalla de entrada. Lo que hay que
 * resolver es qué ver antes de tener nada guardado.
 */

interface Visitor {
  /** Usa la app sin cuenta (ni demo: el demo ya trae biblioteca). */
  isGuest: boolean;
  /** Cuántos títulos tiene guardados en este dispositivo. */
  librarySize: number;
}

/**
 * Todavía no armó nada: es a quien hay que darle la bienvenida.
 *
 * Con cuenta no cuenta aunque la biblioteca esté vacía: puede estar bajando de
 * Firestore, y darle la bienvenida a alguien que ya tiene 300 títulos es peor
 * que no decirle nada.
 */
export function isNewVisitor({ isGuest, librarySize }: Visitor): boolean {
  return isGuest && librarySize === 0;
}

/**
 * Si al abrir la app hay que mandarla a Explorar en vez de a sus listas.
 *
 * Solo al abrirla: una biblioteca vacía no tiene nada para mostrar y Explorar
 * sí, pero quien después toca "Mis listas" a propósito tiene que llegar ahí.
 */
export function landsOnExplore(visitor: Visitor & { isInitialLoad: boolean }): boolean {
  return visitor.isInitialLoad && isNewVisitor(visitor);
}
