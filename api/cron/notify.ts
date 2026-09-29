import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { AdminConfigError, adminApp, adminFirestore } from '../_lib/firebaseAdmin.js';
import { PlannedMessage, runNotify, todayUtc } from '../_lib/notify.js';
import { getAiring } from '../_lib/tmdb.js';

/**
 * El cron diario de avisos de episodios (ver `crons` en `vercel.json`).
 *
 * Lee `push_subscriptions` —tokens, idioma y los ids de las series con
 * aviso, nada más—, le pregunta a TMDB por cada serie una sola vez y avisa a
 * cada dispositivo de lo que sale hoy. No lee `saved_media`: el servidor no
 * sabe qué vio nadie. Toda la lógica de a quién avisarle qué está en
 * `_lib/notify.ts`; acá solo se conecta con Firestore, TMDB y FCM.
 */

/**
 * Cuánto espera FCM a un dispositivo apagado: pasado medio día, "sale hoy"
 * ya no es cierto y el aviso es ruido.
 */
const MESSAGE_TTL_SECONDS = 12 * 60 * 60;

/**
 * Se manda solo `data`, sin `notification`: así la notificación la arma el
 * service worker de la app (`src/sw.ts`) con su ícono y su enlace. FCM
 * exige que todos los valores sean texto.
 */
function toFcmMessage(message: PlannedMessage) {
  return {
    token: message.token,
    data: { title: message.title, body: message.body, url: message.url, tag: message.tag },
    webpush: { headers: { TTL: String(MESSAGE_TTL_SECONDS) } },
  };
}

/**
 * Saca los tokens muertos de una cuenta. En una transacción: si justo ahora
 * la app suma un dispositivo, no se pisa. Sin dispositivos, la instantánea ya
 * no le sirve a nadie y se borra, igual que cuando se apaga el último desde
 * la app.
 */
async function removeTokens(db: Firestore, uid: string, dead: string[]): Promise<void> {
  const ref = db.doc(`push_subscriptions/${uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const current: unknown = snapshot.get('tokens');
    const tokens = (Array.isArray(current) ? current : []).filter(
      (token): token is string => typeof token === 'string' && !dead.includes(token),
    );
    if (tokens.length === 0) transaction.delete(ref);
    else transaction.update(ref, { tokens });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel manda el secreto en cada corrida programada. Sin él configurado no
  // se corre nunca: una URL pública que dispara avisos a todo el mundo no es
  // algo que pueda quedar abierto por olvido.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  try {
    const db = adminFirestore();
    const messaging = getMessaging(adminApp());

    const summary = await runNotify({
      today: todayUtc(),
      readSubscriptions: async () => {
        const snapshot = await db.collection('push_subscriptions').get();
        return snapshot.docs.map((doc) => ({ uid: doc.id, data: doc.data() }));
      },
      fetchAiring: (id, language) => getAiring(id, language),
      send: async (messages) => {
        const { responses } = await messaging.sendEach(messages.map(toFcmMessage));
        return responses.map((response) =>
          response.success ? undefined : (response.error?.code ?? 'desconocido'),
        );
      },
      removeTokens: (uid, tokens) => removeTokens(db, uid, tokens),
    });

    console.info('[avisos] Corrida terminada:', summary);
    return res.status(200).json(summary);
  } catch (error) {
    if (error instanceof AdminConfigError) {
      console.error('[avisos]', error.message);
      return res.status(500).json({ error: error.message });
    }
    console.error('[avisos] La corrida falló:', error);
    return res.status(500).json({ error: 'La corrida falló.' });
  }
}
