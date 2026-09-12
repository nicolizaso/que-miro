// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Lectura de variables de entorno (Vite / Vercel)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Base de Firestore a usar dentro del proyecto.
 *
 * Casi siempre es `(default)`, la que crea la consola la primera vez. Pero un
 * proyecto puede tener bases con nombre —las creadas desde gcloud, o una
 * segunda base en otra región— y entonces el SDK, que apunta a `(default)`,
 * falla con "Database '(default)' not found" y la app deja de sincronizar sin
 * que se note: las escrituras se quedan encoladas en la caché local. Con esta
 * variable se apunta a la base que el proyecto realmente tenga.
 */
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID?.trim() || undefined;

// Validación de presencia de la API Key
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.apiKey.trim() !== '',
);

/**
 * Firestore con caché persistente.
 *
 * Es lo que hace que la app funcione sin conexión de verdad y no solo que
 * cargue: las lecturas salen de IndexedDB y las escrituras quedan encoladas
 * hasta que vuelve la red, momento en el que el SDK las manda solo. Sin esto,
 * cada cambio hecho en el subte se perdía con un aviso de error.
 *
 * `persistentMultipleTabManager` coordina varias pestañas sobre la misma caché;
 * sin él, la segunda pestaña que abre la app se queda sin persistencia.
 *
 * Si el navegador no deja usar IndexedDB (modo privado en algunos, storage
 * bloqueado), se cae a un Firestore común: la app sigue andando, online.
 */
function createFirestore(app: ReturnType<typeof initializeApp>): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      databaseId,
    );
  } catch (error) {
    console.warn(
      '[firebase] No se pudo activar la caché offline; seguimos online:',
      error,
    );
    return initializeFirestore(app, {}, databaseId);
  }
}

/**
 * Distingue "no existe la base de Firestore" de un corte de red cualquiera.
 *
 * Importa porque los dos síntomas se parecen —nada llega al servidor— pero el
 * remedio no: uno se arregla solo cuando vuelve la conexión y el otro no se
 * arregla nunca hasta que alguien cree la base en la consola de Firebase. Sin
 * separarlos, la app promete una sincronización que jamás va a ocurrir.
 */
export function isMissingDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? '';
  return (
    code === 'not-found' ||
    /database .*not (be )?found|does not exist/i.test(message)
  );
}

/**
 * Las reglas de Firestore rechazan lo que la app pide.
 *
 * Se separa de un error de red por lo mismo que el anterior: esto no mejora
 * esperando. O las reglas no se publicaron en este proyecto, o no cubren las
 * rutas que la app usa.
 */
export function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === 'permission-denied';
}

// Inicialización de servicios con el proyecto real
export const app = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : ({} as any);
export const auth = isFirebaseConfigured ? getAuth(app) : ({} as any);
export const db = isFirebaseConfigured ? createFirestore(app) : ({} as any);
export const googleProvider = isFirebaseConfigured
  ? new GoogleAuthProvider()
  : ({} as any);
