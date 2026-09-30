import { useId, useMemo, useState } from 'react';
import { Film, Send, X } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/social/Avatar';
import { PickerSearch } from '@/components/taste/PickerSearch';
import { useSocial } from '@/hooks/useSocial';
import { usePeople } from '@/hooks/usePeople';
import { useSocialInteractions } from '@/hooks/useSocialInteractions';
import { ActivityTitle } from '@/lib/activity';
import { NOTE_MAX, mutualUids } from '@/lib/social';
import { TMDB_IMAGE_BASE_URL, searchMulti } from '@/lib/tmdb';
import { TMDbResult } from '@/types';
import { cn } from '@/lib/utils';

/**
 * "Te lo recomiendo": a una persona, un título, con una nota corta. Solo a
 * quienes se siguen mutuamente —así nadie te llena la bandeja de
 * recomendaciones—. Se abre desde la ficha (el título ya está, falta a
 * quién) o desde el perfil de alguien (la persona ya está, falta qué).
 */
export function RecommendDialog({
  isOpen,
  onClose,
  title: fixedTitle,
  toUid: fixedUid,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ActivityTitle;
  toUid?: string;
}) {
  const headingId = useId();
  const { follows } = useSocial();
  const mutuals = useMemo(() => mutualUids(follows), [follows]);
  const people = usePeople(fixedUid ? [fixedUid] : mutuals);
  const { recommend } = useSocialInteractions();
  const [chosenUid, setChosenUid] = useState<string | null>(fixedUid ?? null);
  const [chosenTitle, setChosenTitle] = useState<ActivityTitle | null>(fixedTitle ?? null);
  const [note, setNote] = useState('');

  const target = chosenUid ? people[chosenUid] : null;
  const canSend = Boolean(chosenUid && chosenTitle);

  const send = () => {
    if (!chosenUid || !chosenTitle) return;
    recommend(chosenUid, target?.displayName ?? 'esa persona', chosenTitle, note.trim());
    setNote('');
    if (!fixedTitle) setChosenTitle(null);
    if (!fixedUid) setChosenUid(null);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={headingId}
      className="z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-overlay backdrop-blur-sm"
    >
      <div className="w-full sm:max-w-lg bg-bg-card border border-border-card rounded-t-3xl sm:rounded-3xl shadow-pop p-6 flex flex-col gap-5 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="font-serif italic font-bold text-2xl">
            {fixedTitle ? `Recomendar “${fixedTitle.title}”` : `Recomendarle algo a ${target?.displayName ?? '…'}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="btn-icon w-9 h-9 shrink-0 rounded-full text-text-muted hover:text-text-main hover:bg-border-card"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {!fixedUid &&
          (mutuals.length === 0 ? (
            <p className="text-sm text-text-muted">
              Se recomienda entre quienes se siguen mutuamente, y todavía no tenés a nadie así. Cuando alguien que
              seguís te siga de vuelta, vas a poder mandarle recomendaciones.
            </p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium mb-2">¿A quién?</legend>
              <ul className="flex flex-col gap-1">
                {mutuals.map((uid) => {
                  const person = people[uid];
                  const name = person?.displayName ?? '…';
                  return (
                    <li key={uid}>
                      <label
                        className={cn(
                          'flex items-center gap-3 p-2 rounded-control border cursor-pointer',
                          chosenUid === uid ? 'border-accent' : 'border-transparent hover:border-border-card',
                        )}
                      >
                        <input
                          type="radio"
                          name={`${headingId}-to`}
                          checked={chosenUid === uid}
                          onChange={() => setChosenUid(uid)}
                          className="w-4 h-4 accent-accent shrink-0"
                        />
                        <Avatar name={name} avatarPath={person?.avatarPath ?? null} size="sm" />
                        <span className="text-sm">
                          {name}
                          {person && <span className="text-text-subtle"> @{person.handle}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}

        {!fixedTitle &&
          (chosenTitle ? (
            <div className="flex items-center gap-3">
              <span className="w-10 aspect-[2/3] rounded bg-border-card overflow-hidden grid place-items-center text-text-subtle">
                {chosenTitle.posterPath ? (
                  <img src={`${TMDB_IMAGE_BASE_URL}${chosenTitle.posterPath}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Film size={14} aria-hidden="true" />
                )}
              </span>
              <span className="flex-1 text-sm font-medium">{chosenTitle.title}</span>
              <button type="button" onClick={() => setChosenTitle(null)} className="text-sm text-text-muted underline underline-offset-4">
                Cambiar
              </button>
            </div>
          ) : (
            <PickerSearch<TMDbResult>
              label="Buscar qué recomendar"
              placeholder="Una película o una serie"
              search={async (query) =>
                (await searchMulti(query)).filter((result) => result.media_type === 'movie' || result.media_type === 'tv')
              }
              itemKey={(result) => `${result.media_type}-${result.id}`}
              itemLabel={(result) => result.title || result.name || ''}
              renderItem={(result) => (
                <span className="text-sm">
                  {result.title || result.name}{' '}
                  <span className="text-text-subtle">
                    {(result.release_date || result.first_air_date || '').split('-')[0]}
                  </span>
                </span>
              )}
              onSelect={(result) =>
                setChosenTitle({
                  tmdbId: result.id,
                  mediaType: result.media_type === 'tv' ? 'tv' : 'movie',
                  title: result.title || result.name || '',
                  posterPath: result.poster_path,
                  releaseYear: (result.release_date || result.first_air_date || '').split('-')[0],
                })
              }
            />
          ))}

        <div className="flex flex-col gap-2">
          <label htmlFor={`${headingId}-note`} className="text-sm font-medium">
            Una nota <span className="text-text-subtle font-normal">(opcional)</span>
          </label>
          <textarea
            id={`${headingId}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={NOTE_MAX}
            rows={2}
            placeholder="Te va a encantar el final."
            className="bg-bg-main border border-border-control rounded-control px-3 py-2 text-sm placeholder:text-text-subtle focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <button type="button" onClick={send} disabled={!canSend} className="btn btn-primary self-start px-5 py-2.5 text-sm">
          <Send size={16} aria-hidden="true" /> Recomendar
        </button>
      </div>
    </Dialog>
  );
}
