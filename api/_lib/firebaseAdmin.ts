import { App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin, para lo que el servidor hace solo: el cron de avisos.
 *
 * Las credenciales son las de una cuenta de servicio del proyecto y llegan
 * por variables de entorno, no en un archivo: en Vercel no hay dónde dejarlo,
 * y un JSON con la clave privada en el repo es justo lo que no tiene que
 * pasar. El proyecto y la base son los mismos que usa la app.
 */

/** Falta configurar algo: el mensaje dice qué, para leerlo en los logs. */
export class AdminConfigError extends Error {}

export function adminApp(): App {
  if (getApps().length > 0) return getApp();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // La consola de Vercel guarda la clave en una sola línea, con los saltos
  // escritos como `\n`: sin volverlos saltos de verdad, la clave no se lee.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const missing = [
    !projectId && 'FIREBASE_ADMIN_PROJECT_ID (o VITE_FIREBASE_PROJECT_ID)',
    !clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new AdminConfigError(`Faltan variables de entorno de Firebase Admin: ${missing.join(', ')}.`);
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

/** Firestore del proyecto, en la misma base con nombre que use la app, si usa una. */
export function adminFirestore(): Firestore {
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID?.trim();
  return databaseId ? getFirestore(adminApp(), databaseId) : getFirestore(adminApp());
}
