import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';

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
      console.warn("Firebase no está configurado. Activando modo invitado por defecto.");
      setAuthState('guest');
      return;
    }

    const isGuest = localStorage.getItem('que-miro-guest') === 'true';
    
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

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured) {
      console.error('Firebase no está configurado');
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google', error);
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
    } catch (error) {
      console.error('Error signing out', error);
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
