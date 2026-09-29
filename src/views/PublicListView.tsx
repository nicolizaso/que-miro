import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Film, ListPlus, ListX, Loader2, Plus, Tv } from 'lucide-react';
import { useMediaStore } from '@/store';
import { usePublicListById, useSaveFromList } from '@/hooks/usePublicList';
import { PublicFrame, PublicLoading, PublicMissing } from '@/components/PublicFrame';
import { ShareButton } from '@/components/ShareButton';
import { PublicList, listShareCard } from '@/lib/publicList';
import { formatRelative, formatWatchDate } from '@/lib/dates';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';

type Item = PublicList['items'][number];

function ListItem({ item, canSave, onSave }: { item: Item; canSave: boolean; onSave: (item: Item) => Promise<void> }) {
  const saved = useMediaStore((state) =>
    state.mediaList.some((media) => media.tmdbId === item.tmdbId && media.mediaType === item.mediaType),
  );
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setIsSaving(true);
    try {
      await onSave(item);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <li className="flex flex-col gap-2">
      <div className="relative aspect-[2/3] w-full rounded-control overflow-hidden bg-border-card shadow-card">
        {item.posterPath ? (
          <img src={`${TMDB_IMAGE_BASE_URL}${item.posterPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-subtle">
            {item.mediaType === 'tv' ? <Tv size={28} aria-hidden="true" /> : <Film size={28} aria-hidden="true" />}
          </div>
        )}
        <span className="absolute inset-0 rounded-control ring-1 ring-inset ring-text-main/10" />
      </div>
      <div>
        <p className="text-sm font-medium leading-tight line-clamp-2">{item.title}</p>
        <p className="text-xs text-text-subtle">
          {[item.releaseYear, item.mediaType === 'tv' ? 'Serie' : 'Película'].filter(Boolean).join(' · ')}
        </p>
      </div>
      {canSave &&
        (saved ? (
          <p className="flex items-center gap-1 text-xs text-text-subtle">
            <Check size={12} aria-hidden="true" /> En tu biblioteca
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            aria-label={`Guardar "${item.title}" en Por Ver`}
            className="btn btn-secondary self-start px-2.5 py-1 text-xs"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
            Por Ver
          </button>
        ))}
    </li>
  );
}

/**
 * Una lista compartida (`/l/{id}`), en modo lectura. Se ve sin sesión; quien
 * tiene una biblioteca puede guardar un título suelto o la lista entera como
 * propia.
 */
export function PublicListView() {
  const { id } = useParams<{ id: string }>();
  const { list, isLoading, error } = usePublicListById(id);
  const { canSave, saveOne, saveAll } = useSaveFromList();
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savedAll, setSavedAll] = useState(false);

  if (isLoading) {
    return (
      <PublicFrame>
        <PublicLoading label="Cargando lista" />
      </PublicFrame>
    );
  }
  if (error || !list) {
    return (
      <PublicFrame>
        <PublicMissing
          Icon={ListX}
          title={error ? 'No pudimos cargar la lista' : 'Esta lista no existe'}
          text={
            error
              ? 'Puede ser un problema momentáneo. Probá de nuevo en un rato.'
              : 'El link puede estar mal escrito, o quien la armó dejó de compartirla.'
          }
        />
      </PublicFrame>
    );
  }

  const url = typeof window !== 'undefined' ? `${window.location.origin}/l/${list.id}` : '';
  const count = `${list.items.length} ${list.items.length === 1 ? 'título' : 'títulos'}`;

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      setSavedAll(await saveAll(list));
    } finally {
      setIsSavingAll(false);
    }
  };

  return (
    <PublicFrame>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <p className="text-eyebrow text-accent">Una lista de {list.ownerName}</p>
          <h1 className="text-display sm:text-5xl">{list.name}</h1>
          <p className="text-sm text-text-subtle">
            {count} · Actualizada{' '}
            <time dateTime={list.publishedAt} title={formatWatchDate(list.publishedAt)}>
              {formatRelative(list.publishedAt)}
            </time>
          </p>
          {list.description && (
            <p className="text-text-muted leading-relaxed max-w-prose whitespace-pre-line">{list.description}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {canSave && list.items.length > 0 && (
              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={isSavingAll || savedAll}
                className="btn btn-primary px-4 py-2 text-sm"
              >
                {isSavingAll ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : savedAll ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <ListPlus size={16} aria-hidden="true" />
                )}
                {savedAll ? 'Guardada en tus listas' : 'Guardar toda la lista'}
              </button>
            )}
            <ShareButton
              label="Compartir"
              title={list.name}
              text={`${list.name}, una lista de ${list.ownerName} en Qué Miro?`}
              url={url}
              card={listShareCard(list, url)}
            />
          </div>
        </section>

        {list.items.length > 0 && (
          <ul className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-6">
            {list.items.map((item) => (
              <ListItem key={`${item.mediaType}-${item.tmdbId}`} item={item} canSave={canSave} onSave={saveOne} />
            ))}
          </ul>
        )}
      </div>
    </PublicFrame>
  );
}
