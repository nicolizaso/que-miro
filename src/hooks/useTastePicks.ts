import { doc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { TastePicks } from '@/types';

/** Dónde vive el cuestionario de una cuenta. Un documento, no una colección. */
export function picksPath(uid: string): string {
  return `users/${uid}/profile/taste`;
}

/**
 * Firestore rechaza `undefined`, y tres de las siete respuestas pueden estarlo.
 * Se escriben como `null`, que es como Firestore representa la ausencia.
 */
export function picksToDocument(picks: TastePicks): Record<string, unknown> {
  return {
    movie: picks.movie ?? null,
    series: picks.series ?? null,
    moreMovies: picks.moreMovies ?? [],
    moreSeries: picks.moreSeries ?? [],
    genres: picks.genres,
    actors: picks.actors,
    directors: picks.directors,
    studios: picks.studios,
    decade: picks.decade ?? null,
    updatedAt: picks.updatedAt,
  };
}

/**
 * Leer y escribir "Contanos de vos".
 *
 * Se guarda respuesta por respuesta, sin botón de guardar: cada pregunta es
 * independiente de las otras y un formulario de siete campos con un botón al
 * final invita a contestarlas todas o ninguna, que es justo lo que no
 * queremos — con una sola respuesta Explorar ya cambia.
 *
 * Con sesión iniciada escribe el documento entero y deja que `SyncManager`
 * refresque el estado local, igual que la biblioteca. Sin sesión escribe
 * derecho en el store.
 */
export function useTastePicks() {
  const picks = useMediaStore((state) => state.picks);
  const { user, authState } = useAuth();
  const { showToast } = useToast();

  const isAuth = isFirebaseConfigured && authState === 'authenticated' && user;

  /**
   * Guarda una respuesta.
   *
   * El documento se escribe entero y no con `merge`: esta pantalla es su única
   * dueña, y una respuesta que se borra —sacar el último director elegido— es
   * un array vacío que tiene que llegar como tal.
   */
  const savePicks = (patch: Partial<TastePicks>) => {
    const next: TastePicks = {
      ...useMediaStore.getState().picks,
      ...patch,
      // La fecha la pone siempre el reloj de acá, aunque el `patch` traiga una:
      // es la que decide quién gana si el mismo cuestionario se contestó en dos
      // dispositivos, y tiene que marcar cuándo se guardó, no cuándo se escribió
      // el archivo del que salió.
      updatedAt: new Date().toISOString(),
    };

    if (!isAuth) {
      useMediaStore.getState().setPicks(next);
      return;
    }

    // Sin esperar al servidor, como el resto de las escrituras sueltas: la
    // caché de Firestore ya disparó el `onSnapshot` que actualiza la pantalla,
    // y el cambio queda encolado hasta que vuelva la red.
    setDoc(doc(db, picksPath(user.uid)), picksToDocument(next)).catch(
      (error: unknown) => {
        console.error('[gustos] No se pudo guardar la respuesta:', error);
        showToast('No pudimos guardar la respuesta. Intentá de nuevo.', 'error');
      },
    );
  };

  return { picks, savePicks };
}
