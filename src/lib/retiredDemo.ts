/**
 * Lo que dejó en el dispositivo el modo demo, que ya no existe.
 *
 * Quien estaba recorriendo el demo cuando se sacó tiene la biblioteca de
 * ejemplo guardada como si fuera suya y, aparte, la copia de lo que tenía
 * antes de entrar. Sin esto se quedaría para siempre con títulos que no
 * eligió y sin los propios. Se corre una vez al arrancar y no deja rastro:
 * cuando ya no quede nadie con esas claves se puede borrar el módulo entero.
 */
import {
  Following,
  Goals,
  Restrictions,
  SavedMedia,
  SocialSettings,
  Subscriptions,
  TastePicks,
} from '@/types';
import { useMediaStore } from '@/store';
import { parseMedia } from '@/lib/schema';
import { emptyPicks, parsePicks } from '@/lib/picks';
import { emptyGoals, parseGoals } from '@/lib/goals';
import { emptySubscriptions, parseSubscriptions } from '@/lib/subscriptions';
import { emptyRestrictions, parseRestrictions } from '@/lib/restrictions';
import { emptyFollowing, parseFollowing } from '@/lib/following';
import { emptySocialSettings, parseSocialSettings } from '@/lib/social';

/** La marca de "estoy en el demo". */
export const DEMO_FLAG_KEY = 'que-miro-demo';
/** La copia de lo que había antes de entrar al demo. */
export const PRE_DEMO_KEY = 'que-miro-pre-demo';
/** El dueño ficticio de la biblioteca de ejemplo. */
export const DEMO_OWNER_UID = 'demo';

export interface PreDemoData {
  media: SavedMedia[];
  picks: TastePicks;
  goals: Goals;
  subscriptions: Subscriptions;
  restrictions: Restrictions;
  following: Following;
  socialSettings: SocialSettings;
}

function emptyData(): PreDemoData {
  return {
    media: [],
    picks: emptyPicks(),
    goals: emptyGoals(),
    subscriptions: emptySubscriptions(),
    restrictions: emptyRestrictions(),
    following: emptyFollowing(),
    socialSettings: emptySocialSettings(),
  };
}

/**
 * Lee la copia de antes del demo.
 *
 * Los títulos pasan por `parseMedia`, como todo lo que entra a la biblioteca.
 * La copia era un array pelado antes de que existiera el cuestionario, así
 * que se aceptan las dos formas.
 */
export function parsePreDemo(raw: string | null): PreDemoData {
  if (!raw) return emptyData();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyData();
  }

  const toMedia = (list: unknown): SavedMedia[] =>
    Array.isArray(list)
      ? list.map(parseMedia).filter((media): media is SavedMedia => media !== null)
      : [];

  if (Array.isArray(value)) return { ...emptyData(), media: toMedia(value) };
  if (typeof value !== 'object' || value === null) return emptyData();

  const snapshot = value as Record<string, unknown>;
  return {
    media: toMedia(snapshot.media),
    picks: parsePicks(snapshot.picks),
    goals: parseGoals(snapshot.goals),
    subscriptions: parseSubscriptions(snapshot.subscriptions),
    restrictions: parseRestrictions(snapshot.restrictions),
    following: parseFollowing(snapshot.following),
    socialSettings: parseSocialSettings(snapshot.socialSettings),
  };
}

/**
 * Si quedó algo del demo, devuelve lo que había antes y borra las marcas.
 *
 * La biblioteca de ejemplo se reconoce por su dueño ficticio, no solo por la
 * marca: si la marca se perdió, los títulos inventados seguirían ahí.
 */
export function retireDemo(): void {
  let flagged = false;
  let raw: string | null = null;
  try {
    flagged = localStorage.getItem(DEMO_FLAG_KEY) !== null;
    raw = localStorage.getItem(PRE_DEMO_KEY);
  } catch {
    // Sin storage no puede haber quedado nada guardado del demo.
  }

  const store = useMediaStore.getState();
  if (store.ownerUid === DEMO_OWNER_UID) {
    const data = parsePreDemo(raw);
    store.setMediaList(data.media);
    store.setPicks(data.picks);
    store.setGoals(data.goals);
    store.setSubscriptions(data.subscriptions);
    store.setRestrictions(data.restrictions);
    store.setFollowing(data.following);
    store.setSocialSettings(data.socialSettings);
    store.setOwnerUid(null);
  }

  if (flagged || raw !== null) {
    try {
      localStorage.removeItem(DEMO_FLAG_KEY);
      localStorage.removeItem(PRE_DEMO_KEY);
    } catch {
      // Se reintenta en el próximo arranque.
    }
  }
}
