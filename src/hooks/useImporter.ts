import { useRef, useState } from 'react';
import { useMediaStore } from '@/store';
import { usePreferences } from '@/preferences';
import { useToast } from '@/contexts/ToastContext';
import { useMediaActions } from '@/hooks/useMediaActions';
import { SavedMedia } from '@/types';
import { findTitles, getMediaDetail } from '@/lib/tmdb';
import { mergeLibraries } from '@/lib/backup';
import { ParsedImport, parseImportFiles, unzipTextFiles } from '@/lib/importers/detect';
import { Resolution, resolveAll } from '@/lib/importers/resolve';
import { Resolved, mergeImported, mergeIntoLibrary, recordToMedia } from '@/lib/importers/toMedia';
import { ImportFile } from '@/lib/importers/types';

/**
 * Leer un archivo elegido. `File.text()` y `arrayBuffer()` no están en todos
 * lados —Safari viejo, jsdom—; `FileReader` sí.
 */
function readFile(file: File, as: 'text'): Promise<string>;
function readFile(file: File, as: 'bytes'): Promise<Uint8Array>;
function readFile(file: File, as: 'text' | 'bytes'): Promise<string | Uint8Array> {
  if (as === 'text' && typeof file.text === 'function') return file.text();
  if (as === 'bytes' && typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(as === 'text' ? String(reader.result ?? '') : new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    if (as === 'text') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export type ImportStep =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'parsed'; parsed: ParsedImport }
  | { kind: 'matching'; parsed: ParsedImport; done: number; total: number }
  | { kind: 'review'; parsed: ParsedImport; resolutions: Resolution[] }
  | { kind: 'saving' };

/**
 * Importar la historia de otra app: leer los archivos, buscar cada título en
 * TMDB y, después de la revisión, sumarlo a la biblioteca.
 *
 * Lo que se guarda pasa por `parseMedia` (en `recordToMedia`) y por
 * `mergeLibraries`. Antes de eso, cada título se suma a lo que ya había con
 * `mergeIntoLibrary`: un export ajeno no pisa las reseñas de acá, y lo que no
 * cambia nada no se escribe.
 */
export function useImporter() {
  const [step, setStep] = useState<ImportStep>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const { saveMany } = useMediaActions();
  const { showToast } = useToast();

  const readFiles = async (files: File[]) => {
    setStep({ kind: 'reading' });
    try {
      const contents: ImportFile[] = [];
      for (const file of files) {
        if (/\.zip$/i.test(file.name)) {
          contents.push(...unzipTextFiles(await readFile(file, 'bytes')));
        } else {
          contents.push({ name: file.name, text: await readFile(file, 'text') });
        }
      }
      const parsed = parseImportFiles(contents);
      if (parsed.records.length === 0) {
        showToast(
          'No encontramos títulos en esos archivos. Tienen que ser los exports de Letterboxd, IMDb o Trakt.',
          'error',
        );
        setStep({ kind: 'idle' });
        return;
      }
      setStep({ kind: 'parsed', parsed });
    } catch (error) {
      console.error('[importar] No se pudieron leer los archivos:', error);
      showToast('No pudimos leer esos archivos.', 'error');
      setStep({ kind: 'idle' });
    }
  };

  const match = async (parsed: ParsedImport) => {
    const abort = new AbortController();
    controller.current = abort;
    const total = parsed.records.length;
    setStep({ kind: 'matching', parsed, done: 0, total });

    const resolutions = await resolveAll(
      parsed.records,
      { find: findTitles, detail: (id, mediaType) => getMediaDetail(id, mediaType) },
      {
        signal: abort.signal,
        onProgress: (done) => {
          if (!abort.signal.aborted) setStep({ kind: 'matching', parsed, done, total });
        },
      },
    );
    controller.current = null;
    // Cortado: se vuelve al resumen, sin lo que alcanzó a buscar.
    setStep(abort.signal.aborted ? { kind: 'parsed', parsed } : { kind: 'review', parsed, resolutions });
  };

  const cancel = () => controller.current?.abort();

  const reset = () => {
    controller.current?.abort();
    setStep({ kind: 'idle' });
  };

  /** Guarda lo elegido en la revisión. Devuelve cuántos títulos cambió. */
  const save = async (chosen: Resolved[]): Promise<number> => {
    setStep({ kind: 'saving' });
    const now = new Date();
    const region = usePreferences.getState().region;

    // El mismo título que llegó de dos exports es uno solo.
    const unique = new Map<string, SavedMedia>();
    for (const resolved of chosen) {
      const media = recordToMedia(resolved, { now, region });
      if (!media) continue;
      const key = `${media.mediaType}:${media.tmdbId}`;
      const known = unique.get(key);
      unique.set(key, known ? mergeImported(known, media) : media);
    }

    const { mediaList } = useMediaStore.getState();
    const byId = new Map(mediaList.map((media) => [media.tmdbId, media]));
    const changed = Array.from(unique.values())
      // La biblioteca se indexa por id: una serie con el mismo número que una
      // película que ya está no puede entrar sin pisarla.
      .filter((media) => !byId.has(media.tmdbId) || byId.get(media.tmdbId)!.mediaType === media.mediaType)
      .map((media) => mergeIntoLibrary(byId.get(media.tmdbId), media, now))
      .filter((media): media is SavedMedia => media !== null);

    const { added, updated } = mergeLibraries(mediaList, changed);
    await saveMany(changed);

    showToast(
      changed.length === 0
        ? 'Tu biblioteca ya tenía todo eso: no hubo cambios.'
        : `Importamos ${added} título${added === 1 ? '' : 's'} nuevo${added === 1 ? '' : 's'}${
            updated ? ` y sumamos lo visto a ${updated} que ya tenías` : ''
          }.`,
    );
    setStep({ kind: 'idle' });
    return changed.length;
  };

  return { step, readFiles, match, cancel, reset, save };
}
