import { Link } from 'react-router-dom';
import { Film, Tv } from 'lucide-react';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { Avatar } from '@/components/social/Avatar';
import { WatchingBubble } from '@/lib/socialFeed';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { MediaType } from '@/types';

/**
 * "Viendo ahora", arriba del feed: lo que está mirando cada persona que
 * seguís, como las historias de cualquier red. Solo con alguien viendo algo:
 * una fila vacía no le dice nada a nadie.
 */
export function WatchingRow({
  bubbles,
  onOpen,
}: {
  bubbles: WatchingBubble[];
  onOpen: (id: number, type: MediaType) => void;
}) {
  if (bubbles.length === 0) return null;
  return (
    <section>
      <ScrollRail label="Viendo ahora" header={<h2 className="text-section">Viendo ahora</h2>}>
        {bubbles.map(({ person, now }) => (
          <li key={person.uid} className="rail-item w-24 shrink-0 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={() => onOpen(now.title.tmdbId, now.title.mediaType)}
              aria-label={`${person.name} está viendo ${now.title.title}${now.label ? `, por ${now.label}` : ''}`}
              className="relative w-20 aspect-[2/3] rounded-control overflow-hidden bg-border-card ring-2 ring-accent ring-offset-2 ring-offset-bg-main flex items-center justify-center text-text-subtle"
            >
              {now.title.posterPath ? (
                <img src={`${TMDB_IMAGE_BASE_URL}${now.title.posterPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : now.title.mediaType === 'tv' ? (
                <Tv size={20} aria-hidden="true" />
              ) : (
                <Film size={20} aria-hidden="true" />
              )}
              {now.label && (
                <span className="absolute bottom-1 right-1 rounded bg-bg-main/90 px-1 text-[10px] font-semibold text-text-main">
                  {now.label}
                </span>
              )}
            </button>
            <Link to={`/u/${person.handle}`} className="flex items-center gap-1.5 text-xs font-medium hover:underline max-w-full">
              <Avatar name={person.name} avatarPath={person.avatarPath} size="sm" className="w-5 h-5 text-[10px]" />
              <span className="truncate">{person.name}</span>
            </Link>
          </li>
        ))}
      </ScrollRail>
    </section>
  );
}
