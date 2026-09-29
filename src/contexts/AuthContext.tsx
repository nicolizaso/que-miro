// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';
import { enterDemoMode, exitDemoMode } from '@/lib/demo';
import { useMediaStore } from '@/store';
import { saveRescue } from '@/lib/rescue';
import { releasePushDevice } from '@/lib/pushDevice';

type AuthState =
  | 'loading'
  | 'authenticated'
  | 'guest'
  /** Biblioteca de ejemplo, sin cuenta y sin escribir en Firestore. */
  | 'demo'
  | 'unauthenticated';

const GUEST_STORAGE_KEY = 'que-miro-guest';
const DEMO_STORAGE_KEY = 'que-miro-demo';

interface AuthContextType {
  user: User | null;
  authState: AuthState;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  continueAsGuest: () => void;
  /** Carga la biblioteca de ejemplo para poder recorrer la app sin registrarse. */
  startDemo: () => void;
  /** Sale del demo y devuelve la biblioteca que hubiera antes. */
  stopDemo: () => void;
  /** Sale del modo invitado para volver a la pantalla de login, sin borrar datos. */
  exitGuestMode: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // Sin Firebase la app sigue siendo usable: todo queda en localStorage.
      console.warn('Firebase no está configurado. Activando modo invitado.');
      setAuthState(
        localStorage.getItem(DEMO_STORAGE_KEY) === 'true' ? 'demo' : 'guest',
      );
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthState('authenticated');
        localStorage.removeItem(GUEST_STORAGE_KEY);
        localStorage.removeItem(DEMO_STORAGE_KEY);
        return;
      }
      // Se lee acá y no fuera del callback para no quedarse con un valor viejo
      // si el usuario entra y sale del modo invitado en la misma sesión.
      if (localStorage.getItem(DEMO_STORAGE_KEY) === 'true') {
        setAuthState('demo');
        return;
      }
      const isGuest = localStorage.getItem(GUEST_STORAGE_KEY) === 'true';
      setAuthState(isGuest ? 'guest' : 'unauthenticated');
    });

    return () => unsubscribe();
  }, []);

  const requireFirebase = () => {
    if (!isFirebaseConfigured) {
      throw new Error('Firebase no está configurado en esta instalación.');
    }
  };

  const value = useMemo<AuthContextType>(() => {
    const signInWithGoogle = async () => {
      requireFirebase();
      await signInWithPopup(auth, googleProvider);
    };

    const signInWithEmail = async (email: string, password: string) => {
      requireFirebase();
      await signInWithEmailAndPassword(auth, email, password);
    };

    const registerWithEmail = async (email: string, password: string) => {
      requireFirebase();
      await createUserWithEmailAndPassword(auth, email, password);
    };

    const continueAsGuest = () => {
      localStorage.setItem(GUEST_STORAGE_KEY, 'true');
      setAuthState('guest');
    };

    const startDemo = () => {
      enterDemoMode();
      localStorage.setItem(DEMO_STORAGE_KEY, 'true');
      localStorage.removeItem(GUEST_STORAGE_KEY);
      setAuthState('demo');
    };

    const stopDemo = () => {
      exitDemoMode();
      localStorage.removeItem(DEMO_STORAGE_KEY);
      setAuthState('unauthenticated');
    };

    const exitGuestMode = () => {
      // Los títulos guardados como invitado se conservan a propósito: si la
      // persona después inicia sesión, SyncManager los migra a su cuenta.
      localStorage.removeItem(GUEST_STORAGE_KEY);
      setAuthState('unauthenticated');
    };

    const logout = async () => {
      if (isFirebaseConfigured) {
        // Antes de salir, que sin sesión las reglas ya no dejan tocar la
        // cuenta: este dispositivo deja de recibir sus avisos.
        await releasePushDevice();
        await signOut(auth);
      }
      localStorage.removeItem(GUEST_STORAGE_KEY);
      localStorage.removeItem(DEMO_STORAGE_KEY);

      // Se limpia la biblioteca para que no quede visible en el dispositivo
      // después de cerrar sesión. En Firestore sigue intacta... salvo que
      // nunca haya llegado. Si el servidor todavía no confirmó esta
      // biblioteca, se guarda una copia de rescate antes de vaciar: si no,
      // salir borraría la única que existe.
      const { mediaList, collections, ownerUid, syncedUid, reset } =
        useMediaStore.getState();
      if (syncedUid !== ownerUid) {
        saveRescue(mediaList, collections);
      }
      reset();
      setUser(null);
      setAuthState('unauthenticated');
    };

    return {
      user,
      authState,
      signInWithGoogle,
      signInWithEmail,
      registerWithEmail,
      continueAsGuest,
      startDemo,
      stopDemo,
      exitGuestMode,
      logout,
    };
  }, [user, authState]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
