import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/contexts/ToastContext';
import { useSocialStore, patchDemo } from '@/hooks/useSocial';
import { useSocialSettings } from '@/hooks/useSocialSettings';
import { Account, MAX_FOLLOWING, followId, followToDocument, followedUids, newFollow } from '@/lib/social';

/**
 * Seguir, dejar de seguir, aceptar, rechazar, quitar un seguidor y bloquear.
 *
 * Las escrituras van sin `await`: la caché local de Firestore dispara los
 * listeners de `useSocialSync` al toque, así que el botón cambia aunque no
 * haya red, y el cambio sale cuando vuelve. Las reglas son las que deciden
 * de verdad: si la cuenta se volvió privada en el medio, la escritura se
 * rechaza y avisamos.
 */
export function useFollowActions() {
  const { showToast } = useToast();
  const { mute, unmute } = useSocialSettings();

  const fail = (what: string) => (error: unknown) => {
    console.error(`[social] No se pudo ${what}:`, error);
    showToast(`No pudimos ${what}. Intentá de nuevo.`, 'error');
  };

  const context = () => {
    const state = useSocialStore.getState();
    return { state, me: state.uid, isDemo: state.mode === 'demo' };
  };

  const follow = (target: Account): boolean => {
    const { state, me, isDemo } = context();
    if (!me || !state.account || target.uid === me) return false;
    if (followedUids(state.follows).length >= MAX_FOLLOWING) {
      showToast(`Ya seguís ${MAX_FOLLOWING} cuentas, que es el tope. Dejá de seguir alguna para sumar otra.`, 'error');
      return false;
    }
    const relation = newFollow(me, target);
    if (isDemo) {
      patchDemo({
        follows: {
          ...state.follows,
          outgoing: [...state.follows.outgoing.filter((f) => f.followed !== target.uid), relation],
        },
      });
    } else {
      setDoc(doc(db, `follows/${followId(me, target.uid)}`), followToDocument(relation)).catch(fail('seguir esa cuenta'));
    }
    showToast(
      relation.status === 'pending'
        ? `Le mandaste la solicitud a ${target.displayName}.`
        : `Ahora seguís a ${target.displayName}.`,
    );
    return true;
  };

  /** Dejar de seguir, o cancelar una solicitud que no respondió. */
  const unfollow = (targetUid: string) => {
    const { state, me, isDemo } = context();
    if (!me) return;
    if (isDemo) {
      patchDemo({ follows: { ...state.follows, outgoing: state.follows.outgoing.filter((f) => f.followed !== targetUid) } });
      return;
    }
    deleteDoc(doc(db, `follows/${followId(me, targetUid)}`)).catch(fail('dejar de seguir esa cuenta'));
  };

  const accept = (followerUid: string) => {
    const { state, me, isDemo } = context();
    if (!me) return;
    const acceptedAt = new Date().toISOString();
    if (isDemo) {
      patchDemo({
        follows: {
          ...state.follows,
          incoming: state.follows.incoming.map((f) =>
            f.follower === followerUid ? { ...f, status: 'accepted', acceptedAt } : f,
          ),
        },
      });
      return;
    }
    updateDoc(doc(db, `follows/${followId(followerUid, me)}`), { status: 'accepted', acceptedAt }).catch(
      fail('aceptar la solicitud'),
    );
  };

  /** Rechazar una solicitud, o quitar a alguien que ya te seguía. */
  const removeFollower = (followerUid: string) => {
    const { state, me, isDemo } = context();
    if (!me) return;
    if (isDemo) {
      patchDemo({ follows: { ...state.follows, incoming: state.follows.incoming.filter((f) => f.follower !== followerUid) } });
      return;
    }
    deleteDoc(doc(db, `follows/${followId(followerUid, me)}`)).catch(fail('quitar a esa persona'));
  };

  /**
   * Bloquear: deja de seguirte, dejás de seguirla, y las reglas le impiden
   * volver a seguirte, leer tu actividad o mandarte recomendaciones.
   */
  const block = (targetUid: string) => {
    const { state, me, isDemo } = context();
    if (!me || targetUid === me) return;
    if (isDemo) {
      patchDemo({
        blocked: [...state.blocked, targetUid],
        follows: {
          outgoing: state.follows.outgoing.filter((f) => f.followed !== targetUid),
          incoming: state.follows.incoming.filter((f) => f.follower !== targetUid),
        },
      });
    } else {
      setDoc(doc(db, `users/${me}/blocks/${targetUid}`), { at: new Date().toISOString() }).catch(fail('bloquear esa cuenta'));
      deleteDoc(doc(db, `follows/${followId(me, targetUid)}`)).catch(() => {});
      deleteDoc(doc(db, `follows/${followId(targetUid, me)}`)).catch(() => {});
    }
    showToast('Bloqueada. No va a poder seguirte ni ver tu actividad.');
  };

  const unblock = (targetUid: string) => {
    const { state, me, isDemo } = context();
    if (!me) return;
    if (isDemo) {
      patchDemo({ blocked: state.blocked.filter((uid) => uid !== targetUid) });
      return;
    }
    deleteDoc(doc(db, `users/${me}/blocks/${targetUid}`)).catch(fail('desbloquear esa cuenta'));
  };

  return { follow, unfollow, accept, reject: removeFollower, removeFollower, block, unblock, mute, unmute };
}
