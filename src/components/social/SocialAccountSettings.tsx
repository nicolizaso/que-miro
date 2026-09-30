import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, MessageCircle, Pencil, UserPlus, X } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/social/Avatar';
import { ProfileEditor } from '@/components/social/ProfileEditor';
import { ShareButton } from '@/components/ShareButton';
import { useSocial } from '@/hooks/useSocial';
import { useSocialAccount } from '@/hooks/useSocialAccount';
import { useSocialSettings } from '@/hooks/useSocialSettings';
import { useFollowActions } from '@/hooks/useFollowActions';
import { usePeople } from '@/hooks/usePeople';
import { useToast } from '@/contexts/ToastContext';
import { SHARING_KEYS, inviteText, inviteUrl, whatsappUrl } from '@/lib/social';
import { SocialSharing } from '@/types';

const SHARING_LABELS: Record<keyof SocialSharing, { label: string; hint: string }> = {
  completed: { label: 'Lo que terminás', hint: 'Con tu puntaje y tu reseña.' },
  progress: { label: 'Los episodios que ves', hint: '"Vio 3 episodios de…", "empezó…".' },
  added: { label: 'Lo que sumás a Por Ver', hint: 'Solo lo que agregues de ahora en más.' },
  abandoned: { label: 'Lo que abandonás', hint: 'El motivo no se comparte nunca.' },
  goals: { label: 'Las metas que cumplís', hint: 'Las de películas y series del año.' },
  lists: { label: 'Las listas que publicás', hint: 'Las que ya tienen su link.' },
  watching: { label: 'Viendo ahora', hint: 'Lo que tocaste en las últimas dos semanas.' },
  library: {
    label: 'Tu biblioteca resumida',
    hint: 'Qué puntuaste y tu Por Ver: lo que usan "Lo vieron tus amigos", "En común" y "¿Qué miramos juntos?".',
  },
};

/** Una lista de cuentas con un botón para deshacer: silenciadas o bloqueadas. */
function PeopleList({ uids, action, onAction }: { uids: string[]; action: string; onAction: (uid: string) => void }) {
  const people = usePeople(uids);
  return (
    <ul className="flex flex-col gap-2">
      {uids.map((uid) => {
        const person = people[uid];
        const name = person?.displayName ?? 'Cuenta sin nombre';
        return (
          <li key={uid} className="flex items-center gap-3">
            <Avatar name={name} avatarPath={person?.avatarPath ?? null} size="sm" />
            <span className="flex-1 min-w-0 text-sm truncate">
              {name}
              {person && <span className="text-text-subtle"> @{person.handle}</span>}
            </span>
            <button type="button" onClick={() => onAction(uid)} className="text-sm text-text-muted hover:text-text-main underline underline-offset-4">
              {action}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Tu cuenta social", en Ajustes: tu perfil, a quién invitar, qué ven tus
 * seguidores, pausar, y a quién silenciaste o bloqueaste.
 */
export function SocialAccountSettings() {
  const titleId = useId();
  const { mode, account, needsOnboarding, blocked } = useSocial();
  const { isAvailable, update, changeHandle } = useSocialAccount();
  const { settings, setSharing, setPaused, unmute } = useSocialSettings();
  const { unblock } = useFollowActions();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  if (mode === 'off') return null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Tu cuenta social</h2>
        <p className="text-sm text-text-muted">
          Quién te sigue, qué ve de vos y cómo invitar a alguien.
        </p>
      </div>

      {needsOnboarding || !account ? (
        <div className="surface p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted flex-1 min-w-[14rem]">
            Todavía no elegiste tu usuario. Con él te pueden encontrar, seguir y ver lo que mirás.
          </p>
          <Link to="/social" className="btn btn-primary px-4 py-2 text-sm">
            <UserPlus size={16} aria-hidden="true" /> Crear mi usuario
          </Link>
        </div>
      ) : (
        <>
          <div className="surface p-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={account.displayName} avatarPath={account.avatarPath} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate flex items-center gap-1.5">
                  {account.displayName}
                  {account.private && <Lock size={14} className="text-text-subtle" aria-label="Cuenta privada" />}
                </p>
                <Link to={`/u/${account.handle}`} className="text-sm text-accent hover:underline">
                  @{account.handle}
                </Link>
              </div>
              <button type="button" onClick={() => setIsEditing(true)} className="btn btn-secondary px-3 py-2 text-sm">
                <Pencil size={14} aria-hidden="true" /> Editar
              </button>
            </div>

            {typeof window !== 'undefined' && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={whatsappUrl(inviteText(account, inviteUrl(window.location.origin, account.handle)))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary px-4 py-2 text-sm"
                >
                  <MessageCircle size={16} aria-hidden="true" /> Invitar por WhatsApp
                </a>
                <ShareButton
                  label="Compartir invitación"
                  title="Sumate a Qué Miro?"
                  text={inviteText(account, '').replace(/: $/, '.')}
                  url={inviteUrl(window.location.origin, account.handle)}
                />
              </div>
            )}
          </div>

          <div className="surface p-4 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold">Qué ven tus seguidores</h3>
              <p className="text-xs text-text-subtle">
                {account.private
                  ? 'Solo quienes aceptaste.'
                  : 'Cualquiera con cuenta en Qué Miro?: la tuya es pública.'}{' '}
                Un título puntual se oculta desde su ficha.
              </p>
            </div>
            {SHARING_KEYS.map((key) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.sharing[key]}
                  onChange={(event) => setSharing(key, event.target.checked)}
                  className="mt-1 w-4 h-4 accent-accent shrink-0"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{SHARING_LABELS[key].label}</span>
                  <span className="text-xs text-text-subtle">{SHARING_LABELS[key].hint}</span>
                </span>
              </label>
            ))}
            <label className="flex items-start gap-3 cursor-pointer border-t border-border-card pt-4">
              <input
                type="checkbox"
                checked={settings.paused}
                onChange={(event) => setPaused(event.target.checked)}
                className="mt-1 w-4 h-4 accent-accent shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Pausar mi actividad</span>
                <span className="text-xs text-text-subtle">
                  No se publica nada nuevo hasta que la despauses. Lo que ya estaba publicado se queda como estaba.
                </span>
              </span>
            </label>
          </div>

          {settings.muted.length > 0 && (
            <div className="surface p-4 flex flex-col gap-3">
              <h3 className="font-semibold">Silenciadas</h3>
              <p className="text-xs text-text-subtle">Las seguís, pero no aparecen en tu feed ni en tus notificaciones.</p>
              <PeopleList uids={settings.muted} action="Dejar de silenciar" onAction={unmute} />
            </div>
          )}

          {blocked.length > 0 && (
            <div className="surface p-4 flex flex-col gap-3">
              <h3 className="font-semibold">Bloqueadas</h3>
              <p className="text-xs text-text-subtle">No pueden seguirte, ver tu actividad ni mandarte nada.</p>
              <PeopleList uids={blocked} action="Desbloquear" onAction={unblock} />
            </div>
          )}

          <Dialog
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            labelledBy={titleId}
            className="z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-overlay backdrop-blur-sm"
          >
            <div className="w-full sm:max-w-lg bg-bg-card border border-border-card rounded-t-3xl sm:rounded-3xl shadow-pop p-6 flex flex-col gap-5 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <h2 id={titleId} className="font-serif italic font-bold text-2xl">
                  Editar tu perfil
                </h2>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  aria-label="Cerrar"
                  className="btn-icon w-9 h-9 shrink-0 rounded-full text-text-muted hover:text-text-main hover:bg-border-card"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <ProfileEditor
                initial={{
                  handle: account.handle,
                  displayName: account.displayName,
                  bio: account.bio,
                  avatarPath: account.avatarPath,
                  top4: account.top4,
                  private: account.private,
                }}
                submitLabel="Guardar"
                checkHandle={isAvailable}
                onSubmit={async ({ handle, ...rest }) => {
                  if (handle !== account.handle) await changeHandle(handle, rest);
                  else await update(rest);
                  setIsEditing(false);
                  showToast('Guardamos tu perfil.');
                }}
              />
            </div>
          </Dialog>
        </>
      )}
    </section>
  );
}
