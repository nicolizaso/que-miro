import { useState } from 'react';
import { Check, FolderPlus, Globe, Loader2, Pencil, Share2, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMediaStore } from '@/store';
import {
  MAX_COLLECTION_NAME,
  useCollectionActions,
} from '@/hooks/useCollectionActions';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ShareListDialog } from '@/components/ShareListDialog';
import { useAuth } from '@/contexts/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';

/** Administración de las listas propias: crear, renombrar y borrar. */
export function CollectionsSettings() {
  const collections = useMediaStore((state) => state.collections);
  const mediaList = useMediaStore((state) => state.mediaList);
  const { createCollection, renameCollection, deleteCollection } =
    useCollectionActions();
  const { showToast } = useToast();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const { authState } = useAuth();
  // Publicar necesita cuenta: la instantánea lleva el uid de quien la publica.
  const canShare = isFirebaseConfigured && authState === 'authenticated';
  const sharing = collections.find((collection) => collection.id === sharingId);

  const countIn = (id: string) =>
    mediaList.filter((media) => media.collections?.includes(id)).length;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const id = await createCollection(newName);
      if (id) {
        showToast(`Creamos la lista "${newName.trim()}".`);
        setNewName('');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId || !editingName.trim()) return;

    await renameCollection(editingId, editingName);
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const name = collections.find((c) => c.id === pendingDelete)?.name;
    await deleteCollection(pendingDelete);
    setPendingDelete(null);
    showToast(`Borramos la lista "${name}". Los títulos siguen en tu biblioteca.`);
  };

  const pendingName = collections.find((c) => c.id === pendingDelete)?.name ?? '';
  const pendingCount = pendingDelete ? countIn(pendingDelete) : 0;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Mis listas</h2>
        <p className="text-sm text-text-muted">
          Agrupaciones propias, por fuera de los tres estados.
        </p>
      </div>

      <div className="surface p-4 flex flex-col gap-4">
        {collections.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Todavía no tenés ninguna. Creá una acá, o desde la ficha de
            cualquier título.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {collections.map((collection) => {
              const count = countIn(collection.id);

              if (editingId === collection.id) {
                return (
                  <li key={collection.id}>
                    <form onSubmit={handleRename} className="flex gap-2">
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        maxLength={MAX_COLLECTION_NAME}
                        aria-label={`Nuevo nombre para ${collection.name}`}
                        className="flex-1 bg-bg-main border border-border-control rounded-control px-3 py-2 text-sm focus:outline-none focus:border-accent"
                      />
                      <button
                        type="submit"
                        aria-label="Guardar nombre"
                        className="btn-icon w-10 h-10 bg-accent text-accent-contrast hover:opacity-90"
                      >
                        <Check size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancelar"
                        className="p-2 rounded-control border border-border-card text-text-muted hover:text-text-main transition-colors"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </form>
                  </li>
                );
              }

              return (
                <li
                  key={collection.id}
                  className="flex items-center gap-2 bg-bg-main border border-border-card rounded-control px-3 py-2"
                >
                  <Link
                    to={`/?lista=${encodeURIComponent(collection.id)}`}
                    className="flex-1 min-w-0 text-sm hover:text-accent transition-colors"
                  >
                    <span className="font-medium">{collection.name}</span>{' '}
                    <span className="text-text-subtle">
                      ({count} {count === 1 ? 'título' : 'títulos'})
                    </span>
                    {collection.publicId && (
                      <Globe
                        size={12}
                        className="inline ml-1.5 text-accent align-[-1px]"
                        aria-label="Publicada"
                      />
                    )}
                  </Link>
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => setSharingId(collection.id)}
                      aria-label={`Compartir ${collection.name}`}
                      className="p-2 rounded-lg text-text-subtle hover:text-text-main hover:bg-border-card transition-colors"
                    >
                      <Share2 size={14} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(collection.id);
                      setEditingName(collection.name);
                    }}
                    aria-label={`Renombrar ${collection.name}`}
                    className="p-2 rounded-lg text-text-subtle hover:text-text-main hover:bg-border-card transition-colors"
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(collection.id)}
                    aria-label={`Borrar ${collection.name}`}
                    className="p-2 rounded-lg text-text-subtle hover:text-accent hover:bg-border-card transition-colors"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={MAX_COLLECTION_NAME}
            placeholder="Maratón del finde"
            aria-label="Nombre de la lista nueva"
            className="flex-1 bg-bg-main border border-border-control rounded-control px-3 py-2 text-sm placeholder:text-text-subtle focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newName.trim() || isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-control border border-border-card text-sm font-medium hover:bg-border-card transition-colors disabled:opacity-40"
          >
            {isSaving ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <FolderPlus size={16} aria-hidden="true" />
            )}
            Crear
          </button>
        </form>
      </div>

      {sharing && (
        <ShareListDialog collection={sharing} isOpen onClose={() => setSharingId(null)} />
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Borrar la lista"
        confirmLabel="Borrar lista"
        destructive
        onConfirm={handleDelete}
        onClose={() => setPendingDelete(null)}
        description={
          <p>
            Se borra la lista <strong className="text-text-main">{pendingName}</strong>
            {pendingCount > 0 && (
              <>
                {' '}
                y se le saca la etiqueta a sus {pendingCount}{' '}
                {pendingCount === 1 ? 'título' : 'títulos'}
              </>
            )}
            . Los títulos siguen en tu biblioteca con sus reseñas intactas.
            {collections.find((collection) => collection.id === pendingDelete)?.publicId &&
              ' Como estaba publicada, su link deja de andar.'}
          </p>
        }
      />
    </section>
  );
}
