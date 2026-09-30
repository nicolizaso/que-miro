import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { useSocial } from '@/hooks/useSocial';
import { useSocialInteractions } from '@/hooks/useSocialInteractions';
import { REACTIONS, ReactionId } from '@/lib/social';
import { cn } from '@/lib/utils';

/**
 * Las reacciones de un evento: cada una con su cuenta, apretada si es la
 * tuya. Una por persona: elegir otra cambia la tuya, y tocar la misma la
 * saca.
 */
export function ReactionBar({
  ownerUid,
  eventId,
  reactions,
  canReact,
}: {
  ownerUid: string;
  eventId: string;
  reactions: Partial<Record<ReactionId, string[]>>;
  canReact: boolean;
}) {
  const { uid, isReady } = useSocial();
  const { react } = useSocialInteractions();
  const mine = uid
    ? (Object.entries(reactions) as [ReactionId, string[]][]).find(([, uids]) => uids.includes(uid))?.[0]
    : undefined;
  const interactive = canReact && isReady && uid !== ownerUid;
  const [isPicking, setIsPicking] = useState(false);
  // Se muestran las que alguien usó; las demás, recién al pedir reaccionar.
  // Cinco botones vacíos en cada tarjeta del feed son ruido.
  const shown = REACTIONS.filter(
    (reaction) => (reactions[reaction.id]?.length ?? 0) > 0 || (interactive && isPicking),
  );
  if (shown.length === 0 && !interactive) return null;

  const choose = (id: ReactionId) => {
    react(ownerUid, eventId, mine === id ? null : id);
    setIsPicking(false);
  };

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Reacciones">
      {shown.map(({ id, emoji, label }) => {
        const count = reactions[id]?.length ?? 0;
        const pressed = mine === id;
        const text = `${label}${count ? `: ${count}` : ''}`;
        return (
          <li key={id}>
            {interactive ? (
              <button
                type="button"
                aria-pressed={pressed}
                aria-label={text}
                title={label}
                onClick={() => choose(id)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full border text-sm transition-colors',
                  pressed
                    ? 'border-accent bg-accent/10 text-text-main'
                    : 'border-border-card text-text-muted hover:border-text-subtle',
                )}
              >
                <span aria-hidden="true">{emoji}</span>
                {count > 0 && <span className="text-xs font-medium">{count}</span>}
              </button>
            ) : (
              <span
                aria-label={text}
                className="flex items-center gap-1 px-2 py-1 rounded-full border border-border-card text-sm text-text-muted"
              >
                <span aria-hidden="true">{emoji}</span>
                <span className="text-xs font-medium">{count}</span>
              </span>
            )}
          </li>
        );
      })}
      {interactive && !isPicking && (
        <li>
          <button
            type="button"
            onClick={() => setIsPicking(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-text-muted hover:text-text-main hover:bg-border-card"
          >
            <SmilePlus size={14} aria-hidden="true" />
            {mine ? 'Cambiar' : 'Reaccionar'}
          </button>
        </li>
      )}
    </ul>
  );
}
