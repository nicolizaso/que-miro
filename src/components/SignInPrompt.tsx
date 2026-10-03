import { useId, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { useSignInPrompt } from '@/hooks/useSignInPrompt';
import { useMediaActions } from '@/hooks/useMediaActions';
import { useToast } from '@/contexts/ToastContext';
import { STATUS_LABELS } from '@/lib/archive';
import { chooseGuest, returnPathFor, savePendingSave } from '@/lib/pendingSave';

/**
 * "Guardalo con una cuenta": lo que ve un invitado al guardar su primer título.
 *
 * Es una sugerencia y no una puerta: seguir sin cuenta guarda igual, en este
 * navegador, y lo que se guarde así pasa a la cuenta el día que la cree. Por
 * eso las tres salidas pesan parecido y ninguna es "Cancelar".
 */
export function SignInPrompt() {
  const draft = useSignInPrompt((state) => state.draft);
  const close = useSignInPrompt((state) => state.close);
  const { addMedia } = useMediaActions();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const titleId = useId();
  // El foco arranca en la acción principal: es lo que se sugiere.
  const registerRef = useRef<HTMLButtonElement>(null);

  if (!draft) return null;

  const goToLogin = (mode: 'registro' | 'ingreso') => {
    savePendingSave({ draft, returnTo: returnPathFor(location.pathname, location.search, draft) });
    close();
    navigate(`/login?modo=${mode}&guardar=1`);
  };

  const continueAsGuest = async () => {
    chooseGuest();
    close();
    if ((await addMedia(draft)) === 'saved') {
      showToast(`"${draft.title}" quedó en ${STATUS_LABELS[draft.status]}, en este navegador.`);
    }
  };

  return (
    <Dialog
      isOpen
      onClose={close}
      labelledBy={titleId}
      initialFocusRef={registerRef}
      className="z-[80] flex items-end sm:items-center justify-center p-4 bg-overlay backdrop-blur-sm"
    >
      <div className="surface w-full max-w-md shadow-pop p-6 flex flex-col gap-4">
        <span className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center">
          <Cloud size={20} aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="text-section">
            Guardá “{draft.title}” con una cuenta
          </h2>
          <p className="text-sm text-text-muted leading-relaxed">
            Así tu biblioteca te sigue del celu a la compu y no se pierde si
            se borran los datos del navegador. Lo que guardes antes de entrar
            pasa solo a tu cuenta.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <button
            ref={registerRef}
            type="button"
            onClick={() => goToLogin('registro')}
            className="btn btn-primary w-full py-3"
          >
            Crear cuenta
          </button>
          <button
            type="button"
            onClick={() => goToLogin('ingreso')}
            className="btn btn-secondary w-full py-3"
          >
            Ya tengo cuenta
          </button>
          <button
            type="button"
            onClick={() => void continueAsGuest()}
            className="btn btn-ghost w-full py-3"
          >
            Seguir sin cuenta
          </button>
        </div>
      </div>
    </Dialog>
  );
}
