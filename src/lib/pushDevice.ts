import { doc, runTransaction } from 'firebase/firestore';
import { app, db, isPushConfigured, vapidKey } from '@/lib/firebase';
import { languageForRegion } from '@/lib/language';
import {
  PushSnapshot,
  alertSeries,
  deviceCheck,
  parsePushSnapshot,
  pushPath,
  withToken,
  withoutToken,
} from '@/lib/push';
import { useMediaStore } from '@/store';
import { usePreferences } from '@/preferences';

/**
 * El lado del navegador de los avisos: pedir el token, anotarlo en la cuenta
 * y sacarlo. Lo que se decide está en `push.ts`; acá están Firebase y el
 * service worker.
 *
 * Los tokens se escriben en transacciones: dos dispositivos que se activan a
 * la vez leen la misma lista, y sin transacción el segundo pisaría al
 * primero. Sin conexión fallan, pero activar avisos sin red tampoco puede
 * andar: el token lo da FCM.
 */

/** Cuánto se espera al service worker antes de darse por vencido. */
const SERVICE_WORKER_TIMEOUT = 10_000;

/** Cuánto puede demorar el cierre de sesión por sacar el token. */
const RELEASE_TIMEOUT = 4_000;

export function currentPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** El service worker de la app. En desarrollo no hay: se corta con un error. */
function serviceWorker(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('No hay un service worker activo.')), SERVICE_WORKER_TIMEOUT),
    ),
  ]);
}

/**
 * El token de FCM de este navegador.
 *
 * Firebase Messaging se carga recién acá: pesa, y solo lo necesita quien
 * activa los avisos. Se le pasa el service worker de la app para que no
 * intente registrar el suyo (`firebase-messaging-sw.js`), que no existe: los
 * avisos los atiende `src/sw.ts`.
 */
export async function fetchToken(): Promise<string> {
  const [{ getMessaging, getToken }, registration] = await Promise.all([
    import('firebase/messaging'),
    serviceWorker(),
  ]);
  return getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
}

/**
 * Anula la suscripción de este navegador.
 *
 * Directo contra el `PushManager` y no con `deleteToken` de Firebase, que si
 * no se pidió un token en esta misma sesión intenta registrar su propio
 * service worker. Con la suscripción anulada FCM rechaza el token viejo, y el
 * próximo `getToken` saca uno nuevo.
 */
export async function unsubscribeThisDevice(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  await subscription?.unsubscribe();
}

/**
 * Anota un token en la cuenta, con el resto de la instantánea al día.
 *
 * Las series se escriben solo si la biblioteca ya bajó del servidor: antes,
 * la del dispositivo puede estar incompleta. Si no, quedan las que había y
 * `usePushSnapshot` las pone al día apenas termina de bajar.
 */
export async function addToken(uid: string, token: string, replacing?: string): Promise<void> {
  const ref = doc(db, pushPath(uid));
  const { mediaList, syncedUid } = useMediaStore.getState();
  const { region } = usePreferences.getState();

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? parsePushSnapshot(snapshot.data()) : null;
    const others = replacing
      ? withoutToken(current?.tokens ?? [], replacing)
      : (current?.tokens ?? []);
    transaction.set(ref, {
      tokens: withToken(others, token),
      series: syncedUid === uid ? alertSeries(mediaList) : (current?.series ?? []),
      region,
      language: languageForRegion(region),
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Saca un token de la cuenta. Sin ninguno, la instantánea ya no le sirve al
 * servidor —no hay a quién avisarle— y se borra: la lista de series no
 * queda publicada de gusto.
 */
export async function removeToken(uid: string, token: string): Promise<void> {
  const ref = doc(db, pushPath(uid));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const tokens = withoutToken(parsePushSnapshot(snapshot.data())?.tokens ?? [], token);
    if (tokens.length === 0) transaction.delete(ref);
    else transaction.update(ref, { tokens, updatedAt: new Date().toISOString() });
  });
}

/**
 * Al cerrar sesión, este dispositivo deja de recibir los avisos de la
 * cuenta: en una compu compartida seguirían llegando los de quien salió.
 *
 * Con tope de tiempo: sin red no se puede sacar el token del documento, y
 * salir no puede quedar colgado por eso. En ese caso la suscripción igual
 * queda anulada, y el cron borra el token cuando FCM lo rechace.
 */
export async function releasePushDevice(): Promise<void> {
  const { pushDevice, setPushDevice } = usePreferences.getState();
  if (!pushDevice || !isPushConfigured) return;
  setPushDevice(null);
  await Promise.race([
    Promise.allSettled([removeToken(pushDevice.uid, pushDevice.token), unsubscribeThisDevice()]),
    new Promise((resolve) => setTimeout(resolve, RELEASE_TIMEOUT)),
  ]);
}

/**
 * La revisión del token de este dispositivo al abrir la app (ver
 * `deviceCheck`). Si FCM lo renovó, o el cron lo sacó por muerto, se anota
 * el que vale ahora.
 */
export async function checkThisDevice(uid: string, snapshot: PushSnapshot | null): Promise<void> {
  const { pushDevice, setPushDevice } = usePreferences.getState();
  const action = deviceCheck(pushDevice, uid, currentPermission());
  if (action === 'none' || !pushDevice) return;

  if (action === 'other-account') {
    setPushDevice(null);
    await unsubscribeThisDevice();
    return;
  }
  if (action === 'revoked') {
    setPushDevice(null);
    await removeToken(uid, pushDevice.token);
    return;
  }

  const token = await fetchToken();
  if (token === pushDevice.token && snapshot?.tokens.includes(token)) return;
  await addToken(uid, token, pushDevice.token);
  setPushDevice({ token, uid });
}
