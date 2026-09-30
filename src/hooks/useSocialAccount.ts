import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useSocialStore, patchDemo } from '@/hooks/useSocial';
import { usePublishProfile } from '@/hooks/usePublicProfile';
import { Account, accountToDocument, handleProblem } from '@/lib/social';
import { PickedTitle } from '@/types';

/** Error con un mensaje ya listo para mostrar. */
export class SocialAccountError extends Error {}

export interface ProfileDraft {
  handle: string;
  displayName: string;
  bio: string;
  avatarPath: string | null;
  top4: PickedTitle[];
  private: boolean;
}

/**
 * Crear y editar la cuenta social: usuario, nombre, bio, avatar, top 4 y si
 * es privada.
 *
 * El usuario es también la dirección del perfil público, así que las dos
 * cosas se mueven juntas: una cuenta pública publica su perfil en
 * `/u/{usuario}`, y una privada lo despublica (las reglas tampoco la dejan
 * publicarlo). Crear la cuenta y cambiar el usuario sí esperan al servidor:
 * que el usuario esté libre lo decide Firestore, no este dispositivo.
 */
export function useSocialAccount() {
  const { user } = useAuth();
  const { publish, unpublish, slug: publishedSlug } = usePublishProfile();

  /** Si un usuario está libre. Solo orienta: el que decide es el lote de `create`. */
  const isAvailable = async (handle: string): Promise<boolean> => {
    const { mode, uid, demo } = useSocialStore.getState();
    if (mode === 'demo') return !demo?.people.some((person) => person.account.handle === handle);
    const [taken, profile] = await Promise.all([
      getDoc(doc(db, `handles/${handle}`)),
      getDoc(doc(db, `public_profiles/${handle}`)),
    ]);
    if (taken.exists() && taken.data()?.uid !== uid) return false;
    if (profile.exists() && profile.data()?.uid !== uid) return false;
    return true;
  };

  /** Publica o despublica el perfil según la privacidad. Sin tirar: es secundario. */
  const syncPublicProfile = async (account: Pick<Account, 'handle' | 'private'>) => {
    try {
      if (account.private) {
        await unpublish();
      } else if (publishedSlug !== account.handle) {
        await publish(account.handle);
      }
    } catch (error) {
      console.warn('[social] No se pudo acomodar el perfil público:', error);
    }
  };

  /**
   * Crea el usuario y la cuenta en un lote: o salen los dos, o ninguno.
   *
   * @throws {SocialAccountError} si el usuario no sirve o ya es de otra persona.
   */
  const create = async (draft: ProfileDraft): Promise<Account> => {
    const { mode, uid } = useSocialStore.getState();
    const problem = handleProblem(draft.handle);
    if (problem) throw new SocialAccountError(problem);
    if (!uid) throw new SocialAccountError('Necesitás iniciar sesión.');

    const now = new Date().toISOString();
    const account: Account = { uid, ...draft, followers: 0, following: 0, createdAt: now, updatedAt: now };

    if (mode === 'demo') {
      patchDemo({ account });
      return account;
    }

    if (!(await isAvailable(draft.handle))) {
      throw new SocialAccountError('Ese usuario ya está tomado. Probá con otro.');
    }
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `handles/${draft.handle}`), { uid, createdAt: now });
      batch.set(doc(db, `accounts/${uid}`), accountToDocument(account));
      await batch.commit();
    } catch (error) {
      console.error('[social] No se pudo crear la cuenta:', error);
      throw new SocialAccountError('No pudimos crear tu usuario. Puede que ya esté tomado, o que no haya conexión.');
    }
    await syncPublicProfile(account);
    return account;
  };

  /** Cambia nombre, bio, avatar, top 4 o privacidad. El usuario, con `changeHandle`. */
  const update = async (patch: Partial<Omit<ProfileDraft, 'handle'>>) => {
    const { mode, uid, account } = useSocialStore.getState();
    if (!uid || !account) return;
    const next: Account = { ...account, ...patch, updatedAt: new Date().toISOString() };
    if (mode === 'demo') {
      patchDemo({ account: next });
      return;
    }
    // Pasar a privada: primero se despublica, así el perfil no queda un
    // segundo a la vista con la cuenta ya cerrada. Pasar a pública, al revés:
    // las reglas no dejan publicar mientras la cuenta diga privada.
    if (patch.private === true && !account.private) await syncPublicProfile(next);
    try {
      await setDoc(doc(db, `accounts/${uid}`), accountToDocument(next));
    } catch (error) {
      console.error('[social] No se pudo guardar el perfil:', error);
      throw new SocialAccountError('No pudimos guardar tu perfil. Intentá de nuevo.');
    }
    if (patch.private === false && account.private) await syncPublicProfile(next);
  };

  /**
   * Cambia el usuario: se crea el nuevo, se actualiza la cuenta y se libera
   * el viejo, todo en un lote. El perfil público se muda a la dirección
   * nueva; los links viejos dejan de andar, como en cualquier red.
   */
  const changeHandle = async (handle: string, patch: Partial<Omit<ProfileDraft, 'handle'>> = {}) => {
    const { mode, uid, account } = useSocialStore.getState();
    if (!uid || !account || handle === account.handle) return;
    const problem = handleProblem(handle);
    if (problem) throw new SocialAccountError(problem);
    // El resto de los cambios viaja en el mismo lote: escribirlos después
    // podría salir con el usuario viejo, que para entonces ya no es suyo.
    const next: Account = { ...account, ...patch, handle, updatedAt: new Date().toISOString() };
    if (mode === 'demo') {
      patchDemo({ account: next });
      return;
    }
    if (!(await isAvailable(handle))) throw new SocialAccountError('Ese usuario ya está tomado. Probá con otro.');
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, `handles/${handle}`), { uid, createdAt: next.updatedAt });
      batch.set(doc(db, `accounts/${uid}`), accountToDocument(next));
      batch.delete(doc(db, `handles/${account.handle}`));
      await batch.commit();
    } catch (error) {
      console.error('[social] No se pudo cambiar el usuario:', error);
      throw new SocialAccountError('No pudimos cambiar tu usuario. Intentá de nuevo.');
    }
    await syncPublicProfile(next);
  };

  return {
    user,
    isAvailable,
    create,
    update,
    changeHandle,
    /** Vuelve a acomodar el perfil público: lo usa Ajustes si quedó a medias. */
    syncPublicProfile,
  };
}
