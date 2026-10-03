import { create } from 'zustand';
import type { MediaDraft } from '@/lib/pendingSave';

/**
 * El cartel de "guardalo con una cuenta" que abre `useMediaActions`.
 *
 * Es un store y no estado de un componente porque se guarda desde muchos
 * lados —la ficha, el buscador, los carruseles, una lista compartida— y el
 * cartel tiene que ser uno solo, montado arriba de todo.
 */
interface SignInPromptState {
  /** Lo que la persona quiso guardar, mientras el cartel está abierto. */
  draft: MediaDraft | null;
  open: (draft: MediaDraft) => void;
  close: () => void;
}

export const useSignInPrompt = create<SignInPromptState>()((set) => ({
  draft: null,
  open: (draft) => set({ draft }),
  close: () => set({ draft: null }),
}));
