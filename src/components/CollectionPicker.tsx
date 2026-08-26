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

/**
 * Alta y baja de un título en las listas propias.
 *
 * Vive en la ficha del título y no en la tarjeta porque es una acción de baja
 * frecuencia: agregar a una lista se hace una vez, y llenar la tarjeta de
 * controles encarece las que sí se usan todos los días.
 */
export function CollectionPicker({ media }: { media: SavedMedia }) {
  const collections = useMediaStore((state) => state.collections);
  const { createCollection, toggleMembership } = useCollectionActions();
  const { showToast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const memberOf = media.collections ?? [];

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const id = await createCollection(name);
      if (!id) return;
      // Crear una lista desde la ficha de un título implica querer meterlo ahí:
      // pedir un segundo clic para eso sería pedir de más.
      await toggleMembership(media, id);
      showToast(`Creamos "${name.trim()}" y agregamos "${media.title}".`);
      setName('');
      setIsCreating(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Mis listas</h3>

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
                  onClick={() => toggleMembership(media, item.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors',
                    isMember
                      ? 'bg-accent text-accent-contrast border-accent'
                      : 'bg-transparent border-border-card text-text-muted hover:text-text-main hover:border-text-subtle',
                  )}
                >
                  {isMember ? (
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
            className="flex-1 bg-bg-main border border-border-card rounded-xl px-3 py-2 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!name.trim() || isSaving}
            className="px-4 py-2 rounded-xl bg-accent text-accent-contrast text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center gap-2"
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
            className="px-3 py-2 rounded-xl border border-border-card text-sm text-text-muted hover:text-text-main transition-colors"
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
