import { Follow, MyFollows, Reaction, Recommendation, relationship } from '@/lib/social';

/**
 * Las notificaciones, armadas con lo que ya existe.
 *
 * No hay una colección de avisos donde otros escriban: cada notificación sale
 * de algo que ya está guardado por su propia razón —una relación en
 * `follows`, una reacción, una recomendación—. Así nadie puede dejarte
 * cualquier cosa en la cuenta, y lo que se borra (alguien deja de seguirte,
 * saca su reacción) desaparece solo de la lista.
 */

export const MAX_INBOX = 100;

export type InboxItem =
  | { kind: 'request'; key: string; at: string; uid: string }
  | { kind: 'follow'; key: string; at: string; uid: string }
  | { kind: 'accepted'; key: string; at: string; uid: string }
  | { kind: 'reaction'; key: string; at: string; uid: string; reaction: Reaction }
  | { kind: 'recommendation'; key: string; at: string; uid: string; recommendation: Recommendation };

export function buildInbox({
  myUid,
  follows,
  reactions = [],
  recommendations = [],
  muted = [],
}: {
  myUid: string;
  follows: MyFollows;
  /** Las reacciones a tu actividad. */
  reactions?: Reaction[];
  recommendations?: Recommendation[];
  muted?: string[];
}): InboxItem[] {
  const silenced = new Set(muted);
  const items: InboxItem[] = [];

  for (const follow of follows.incoming) {
    items.push({
      kind: follow.status === 'pending' ? 'request' : 'follow',
      key: `f:${follow.follower}`,
      // Una solicitud aceptada cuenta desde que se aceptó: es cuando empezó a seguirte.
      at: follow.acceptedAt ?? follow.createdAt,
      uid: follow.follower,
    });
  }
  for (const follow of follows.outgoing) {
    if (follow.status === 'accepted' && follow.acceptedAt) {
      items.push({ kind: 'accepted', key: `a:${follow.followed}`, at: follow.acceptedAt, uid: follow.followed });
    }
  }
  for (const reaction of reactions) {
    // Reaccionar a lo propio no es una novedad para nadie.
    if (reaction.reactor === myUid || silenced.has(reaction.reactor)) continue;
    items.push({
      kind: 'reaction',
      key: `r:${reaction.reactor}:${reaction.eventId}`,
      at: reaction.at,
      uid: reaction.reactor,
      reaction,
    });
  }
  for (const recommendation of recommendations) {
    items.push({
      kind: 'recommendation',
      key: `c:${recommendation.id}`,
      at: recommendation.at,
      uid: recommendation.from,
      recommendation,
    });
  }

  return items
    .filter((item) => !Number.isNaN(Date.parse(item.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_INBOX);
}

/**
 * Cuántas hay sin ver: lo posterior a la última vez que abriste la bandeja,
 * más las solicitudes, que esperan respuesta aunque ya las hayas visto.
 */
export function unreadCount(items: InboxItem[], seenAt: string): number {
  const seen = Date.parse(seenAt);
  return items.filter(
    (item) => item.kind === 'request' || Number.isNaN(seen) || Date.parse(item.at) > seen,
  ).length;
}

// --- Sugerencias ---------------------------------------------------------------

export type SuggestionReason = 'te-sigue' | 'reacciono' | 'recomendo';

export interface Suggestion {
  uid: string;
  reason: SuggestionReason;
}

export const SUGGESTION_TEXT: Record<SuggestionReason, string> = {
  'te-sigue': 'Te sigue',
  reacciono: 'Reaccionó a lo tuyo',
  recomendo: 'Te recomendó algo',
};

/**
 * A quién seguir: gente que ya tiene algo que ver con vos y que todavía no
 * seguís. Las listas de seguidores de los demás no se ven, así que no hay
 * "lo siguen tus amigos": se sugiere solo con lo que es tuyo.
 */
export function suggestions({
  myUid,
  follows,
  reactions = [],
  recommendations = [],
  dismissed = [],
  limit = 10,
}: {
  myUid: string;
  follows: MyFollows;
  reactions?: Reaction[];
  recommendations?: Recommendation[];
  /** Los que se descartaron o están bloqueados. */
  dismissed?: string[];
  limit?: number;
}): Suggestion[] {
  const skip = new Set([myUid, ...dismissed]);
  const result: Suggestion[] = [];
  const add = (uid: string, reason: SuggestionReason) => {
    if (skip.has(uid)) return;
    const rel = relationship(follows, uid);
    if (rel.following || rel.requested) return;
    skip.add(uid);
    result.push({ uid, reason });
  };

  const byRecent = (a: { at: string }, b: { at: string }) => Date.parse(b.at) - Date.parse(a.at);
  follows.incoming
    .filter((follow: Follow) => follow.status === 'accepted')
    .map((follow) => ({ uid: follow.follower, at: follow.acceptedAt ?? follow.createdAt }))
    .sort(byRecent)
    .forEach(({ uid }) => add(uid, 'te-sigue'));
  recommendations.slice().sort(byRecent).forEach((rec) => add(rec.from, 'recomendo'));
  reactions.slice().sort(byRecent).forEach((reaction) => add(reaction.reactor, 'reacciono'));

  return result.slice(0, limit);
}
