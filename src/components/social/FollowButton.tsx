import { Check, Clock, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSocial } from '@/hooks/useSocial';
import { useFollowActions } from '@/hooks/useFollowActions';
import { Account, followButtonLabel, relationship } from '@/lib/social';
import { cn } from '@/lib/utils';

/**
 * "Seguir", "Solicitar seguir", "Solicitado", "Siguiendo". Un interruptor:
 * apretado sigue, o pidió; volver a tocarlo deja de seguir o cancela la
 * solicitud. Sin usuario propio todavía, lleva a crearlo.
 */
export function FollowButton({ target, className }: { target: Account; className?: string }) {
  const { uid, follows, isReady, needsOnboarding, blocked } = useSocial();
  const { follow, unfollow } = useFollowActions();

  if (!uid || target.uid === uid || blocked.includes(target.uid)) return null;
  if (needsOnboarding) {
    return (
      <Link to="/social" className={cn('btn btn-primary px-4 py-2 text-sm', className)}>
        <UserPlus size={16} aria-hidden="true" />
        Creá tu usuario para seguir
      </Link>
    );
  }
  if (!isReady) return null;

  const rel = relationship(follows, target.uid);
  const isOn = rel.following || rel.requested;
  const label = followButtonLabel(rel, target);
  const Icon = rel.following ? Check : rel.requested ? Clock : UserPlus;

  return (
    <button
      type="button"
      aria-pressed={isOn}
      onClick={() => (isOn ? unfollow(target.uid) : follow(target))}
      className={cn(
        'btn px-4 py-2 text-sm border',
        isOn
          ? 'border-border-card text-text-main hover:border-text-subtle'
          : 'bg-accent text-accent-contrast border-accent',
        className,
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
