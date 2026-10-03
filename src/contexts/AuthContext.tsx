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
import { retireDemo } from '@/lib/retiredDemo';
import { useMediaStore } from '@/store';
import { saveRescue } from '@/lib/rescue';
import { releasePushDevice } from '@/lib/pushDevice';

type AuthState =
  | 'loading'
  | 'authenticated'
  /**
   * Sin cuenta: la biblioteca vive en este dispositivo. Es como se entra a la
   * app; iniciar sesión es algo que se hace después, para sincronizar.
   */
  | 'guest';

interface AuthContextType {
  user: User | null;
  authState: AuthState;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Saca del dispositivo la biblioteca de una cuenta que se quedó sin sesión.
 *
 * Sin sesión se sigue usando la app, así que lo que hubiera en pantalla queda
 * a la vista de quien agarre el dispositivo. En Firestore sigue intacta...
 * salvo que nunca haya llegado: si el servidor todavía no confirmó esta
 * biblioteca, se guarda una copia de rescate antes de vaciar, porque si no,
 * salir borraría la única que existe.
 */
function clearAccountLibrary() {
  const { mediaList, collections, ownerUid, syncedUid, reset } =
    useMediaStore.getState();
  if (syncedUid !== ownerUid) {
    saveRescue(mediaList, collections);
  }
  reset();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    // Antes que nada: si alguien venía del demo, que vuelva a lo suyo antes de
    // que la sincronización mire qué hay en el dispositivo.
    retireDemo();

    if (!isFirebaseConfigured) {
      // Sin Firebase la app sigue siendo usable: todo queda en localStorage.
      console.warn('Firebase no está configurado. Activando modo invitado.');
      setAuthState('guest');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthState('authenticated');
        return;
      }
      // La sesión se fue sin pasar por "Salir": venció, o se cerró en otra
      // pestaña. Lo que es de una cuenta no se queda a la vista del invitado.
      if (useMediaStore.getState().ownerUid) clearAccountLibrary();
      setAuthState('guest');
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

    const logout = async () => {
      if (isFirebaseConfigured) {
        // Antes de salir, que sin sesión las reglas ya no dejan tocar la
        // cuenta: este dispositivo deja de recibir sus avisos.
        await releasePushDevice();
        await signOut(auth);
      }
      clearAccountLibrary();
      setUser(null);
      // Salir de la cuenta no saca de la app: se sigue usando sin cuenta, con
      // la biblioteca vacía, como quien llega por primera vez.
      setAuthState('guest');
    };

    return {
      user,
      authState,
      signInWithGoogle,
      signInWithEmail,
      registerWithEmail,
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
