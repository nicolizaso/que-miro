import { FormEvent, useEffect, useId, useState } from 'react';
import { Film, Loader2, Lock, Globe, X } from 'lucide-react';
import { PickerSearch } from '@/components/taste/PickerSearch';
import { Avatar } from '@/components/social/Avatar';
import { ProfileDraft } from '@/hooks/useSocialAccount';
import { BIO_MAX, DISPLAY_NAME_MAX, TOP_TITLES, handleProblem, normalizeHandle } from '@/lib/social';
import { TMDB_AVATAR_URL, TMDB_IMAGE_BASE_URL, searchMulti } from '@/lib/tmdb';
import { PickedTitle, TMDbResult } from '@/types';
import { cn } from '@/lib/utils';

function TitleResult({ result }: { result: TMDbResult }) {
  const name = result.title || result.name || '';
  const date = result.release_date || result.first_air_date || '';
  return (
    <>
      <span className="w-9 h-12 rounded overflow-hidden bg-border-card grid place-items-center text-text-subtle shrink-0">
        {result.poster_path ? (
          <img src={`${TMDB_IMAGE_BASE_URL}${result.poster_path}`} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Film size={14} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate">{name}</span>
        <span className="block text-xs text-text-subtle">{date ? date.split('-')[0] : 'Sin fecha'}</span>
      </span>
    </>
  );
}

function toPicked(result: TMDbResult): PickedTitle {
  const date = result.release_date || result.first_air_date || '';
  return {
    tmdbId: result.id,
    mediaType: result.media_type === 'tv' ? 'tv' : 'movie',
    title: result.title || result.name || '',
    posterPath: result.poster_path,
    releaseYear: date ? date.split('-')[0] : '',
  };
}

const titlesOnly = async (query: string) =>
  (await searchMulti(query)).filter((result) => result.media_type === 'movie' || result.media_type === 'tv');

/**
 * El avatar: se busca un título y se elige su póster o su imagen de fondo.
 * No se suben fotos: así no hay archivos que guardar ni imágenes que moderar.
 */
function AvatarPicker({ value, name, onChange }: { value: string | null; name: string; onChange: (path: string | null) => void }) {
  const [candidate, setCandidate] = useState<TMDbResult | null>(null);
  const options = candidate
    ? [candidate.poster_path, candidate.backdrop_path].filter((path): path is string => Boolean(path))
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={name || '?'} avatarPath={value} size="lg" />
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-sm text-text-muted hover:text-text-main underline underline-offset-4">
            Sacar la imagen
          </button>
        )}
      </div>
      <PickerSearch<TMDbResult>
        label="Buscar una película o serie para tu avatar"
        placeholder="Tu avatar sale de un póster: Amélie, Twin Peaks…"
        search={titlesOnly}
        itemKey={(result) => `${result.media_type}-${result.id}`}
        itemLabel={(result) => result.title || result.name || ''}
        renderItem={(result) => <TitleResult result={result} />}
        onSelect={setCandidate}
      />
      {candidate && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-muted">
            {options.length ? `Elegí una imagen de ${candidate.title || candidate.name}:` : 'Ese título no tiene imágenes. Probá con otro.'}
          </p>
          <div className="flex gap-3">
            {options.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => {
                  onChange(path);
                  setCandidate(null);
                }}
                aria-label={path === candidate.poster_path ? 'Usar el póster' : 'Usar la imagen de fondo'}
                className={cn(
                  'w-16 h-16 rounded-full overflow-hidden border-2 transition-colors',
                  value === path ? 'border-accent' : 'border-border-card hover:border-text-subtle',
                )}
              >
                <img src={`${TMDB_AVATAR_URL}${path}`} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tu top 4: cuatro títulos que te definen, con el orden en que los elegiste. */
function TopPicker({ value, onChange }: { value: PickedTitle[]; onChange: (titles: PickedTitle[]) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ol className="grid grid-cols-4 gap-2">
          {value.map((title) => (
            <li key={`${title.mediaType}-${title.tmdbId}`} className="relative">
              <span className="block aspect-[2/3] rounded-control overflow-hidden bg-border-card">
                {title.posterPath ? (
                  <img src={`${TMDB_IMAGE_BASE_URL}${title.posterPath}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full grid place-items-center text-text-subtle">
                    <Film size={16} aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="block text-xs mt-1 truncate">{title.title}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((other) => other !== title))}
                aria-label={`Sacar ${title.title}`}
                className="absolute top-1 right-1 btn-icon w-6 h-6 rounded-full bg-bg-main/90 text-text-main"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <PickerSearch<TMDbResult>
        label="Buscar un título para tu top 4"
        placeholder="Las cuatro que te definen"
        search={titlesOnly}
        itemKey={(result) => `${result.media_type}-${result.id}`}
        itemLabel={(result) => result.title || result.name || ''}
        renderItem={(result) => <TitleResult result={result} />}
        onSelect={(result) => {
          const picked = toPicked(result);
          if (value.some((title) => title.tmdbId === picked.tmdbId && title.mediaType === picked.mediaType)) return;
          onChange([...value, picked].slice(0, TOP_TITLES));
        }}
        full={value.length >= TOP_TITLES}
        fullHint="Ya elegiste cuatro. Sacá alguna para cambiarla."
      />
    </div>
  );
}

/**
 * El formulario de la cuenta social: sirve para crearla y para editarla. El
 * usuario se valida mientras se escribe —forma y disponibilidad—, pero el
 * que decide si está libre es Firestore al guardar.
 */
export function ProfileEditor({
  initial,
  submitLabel,
  checkHandle,
  onSubmit,
}: {
  initial: ProfileDraft;
  submitLabel: string;
  /** Si el usuario está libre. Solo orienta. */
  checkHandle: (handle: string) => Promise<boolean>;
  onSubmit: (draft: ProfileDraft) => Promise<void>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const problem = handleProblem(draft.handle);

  useEffect(() => {
    if (problem || draft.handle === initial.handle) {
      setAvailability('idle');
      return;
    }
    setAvailability('checking');
    let cancelled = false;
    const timer = setTimeout(() => {
      checkHandle(draft.handle)
        .then((free) => !cancelled && setAvailability(free ? 'free' : 'taken'))
        .catch(() => !cancelled && setAvailability('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.handle, problem, initial.handle, checkHandle]);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem || availability === 'taken' || !draft.displayName.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      await onSubmit({ ...draft, displayName: draft.displayName.trim(), bio: draft.bio.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos guardar. Intentá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const hint =
    problem && draft.handle
      ? problem
      : availability === 'checking'
        ? 'Fijándonos si está libre…'
        : availability === 'taken'
          ? 'Ese usuario ya está tomado.'
          : availability === 'free'
            ? 'Está libre.'
            : `Es también la dirección de tu perfil: /u/${draft.handle || 'tu-usuario'}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-handle`} className="text-sm font-medium">
          Usuario
        </label>
        <div className="flex items-center bg-bg-main border border-border-control rounded-control focus-within:border-accent">
          <span className="pl-3 text-text-subtle" aria-hidden="true">
            @
          </span>
          <input
            id={`${id}-handle`}
            value={draft.handle}
            onChange={(event) => set('handle', normalizeHandle(event.target.value))}
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            aria-describedby={`${id}-handle-hint`}
            aria-invalid={Boolean(problem && draft.handle) || availability === 'taken'}
            className="flex-1 bg-transparent px-2 py-3 focus:outline-none"
          />
        </div>
        <p
          id={`${id}-handle-hint`}
          aria-live="polite"
          className={cn('text-xs', (problem && draft.handle) || availability === 'taken' ? 'text-accent' : 'text-text-subtle')}
        >
          {hint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Nombre
        </label>
        <input
          id={`${id}-name`}
          value={draft.displayName}
          onChange={(event) => set('displayName', event.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          required
          className="bg-bg-main border border-border-control rounded-control px-3 py-3 focus:outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-bio`} className="text-sm font-medium">
          Bio <span className="text-text-subtle font-normal">(opcional)</span>
        </label>
        <textarea
          id={`${id}-bio`}
          value={draft.bio}
          onChange={(event) => set('bio', event.target.value)}
          maxLength={BIO_MAX}
          rows={2}
          placeholder="Terror de los 80 y comedias que nadie vio."
          className="bg-bg-main border border-border-control rounded-control px-3 py-2 text-sm placeholder:text-text-subtle focus:outline-none focus:border-accent resize-none"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-2">Avatar</legend>
        <AvatarPicker value={draft.avatarPath} name={draft.displayName} onChange={(path) => set('avatarPath', path)} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-2">Tu top 4</legend>
        <TopPicker value={draft.top4} onChange={(titles) => set('top4', titles)} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium mb-2">¿Quién puede ver tu actividad?</legend>
        {[
          {
            value: false,
            Icon: Globe,
            label: 'Cuenta pública',
            text: 'Cualquiera con cuenta te sigue al toque, y tu perfil se ve en /u/… sin sesión.',
          },
          {
            value: true,
            Icon: Lock,
            label: 'Cuenta privada',
            text: 'Aceptás a cada persona. Sin aceptar, ven tu nombre y tu avatar, nada más.',
          },
        ].map(({ value, Icon, label, text }) => (
          <label
            key={label}
            className={cn(
              'flex items-start gap-3 p-3 rounded-control border cursor-pointer',
              draft.private === value ? 'border-accent' : 'border-border-card',
            )}
          >
            <input
              type="radio"
              name={`${id}-privacy`}
              checked={draft.private === value}
              onChange={() => set('private', value)}
              className="mt-1 w-4 h-4 accent-accent shrink-0"
            />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon size={14} aria-hidden="true" /> {label}
              </span>
              <span className="text-xs text-text-muted">{text}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving || Boolean(problem) || availability === 'taken' || availability === 'checking' || !draft.displayName.trim()}
        className="btn btn-primary self-start px-5 py-2.5 text-sm"
      >
        {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
    </form>
  );
}
