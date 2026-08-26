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
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn(
      '[firebase] No se pudo activar la caché offline; seguimos online:',
      error,
    );
    return initializeFirestore(app, {});
  }
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
