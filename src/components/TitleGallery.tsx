import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Dialog } from '@/components/ui/Dialog';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { pickGalleryImages, stepIndex } from '@/lib/gallery';
import {
  TMDB_BACKDROP_LARGE_URL,
  TMDB_STILL_URL,
  TMDbImage,
  getImages,
} from '@/lib/tmdb';
import type { MediaType } from '@/types';

/** Cuánto hay que deslizar el dedo para pasar de foto, en píxeles. */
const SWIPE_THRESHOLD = 40;

/**
 * Las fotos de un título, en la ficha: una fila de miniaturas y un visor a
 * pantalla completa.
 *
 * Pide las imágenes recién cuando se monta, aparte de la ficha: si fallan, la
 * ficha sigue igual y la sección simplemente no aparece. Tampoco aparece si el
 * título no tiene fotos, en vez de mostrar una fila vacía.
 */
export function TitleGallery({
  id,
  mediaType,
  title,
  heroPath,
}: {
  id: number;
  mediaType: MediaType;
  title: string;
  /** El fondo que ya muestra la ficha arriba, para no repetirlo. */
  heroPath?: string | null;
}) {
  const [images, setImages] = useState<TMDbImage[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImages([]);
    setOpenIndex(null);

    getImages(id, mediaType)
      .then((all) => {
        if (!cancelled) setImages(pickGalleryImages(all, heroPath));
      })
      .catch(() => {
        // Sin fotos no hay sección: no vale la pena un aviso por algo que es
        // un extra de la ficha.
      });

    return () => {
      cancelled = true;
    };
  }, [id, mediaType, heroPath]);

  if (images.length === 0) return null;

  return (
    <>
      <ScrollRail
        label="Imágenes"
        fadeFrom="card"
        header={<h3 className="text-section">Imágenes</h3>}
      >
        {images.map((image, index) => (
          <li key={image.file_path} className="rail-item w-48 shrink-0">
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`Ver imagen ${index + 1} de ${images.length}`}
              className="group block w-full aspect-video rounded-control overflow-hidden bg-border-card shadow-card ring-2 ring-transparent hover:ring-accent focus-visible:ring-accent transition-[box-shadow]"
            >
              <img
                src={`${TMDB_STILL_URL}${image.file_path}`}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          </li>
        ))}
      </ScrollRail>

      {openIndex !== null && (
        <GalleryViewer
          images={images}
          index={openIndex}
          title={title}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}

function GalleryViewer({
  images,
  index,
  title,
  onIndexChange,
  onClose,
}: {
  images: TMDbImage[];
  index: number;
  title: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const touchStartX = useRef<number | null>(null);
  const total = images.length;
  const image = images[index];
  const hasMany = total > 1;

  // En un ref para que el listener de teclado no se re-registre en cada foto.
  const stepRef = useRef((delta: number) => onIndexChange(stepIndex(index, delta, total)));
  stepRef.current = (delta: number) => onIndexChange(stepIndex(index, delta, total));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') stepRef.current(1);
      else if (event.key === 'ArrowLeft') stepRef.current(-1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const arrowClass =
    'absolute top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors';

  return (
    <Dialog
      isOpen
      onClose={onClose}
      label={`Imágenes de ${title}`}
      // Una foto se mira sobre negro en los dos temas: con el fondo claro, las
      // escenas oscuras se pierden.
      className="z-[70] flex flex-col bg-black/95"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 text-white">
        <p className="text-sm font-medium" aria-live="polite">
          {index + 1} de {total}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar imágenes"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-16 pb-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (start === null || end === undefined || !hasMany) return;
          const delta = end - start;
          if (Math.abs(delta) >= SWIPE_THRESHOLD) stepRef.current(delta < 0 ? 1 : -1);
        }}
      >
        <motion.img
          key={image.file_path}
          src={`${TMDB_BACKDROP_LARGE_URL}${image.file_path}`}
          alt={`Imagen ${index + 1} de ${total} de ${title}`}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="max-w-full max-h-full object-contain rounded-control select-none"
          draggable={false}
        />

        {hasMany && (
          <>
            <button
              type="button"
              onClick={() => stepRef.current(-1)}
              aria-label="Imagen anterior"
              className={`${arrowClass} left-2 sm:left-4`}
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => stepRef.current(1)}
              aria-label="Imagen siguiente"
              className={`${arrowClass} right-2 sm:right-4`}
            >
              <ChevronRight size={24} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
