import { useSearchParams } from 'react-router-dom';
import { useMediaStore } from '@/store';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import { FICHA_PARAM, parseFicha } from '@/lib/deepLink';

/**
 * La ficha que pide la URL (ver `lib/deepLink.ts`). Vive en el marco para
 * abrirse encima de cualquier página, y al cerrarse saca el parámetro: así
 * "atrás" y "recargar" no la vuelven a abrir.
 */
export function DeepLinkedTitle() {
  const [params, setParams] = useSearchParams();
  const mediaList = useMediaStore((state) => state.mediaList);
  const target = parseFicha(params.get(FICHA_PARAM));
  if (!target) return null;

  const media = mediaList.find(
    (item) => item.tmdbId === target.tmdbId && item.mediaType === target.mediaType,
  );

  const close = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(FICHA_PARAM);
        return next;
      },
      { replace: true },
    );

  return (
    <TitleDetailModal
      id={target.tmdbId}
      mediaType={target.mediaType}
      media={media}
      isOpen
      onClose={close}
    />
  );
}
