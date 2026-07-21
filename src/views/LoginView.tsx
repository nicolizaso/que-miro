import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Film } from 'lucide-react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';

export function LoginView() {
  const { signInWithGoogle, continueAsGuest } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      setError('Firebase no está configurado. Por favor, continúa como invitado.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-main flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(230,57,70,0.3)]">
          <Film size={32} className="text-bg-main" />
        </div>
        
        <h1 className="font-serif italic font-bold text-4xl mb-2 text-center">Qué Miro?</h1>
        <p className="text-text-main/50 text-center mb-8">Tu biblioteca personal de películas y series.</p>

        <div className="w-full bg-bg-card border border-border-card rounded-3xl p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 className="text-xl font-bold mb-2">{isLogin ? 'Iniciar Sesión' : 'Registrarse'}</h2>
            
            {error && (
              <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-main/70 ml-1">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-bg-main border border-border-card rounded-xl px-4 py-3 focus:outline-none focus:border-accent transition-colors"
                placeholder="tu@email.com"
              />
            </div>

            <div className="flex flex-col gap-1 mb-2">
              <label className="text-xs font-medium text-text-main/70 ml-1">Contraseña</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-bg-main border border-border-card rounded-xl px-4 py-3 focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-accent text-white font-medium py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Cargando...' : (isLogin ? 'Ingresar' : 'Crear Cuenta')}
            </button>
            
            <button 
              type="button" 
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-sm text-text-main/50 hover:text-text-main underline underline-offset-4 mb-2"
            >
              {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-border-card"></div>
              <span className="flex-shrink-0 mx-4 text-text-main/40 text-xs">O</span>
              <div className="flex-grow border-t border-border-card"></div>
            </div>

            <button 
              type="button"
              onClick={signInWithGoogle}
              className="w-full bg-white text-black font-medium py-3 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar con Google
            </button>

            <button 
              type="button"
              onClick={continueAsGuest}
              className="w-full border border-border-card text-text-main/70 font-medium py-3 rounded-xl hover:bg-border-card transition-colors mt-2"
            >
              Continuar como Invitado
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
