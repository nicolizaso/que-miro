/**
 * Traduce los códigos de error de Firebase Auth a mensajes que le sirvan a una
 * persona. Sin esto la UI termina mostrando cosas como
 * "Firebase: Error (auth/invalid-credential)".
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'El email no tiene un formato válido.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada.',
  'auth/user-not-found': 'No encontramos una cuenta con ese email.',
  'auth/wrong-password': 'La contraseña es incorrecta.',
  'auth/invalid-credential': 'El email o la contraseña son incorrectos.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
  'auth/too-many-requests':
    'Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.',
  'auth/network-request-failed':
    'No pudimos conectarnos. Revisá tu conexión a internet.',
  'auth/popup-closed-by-user': 'Cerraste la ventana antes de iniciar sesión.',
  'auth/cancelled-popup-request': 'Cerraste la ventana antes de iniciar sesión.',
  'auth/popup-blocked':
    'Tu navegador bloqueó la ventana emergente. Habilitala e intentá de nuevo.',
  'auth/unauthorized-domain':
    'Este dominio no está autorizado en Firebase para login con Google. Podés ingresar con email y contraseña o continuar como invitado.',
  'auth/operation-not-allowed':
    'Este método de inicio de sesión no está habilitado en el proyecto.',
};

/** Devuelve un mensaje presentable para cualquier error de Firebase Auth. */
export function getAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }
  return 'No pudimos completar la operación. Intentá de nuevo en un momento.';
}
