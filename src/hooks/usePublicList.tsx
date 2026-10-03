import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useCollectionActions } from '@/hooks/useCollectionActions';
import { AutoPublisher, createAutoPublisher } from '@/lib/autoPublish';
import { MIN_PUBLISH_INTERVAL_MS, PUBLISH_DEBOUNCE_MS } from '@/lib/publicProfile';
import {
  PUBLIC_LIST_ID,
  PublicList,
  buildPublicList,
  newPublicListId,
  parsePublicList,
  publicListPath,
  samePublicListContent,
  uniqueCollectionName,
} from '@/lib/publicList';
import { Collection, SavedMedia } from '@/types';

function ownerName(user: User): string {
  return user.displayName || user.email?.split('@')[0] || 'Alguien';
}

/** Lee una lista publicada. No necesita sesión: para eso es pública. */
export async function fetchPublicList(id: string): Promise<PublicList | null> {
  if (!isFirebaseConfigured || !PUBLIC_LIST_ID.test(id)) return null;
  const snapshot = await getDoc(doc(db, publicListPath(id)));
  return snapshot.exists() ? parsePublicList(snapshot.data()) : null;
}

/** Carga la lista de una ruta pública, con sus estados. */
export function usePublicListById(id: string | undefined) {
  const [list, setList] = useState<PublicList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetchPublicList(id)
      .then((result) => {
        if (!cancelled) setList(result);
      })
      .catch((cause: unknown) => {
        console.error('[lista compartida] No se pudo leer:', cause);
        if (!cancelled) setError('No pudimos cargar esta lista.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { list, isLoading, error };
}

/** Lo publicado de una lista propia, en vivo: `undefined` mientras carga. */
function usePublishedList(publicId: string | undefined): PublicList | null | undefined {
  const [state, setState] = useState<{ id: string; list: PublicList | null } | null>(null);
  useEffect(() => {
    if (!publicId) return;
    return onSnapshot(
      doc(db, publicListPath(publicId)),
      (snapshot) =>
        setState({ id: publicId, list: snapshot.exists() ? parsePublicList(snapshot.data()) : null }),
      (error) => console.warn('[lista compartida] No se pudo leer lo publicado:', error),
    );
  }, [publicId]);
  if (!publicId) return null;
  return state && state.id === publicId ? state.list : undefined;
}

/**
 * Publicar, actualizar y despublicar una lista propia, desde Ajustes.
 *
 * Las escrituras se lanzan sin esperar: sin conexión quedan encoladas, y la
 * colección ya sabe su `publicId` por la caché local, así que el link se
 * muestra al toque.
 */
export function useListSharing(collection: Collection) {
  const { user, authState } = useAuth();
  const { showToast } = useToast();
  const canShare = isFirebaseConfigured && authState === 'authenticated' && Boolean(user);
  const published = usePublishedList(collection.publicId);

  const fireAndForget = (promise: Promise<unknown>) => {
    promise.catch((error: unknown) => {
      console.error('[lista compartida] No se pudo guardar:', error);
      showToast('No pudimos publicar la lista. Intentá de nuevo.', 'error');
    });
  };

  const publish = (description: string) => {
    if (!canShare || !user) return;
    const id = collection.publicId ?? newPublicListId();
    const list = buildPublicList({
      id,
      uid: user.uid,
      ownerName: ownerName(user),
      collection,
      description,
      mediaList: useMediaStore.getState().mediaList,
      autoUpdate: published?.autoUpdate ?? true,
    });
    fireAndForget(setDoc(doc(db, publicListPath(id)), list));
    if (!collection.publicId) {
      fireAndForget(
        // `publishedAt` fecha "publicó una lista" en la actividad social.
        setDoc(
          doc(db, `users/${user.uid}/collections/${collection.id}`),
          { publicId: id, publishedAt: new Date().toISOString() },
          { merge: true },
        ),
      );
    }
  };

  const unpublish = () => {
    if (!canShare || !user || !collection.publicId) return;
    fireAndForget(deleteDoc(doc(db, publicListPath(collection.publicId))));
    fireAndForget(
      setDoc(doc(db, `users/${user.uid}/collections/${collection.id}`), { publicId: null, publishedAt: null }, { merge: true }),
    );
  };

  const setAutoUpdate = (autoUpdate: boolean) => {
    if (!canShare || !collection.publicId) return;
    fireAndForget(setDoc(doc(db, publicListPath(collection.publicId)), { autoUpdate }, { merge: true }));
  };

  const url =
    collection.publicId && typeof window !== 'undefined'
      ? `${window.location.origin}/l/${collection.publicId}`
      : null;

  return { canShare, published, url, publish, unpublish, setAutoUpdate };
}

/** Mantiene al día una lista publicada, como el perfil (ver `lib/autoPublish.ts`). */
function ListAutoPublisher({ collection, user }: { collection: Collection; user: User }) {
  const published = usePublishedList(collection.publicId);
  const mediaList = useMediaStore((state) => state.mediaList);
  const syncedUid = useMediaStore((state) => state.syncedUid);
  const isOnline = useOnlineStatus();

  const latest = useRef<PublicList | null>(null);
  latest.current = published ?? null;
  const publisher = useRef<AutoPublisher<PublicList> | null>(null);

  useEffect(() => {
    const auto = createAutoPublisher<PublicList>({
      debounceMs: PUBLISH_DEBOUNCE_MS,
      minIntervalMs: MIN_PUBLISH_INTERVAL_MS,
      lastPublishedAt: () => {
        const at = latest.current ? Date.parse(latest.current.publishedAt) : NaN;
        return Number.isNaN(at) ? null : at;
      },
      isPublished: (candidate) =>
        latest.current !== null && samePublicListContent(latest.current, candidate),
      publish: (candidate) => {
        setDoc(doc(db, publicListPath(candidate.id)), {
          ...candidate,
          publishedAt: new Date().toISOString(),
        }).catch((error: unknown) => console.warn('[lista compartida] No se pudo republicar:', error));
      },
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    });
    publisher.current = auto;
    return () => auto.cancel();
  }, []);

  useEffect(() => {
    if (isOnline) publisher.current?.online();
  }, [isOnline]);

  const candidate = useMemo(() => {
    if (!published || !published.autoUpdate || published.uid !== user.uid || syncedUid !== user.uid) {
      return null;
    }
    return buildPublicList({
      id: published.id,
      uid: user.uid,
      ownerName: ownerName(user),
      collection,
      description: published.description,
      mediaList,
    });
  }, [published, user, syncedUid, collection, mediaList]);

  useEffect(() => {
    if (!candidate) {
      publisher.current?.cancel();
      return;
    }
    if (latest.current && samePublicListContent(latest.current, candidate)) return;
    publisher.current?.schedule(candidate);
  }, [candidate]);

  return null;
}

/**
 * Las listas publicadas que se mantienen solas: una por colección con
 * `publicId`. Vive en el marco de la app, como la del perfil.
 */
export function ListAutoPublishers() {
  const { user, authState } = useAuth();
  const collections = useMediaStore((state) => state.collections);
  if (!isFirebaseConfigured || authState !== 'authenticated' || !user) return null;
  return (
    <>
      {collections
        .filter((collection) => collection.publicId)
        .map((collection) => (
          <ListAutoPublisher key={collection.id} collection={collection} user={user} />
        ))}
    </>
  );
}

/**
 * Guardar títulos de una lista ajena: uno suelto a *Por Ver*, o la lista
 * entera como una colección propia. Lo que ya estaba en la biblioteca no se
 * toca, solo se suma a la colección.
 */
export function useSaveFromList() {
  const { authState } = useAuth();
  const { addMedia, saveMany } = useMediaActions();
  const { createCollection, addToCollection } = useCollectionActions();
  const { showToast } = useToast();
  // Con una biblioteca donde guardar: cuenta o invitado.
  const canSave = authState === 'authenticated' || authState === 'guest';

  const draftOf = (item: PublicList['items'][number], collections?: string[]): SavedMedia => ({
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    backdropPath: null,
    releaseYear: item.releaseYear,
    genres: [],
    status: 'por_ver',
    updatedAt: new Date().toISOString(),
    ...(collections ? { collections } : {}),
  });

  const saveOne = async (item: PublicList['items'][number]) => {
    const { updatedAt: _updatedAt, ...draft } = draftOf(item);
    // Si quedó esperando al login, lo anuncia el cartel, no esta lista.
    if ((await addMedia(draft)) === 'saved') showToast(`"${item.title}" quedó en Por Ver.`);
  };

  /** Crea la colección con un nombre libre y le suma todo; lo nuevo entra a *Por Ver*. */
  const saveAll = async (list: PublicList): Promise<boolean> => {
    const { collections, mediaList } = useMediaStore.getState();
    const name = uniqueCollectionName(list.name, collections.map((collection) => collection.name));
    const id = await createCollection(name);
    if (!id) return false;

    const known = new Map(mediaList.map((media) => [`${media.mediaType}:${media.tmdbId}`, media]));
    const existing = list.items
      .map((item) => known.get(`${item.mediaType}:${item.tmdbId}`))
      .filter((media): media is SavedMedia => media !== undefined);
    const fresh = list.items.filter((item) => !known.has(`${item.mediaType}:${item.tmdbId}`));

    addToCollection(existing, id);
    // Sin la ficha: la completa sola el refresco en segundo plano, de a poco,
    // en vez de pedirle a TMDB una por título ahora.
    await saveMany(fresh.map((item) => draftOf(item, [id])));
    showToast(`Guardamos "${name}" en tus listas, con ${list.items.length} ${list.items.length === 1 ? 'título' : 'títulos'}.`);
    return true;
  };

  return { canSave, saveOne, saveAll };
}
