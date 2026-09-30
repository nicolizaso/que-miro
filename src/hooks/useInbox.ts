import { useMemo } from 'react';
import { useMediaStore } from '@/store';
import { useSocial } from '@/hooks/useSocial';
import { buildInbox, unreadCount } from '@/lib/inbox';

/**
 * Las notificaciones y cuántas hay sin ver (ver `lib/inbox.ts`). Salen de lo
 * que `useSocialSync` ya escucha: abrir la bandeja no cuesta lecturas.
 */
export function useInbox() {
  const { uid, follows, reactions, recommendations, blocked } = useSocial();
  const settings = useMediaStore((state) => state.socialSettings);

  const items = useMemo(() => {
    if (!uid) return [];
    const hidden = new Set(blocked);
    return buildInbox({
      myUid: uid,
      follows: {
        outgoing: follows.outgoing.filter((follow) => !hidden.has(follow.followed)),
        incoming: follows.incoming.filter((follow) => !hidden.has(follow.follower)),
      },
      reactions: reactions.filter((reaction) => !hidden.has(reaction.reactor)),
      recommendations: recommendations.filter((rec) => !hidden.has(rec.from)),
      muted: settings.muted,
    });
  }, [uid, follows, reactions, recommendations, blocked, settings.muted]);

  return { items, unread: unreadCount(items, settings.inboxSeenAt) };
}
