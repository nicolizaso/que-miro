import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/contexts/ToastContext';
import { useSocialStore, patchDemo } from '@/hooks/useSocial';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useMediaStore } from '@/store';
import { ActivityTitle } from '@/lib/activity';
import {
  ReactionId,
  Recommendation,
  reactionId,
  recommendationId,
  recommendationToDocument,
} from '@/lib/social';
import { AddedFrom } from '@/types';

/**
 * Reaccionar, recomendar y guardar lo que viene de otros.
 *
 * Las reacciones se ven al toque aunque la instantánea de la otra persona
 * las cuente recién cuando su app republica (ver `myReactions` en el store).
 */
export function useSocialInteractions() {
  const { showToast } = useToast();
  const { addMedia } = useMediaActions();

  /** Pone, cambia o saca (`null`) tu reacción a un evento de otra persona. */
  const react = (ownerUid: string, eventId: string, emoji: ReactionId | null) => {
    const state = useSocialStore.getState();
    const me = state.uid;
    const account = state.account;
    if (!me || !account) return;
    useSocialStore.setState({ myReactions: { ...state.myReactions, [`${ownerUid}:${eventId}`]: emoji } });
    if (state.mode === 'demo') return;

    const ref = doc(db, `activity/${ownerUid}/reactions/${reactionId(me, eventId)}`);
    const write = emoji
      ? setDoc(ref, {
          reactor: me,
          reactorName: account.displayName,
          reactorHandle: account.handle,
          eventId,
          emoji,
          at: new Date().toISOString(),
        })
      : deleteDoc(ref);
    write.catch((error: unknown) => {
      console.error('[social] No se pudo reaccionar:', error);
      showToast('No pudimos guardar tu reacción.', 'error');
    });
  };

  /**
   * Le recomienda un título a alguien con quien se siguen mutuamente. Las
   * reglas lo rechazan si dejaron de ser mutuos en el medio.
   */
  const recommend = (toUid: string, toName: string, title: ActivityTitle, note: string) => {
    const state = useSocialStore.getState();
    const me = state.uid;
    const account = state.account;
    if (!me || !account) return;
    const at = new Date().toISOString();
    const rec = {
      from: me,
      fromName: account.displayName,
      fromHandle: account.handle,
      ...title,
      note,
      at,
    };
    if (state.mode !== 'demo') {
      setDoc(
        doc(db, `users/${toUid}/recommendations/${recommendationId(me, title.mediaType, title.tmdbId)}`),
        recommendationToDocument(rec),
      ).catch((error: unknown) => {
        console.error('[social] No se pudo recomendar:', error);
        showToast('No pudimos mandar la recomendación. Tienen que seguirse los dos.', 'error');
      });
    }
    showToast(`Le recomendaste "${title.title}" a ${toName}.`);
  };

  /** Saca una recomendación de tu bandeja. */
  const dismissRecommendation = (rec: Recommendation) => {
    const state = useSocialStore.getState();
    if (!state.uid) return;
    if (state.mode === 'demo') {
      patchDemo({ recommendations: state.recommendations.filter((item) => item.id !== rec.id) });
      return;
    }
    deleteDoc(doc(db, `users/${state.uid}/recommendations/${rec.id}`)).catch((error: unknown) =>
      console.warn('[social] No se pudo descartar la recomendación:', error),
    );
  };

  /**
   * Guarda en *Por Ver* un título que viene de alguien, con de quién vino:
   * "Te lo recomendó Ana". Si ya lo tenías, no lo toca.
   */
  const saveFromSocial = async (title: ActivityTitle, from: AddedFrom): Promise<boolean> => {
    const exists = useMediaStore
      .getState()
      .mediaList.some((media) => media.tmdbId === title.tmdbId && media.mediaType === title.mediaType);
    if (exists) return false;
    await addMedia({
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
      title: title.title,
      posterPath: title.posterPath,
      backdropPath: null,
      releaseYear: title.releaseYear,
      genres: [],
      status: 'por_ver',
      addedFrom: from,
    });
    showToast(`"${title.title}" quedó en Por Ver.`);
    return true;
  };

  /** Acepta una recomendación: la guarda y la saca de la bandeja. */
  const acceptRecommendation = async (rec: Recommendation) => {
    await saveFromSocial(rec, { uid: rec.from, name: rec.fromName, via: 'recommendation' });
    dismissRecommendation(rec);
  };

  return { react, recommend, dismissRecommendation, saveFromSocial, acceptRecommendation };
}
