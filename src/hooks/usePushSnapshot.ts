import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isPushConfigured } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaStore } from '@/store';
import { usePreferences } from '@/preferences';
import { languageForRegion } from '@/lib/language';
import { PushSnapshot, alertSeries, parsePushSnapshot, pushPath, snapshotIsStale } from '@/lib/push';
import { checkThisDevice } from '@/lib/pushDevice';

/**
 * Mantiene al día `push_subscriptions/{uid}`, la instantánea que lee el cron
 * de avisos.
 *
 * Vive en el marco de la app porque la lista de series cambia desde muchos
 * lados —la ficha, Ajustes, abandonar una serie— y no desde uno solo. Solo
 * escribe si el documento existe, es decir, si algún dispositivo de la cuenta
 * pidió avisos: sin eso no se publica nada.
 */
export function usePushSnapshot() {
  const { user, authState } = useAuth();
  const uid = isPushConfigured && authState === 'authenticated' && user ? user.uid : null;
  const mediaList = useMediaStore((state) => state.mediaList);
  const syncedUid = useMediaStore((state) => state.syncedUid);
  const region = usePreferences((state) => state.region);
  const [snapshot, setSnapshot] = useState<{ uid: string; value: PushSnapshot | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, pushPath(uid)),
      (document) =>
        setSnapshot({ uid, value: document.exists() ? parsePushSnapshot(document.data()) : null }),
      (error) => console.warn('[avisos] No se pudo leer la instantánea:', error),
    );
  }, [uid]);

  const current = snapshot && snapshot.uid === uid ? snapshot : null;

  const wanted = useMemo(
    () => ({ series: alertSeries(mediaList), region, language: languageForRegion(region) }),
    [mediaList, region],
  );

  /**
   * Lo último que este dispositivo escribió. Si el documento dice otra cosa y
   * acá no cambió nada, lo escribió otro dispositivo —en otro país, con otro
   * idioma— y no se le contesta: dos dispositivos que se corrigen entre sí
   * no terminarían nunca.
   */
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    // Sin la biblioteca bajada del servidor, la lista local puede estar a
    // medias: publicarla borraría avisos que la persona sí pidió.
    if (!uid || !current?.value || syncedUid !== uid) return;
    const key = JSON.stringify(wanted);
    if (!snapshotIsStale(current.value, wanted)) {
      lastWritten.current = key;
      return;
    }
    if (lastWritten.current === key) return;
    lastWritten.current = key;

    // Sin `await`: sin conexión queda encolada, como el resto de las escrituras.
    setDoc(
      doc(db, pushPath(uid)),
      { ...wanted, updatedAt: new Date().toISOString() },
      { mergeFields: ['series', 'region', 'language', 'updatedAt'] },
    ).catch((error: unknown) => console.warn('[avisos] No se pudo actualizar la instantánea:', error));
  }, [uid, current, wanted, syncedUid]);

  /** Una vez por sesión, y recién con el documento leído: ver `checkThisDevice`. */
  const checkedUid = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      checkedUid.current = null;
      return;
    }
    if (!current || checkedUid.current === uid) return;
    checkedUid.current = uid;
    checkThisDevice(uid, current.value).catch((error: unknown) =>
      console.warn('[avisos] No se pudo revisar el token de este dispositivo:', error),
    );
  }, [uid, current]);
}
