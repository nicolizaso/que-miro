import { useState } from 'react';
import { Check, FolderPlus, Loader2, Plus } from 'lucide-react';
import { SavedMedia } from '@/types';
import { useMediaStore } from '@/store';
import {
  MAX_COLLECTION_NAME,
  useCollectionActions,
} from '@/hooks/useCollectionActions';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';

/** Lo que la ficha del título le pasa al selector de listas. */
interface Props {
  /** Nombre del título. Para los avisos, que también valen sin guardarlo. */
  title: string;
  /** El título guardado. Ausente mientras solo exista en TMDB. */
  media?: SavedMedia;
  /**
   * Guarda el título en la biblioteca, ya adentro de esa lista.
   *
   * Es una sola escritura y no "guardar y después sumar a la lista" porque lo
   * segundo, sobre un título que el store todavía no devolvió, se perdía.
   */
  onSaveInto?: (collectionId: string) => Promise<void>;
}

/**
 * Alta y baja de un título en las listas propias.
 *
 * Vive en la ficha del título y no en la tarjeta porque es una acción de baja
 * frecuencia: agregar a una lista se hace una vez, y llenar la tarjeta de
 * controles encarece las que sí se usan todos los días.
 *
 * Funciona también con títulos que todavía no están en la biblioteca —los de
 * Explorar—: ahí no hay dónde anotar la pertenencia, así que sumarlos a una
 * lista los guarda primero, vía {@link Props.onSaveInto}.
 */
export function CollectionPicker({ title, media, onSaveInto }: Props) {
  const collections = useMediaStore((state) => state.collections);
  const { createCollection, toggleMembership } = useCollectionActions();
  const { showToast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  /** Lista con la que se está guardando el título, si todavía no estaba. */
  const [pending, setPending] = useState<string | null>(null);

  const memberOf = media?.collections ?? [];

  /** Suma o saca el título de una lista, guardándolo antes si hacía falta. */
  const toggle = async (collectionId: string) => {
    if (media) {
      await toggleMembership(media, collectionId);
      return;
    }
    await onSaveInto?.(collectionId);
  };

  const handleToggle = async (collectionId: string, collectionName: string) => {
    // Sobre un título ya guardado no se espera nada: sin conexión la escritura
    // queda encolada y su promesa no resuelve hasta que vuelva la red, así que
    // esperarla dejaría los chips trabados.
    if (media) {
      void toggle(collectionId);
      return;
    }
    // Sin guardar todavía, en cambio, dos clics a la vez guardarían el título
    // dos veces y la primera lista se perdería.
    if (pending) return;

    setPending(collectionId);
    try {
      await toggle(collectionId);
      // El chip marcado cuenta la mitad de lo que pasó: el aviso es lo único
      // que dice que el título además entró en la biblioteca.
      showToast(`Agregamos "${title}" a "${collectionName}" y a tu biblioteca.`);
    } finally {
      setPending(null);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const wasSaved = Boolean(media);
      const id = await createCollection(name);
      if (!id) return;
      // Crear una lista desde la ficha de un título implica querer meterlo ahí:
      // pedir un segundo clic para eso sería pedir de más.
      await toggle(id);
      showToast(
        wasSaved
          ? `Creamos "${name.trim()}" y agregamos "${title}".`
          : `Creamos "${name.trim()}" y agregamos "${title}" a tu biblioteca.`,
      );
      setName('');
      setIsCreating(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-section">Mis listas</h3>

      {/* Sin listas todavía, el cartel de abajo ya explica de qué van: repetir
          acá que además se guarda sería un párrafo sobre algo que no se puede
          hacer. */}
      {!media && collections.length > 0 && (
        <p className="text-sm text-text-subtle">
          Sumarla a una lista también la guarda en tu biblioteca, en Por Ver.
        </p>
      )}

      {collections.length === 0 && !isCreating && (
        <p className="text-sm text-text-subtle">
          Todavía no tenés listas propias. Sirven para juntar títulos por fuera
          de los tres estados: "maratón del finde", "pendientes de terror".
        </p>
      )}

      {collections.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {collections.map((item) => {
            const isMember = memberOf.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={isMember}
                  disabled={pending !== null}
                  onClick={() => handleToggle(item.id, item.name)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors',
                    'disabled:opacity-50 disabled:pointer-events-none',
                    isMember
                      ? 'bg-accent text-accent-contrast border-accent'
                      : 'bg-transparent border-border-card text-text-muted hover:text-text-main hover:border-text-subtle',
                  )}
                >
                  {pending === item.id ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : isMember ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Plus size={14} aria-hidden="true" />
                  )}
                  {item.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isCreating ? (
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_COLLECTION_NAME}
            placeholder="Nombre de la lista"
            aria-label="Nombre de la lista nueva"
            className="flex-1 bg-bg-main border border-border-control rounded-control px-3 py-2 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!name.trim() || isSaving}
            className="btn btn-primary px-4 py-2 text-sm"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setName('');
            }}
            className="px-3 py-2 rounded-control border border-border-card text-sm text-text-muted hover:text-text-main transition-colors"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 self-start text-sm text-text-muted hover:text-text-main transition-colors"
        >
          <FolderPlus size={16} aria-hidden="true" />
          Crear una lista nueva
        </button>
      )}
    </div>
  );
}
