// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuración leída estrictamente desde las variables de entorno de Vite/Vercel
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Verifica que la API key exista y no esté vacía
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.apiKey.trim() !== ''
);

// Inicialización de servicios
export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : ({} as any);
export const auth = isFirebaseConfigured ? getAuth(app) : ({} as any);
export const db = isFirebaseConfigured ? getFirestore(app) : ({} as any);
export const googleProvider = isFirebaseConfigured ? new GoogleAuthProvider() : ({} as any);