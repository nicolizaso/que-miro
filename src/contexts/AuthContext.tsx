// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';
import { useMediaStore } from '@/store';

type AuthState = 'loading' | 'authenticated' | 'guest' | 'unauthenticated';

interface AuthContextType {
  user: User | null;
  authState: AuthState;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    if (!isFirebaseConfigured) {
      console.warn("Firebase no está configurado. Activando modo invitado.");
      setAuthState('guest');
      return;
    }

    const isGuest = localStorage.getItem('que-miro-guest') === 'true';
    
    // Suscripción al observador de estado de autenticación
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthState('authenticated');
        localStorage.removeItem('que-miro-guest');
      } else if (isGuest) {
        setAuthState('guest');
      } else {
        setAuthState('unauthenticated');
      }
    });

    return () => unsubscribe();
  }, []);

  /**
   * Maneja el inicio de sesión vía Google OAuth con Popup
   */
  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured) {
      throw new Error('Firebase no está configurado correctamente.');
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      // Manejo controlado de dominios no autorizados u otros errores OAuth
      if (error?.code === 'auth/unauthorized-domain') {
        console.error(
          '[Auth Error]: Dominio no autorizado en Firebase Console. Verifica los Dominios Autorizados.',
          window.location.hostname
        );
      }
      throw error;
    }
  };

  const continueAsGuest = () => {
    localStorage.setItem('que-miro-guest', 'true');
    setAuthState('guest');
  };

  const logout = async () => {
    try {
      if (isFirebaseConfigured) {
        await signOut(auth);
      }
      setAuthState('unauthenticated');
      localStorage.removeItem('que-miro-guest');
      localStorage.removeItem('que-miro-storage');
      useMediaStore.getState().setMediaList([]);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, authState, signInWithGoogle, continueAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
