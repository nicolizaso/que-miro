import { useEffect, useState } from 'react';
import { useSocial, useSocialStore, findByHandle } from '@/hooks/useSocial';
import { ActivityRead, fetchActivity, useSocialCache } from '@/hooks/useSocialFeed';
import { useOwnActivity } from '@/hooks/useActivityPublisher';
import { fetchPublicProfile } from '@/hooks/usePublicProfile';
import { Account } from '@/lib/social';
import { PublicProfile } from '@/lib/publicProfile';

export interface PersonPage {
  /** `undefined` mientras carga; `null` si no hay cuenta con ese usuario. */
  account: Account | null | undefined;
  /** Su actividad; `'locked'` si es privada y no te aceptó. */
  activity: ActivityRead | undefined;
  /** El perfil público de antes, si no tiene cuenta pero sí vidriera. */
  legacy: PublicProfile | null | undefined;
  isMe: boolean;
  error: string;
  reload: () => void;
}

/**
 * Todo lo de una persona para su perfil dentro de la app: su tarjeta, su
 * actividad (si la podés leer) y, si todavía no creó su cuenta, el perfil
 * público de antes. La actividad sale de la caché del feed si está fresca.
 */
export function usePerson(handle: string | undefined): PersonPage {
  const { mode, uid, account: me } = useSocial();
  const demo = useSocialStore((state) => state.demo);
  const own = useOwnActivity();
  const [state, setState] = useState<Omit<PersonPage, 'isMe' | 'reload'>>({
    account: undefined,
    activity: undefined,
    legacy: undefined,
    error: '',
  });
  const [reloadKey, setReloadKey] = useState(0);
  const isMe = Boolean(me && handle === me.handle);

  useEffect(() => {
    if (!handle || mode === 'off' || isMe) return;
    let cancelled = false;
    setState({ account: undefined, activity: undefined, legacy: undefined, error: '' });

    if (mode === 'demo') {
      const person = demo?.people.find((p) => p.account.handle === handle);
      const followed = useSocialStore
        .getState()
        .follows.outgoing.some((f) => f.followed === person?.account.uid && f.status === 'accepted');
      setState({
        account: person?.account ?? null,
        activity: person ? (person.account.private && !followed ? 'locked' : person.activity) : undefined,
        legacy: null,
        error: '',
      });
      return;
    }

    (async () => {
      try {
        const account = await findByHandle(handle);
        if (cancelled) return;
        if (!account) {
          const legacy = await fetchPublicProfile(handle);
          if (!cancelled) setState({ account: null, activity: undefined, legacy, error: '' });
          return;
        }
        setState((current) => ({ ...current, account }));
        const cache = useSocialCache.getState();
        const cached = uid && cache.owner === uid ? cache.activities[account.uid] : undefined;
        const activity = cached && cached !== 'locked' && reloadKey === 0 ? cached : await fetchActivity(account.uid);
        if (uid) useSocialCache.getState().saveActivity(uid, account.uid, activity);
        if (!cancelled) setState({ account, activity, legacy: null, error: '' });
      } catch (error) {
        console.error('[perfil] No se pudo cargar:', error);
        if (!cancelled) setState((current) => ({ ...current, error: 'No pudimos cargar este perfil.' }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle, mode, uid, isMe, demo, reloadKey]);

  if (isMe && me) {
    return { account: me, activity: own, legacy: null, isMe: true, error: '', reload: () => {} };
  }
  return { ...state, isMe: false, reload: () => setReloadKey((key) => key + 1) };
}
