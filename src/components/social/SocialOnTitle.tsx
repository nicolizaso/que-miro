import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, Send, Star } from 'lucide-react';
import { Avatar } from '@/components/social/Avatar';
import { RecommendDialog } from '@/components/social/RecommendDialog';
import { useSocial } from '@/hooks/useSocial';
import { useSocialFeed } from '@/hooks/useSocialFeed';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useMediaStore } from '@/store';
import { ActivityTitle } from '@/lib/activity';
import { friendStatusText, friendsOnTitle } from '@/lib/socialFeed';
import { mutualUids } from '@/lib/social';
import { SavedMedia } from '@/types';

/**
 * Lo social de la ficha: quiénes de los que seguís tienen este título y qué
 * hicieron con él, "Recomendar" a un mutuo, y ocultarlo de tus seguidores.
 * Sin cuenta social no se muestra nada; sin nadie que lo tenga, no aparece
 * la lista.
 */
export function SocialOnTitle({ title, saved }: { title: ActivityTitle; saved: SavedMedia | null | undefined }) {
  const { isReady, follows } = useSocial();
  const { sources } = useSocialFeed();
  const muted = useMediaStore((state) => state.socialSettings.muted);
  const { patchMedia } = useMediaActions();
  const [isRecommending, setIsRecommending] = useState(false);

  const friends = useMemo(
    () => friendsOnTitle(sources, title.tmdbId, title.mediaType, muted),
    [sources, title.tmdbId, title.mediaType, muted],
  );
  const hasMutuals = useMemo(() => mutualUids(follows).length > 0, [follows]);

  if (!isReady) return null;

  return (
    <div className="flex flex-col gap-3">
      {friends.length > 0 && (
        <>
          <h3 className="text-section">Lo vieron tus amigos</h3>
          <ul className="flex flex-col gap-3">
            {friends.map(({ person, entry, review }) => (
              <li key={person.uid} className="flex gap-3 items-start">
                <Avatar name={person.name} avatarPath={person.avatarPath} size="sm" />
                <div className="min-w-0 flex flex-col gap-1">
                  <p className="text-sm">
                    <Link to={`/u/${person.handle}`} className="font-semibold hover:underline">
                      {person.name}
                    </Link>{' '}
                    {friendStatusText(entry)}
                    {entry.status === 'completada' && entry.rating && (
                      <Star size={12} className="inline ml-0.5 fill-accent text-accent" aria-hidden="true" />
                    )}
                  </p>
                  {review && <p className="text-sm text-text-muted line-clamp-3">“{review}”</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {hasMutuals && (
          <button type="button" onClick={() => setIsRecommending(true)} className="btn btn-secondary px-4 py-2 text-sm">
            <Send size={16} aria-hidden="true" /> Recomendar
          </button>
        )}
        {saved && (
          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(saved.hiddenFromFollowers)}
              onChange={(event) =>
                void patchMedia(saved.tmdbId, { hiddenFromFollowers: event.target.checked ? true : undefined })
              }
              className="w-4 h-4 accent-accent shrink-0"
            />
            <EyeOff size={14} aria-hidden="true" />
            No compartir este título
          </label>
        )}
      </div>

      <RecommendDialog isOpen={isRecommending} onClose={() => setIsRecommending(false)} title={title} />
    </div>
  );
}
