import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/ui/Logo';
import { isFirebaseConfigured } from '@/lib/firebase';
import { getAuthErrorMessage } from '@/lib/authErrors';

export function LoginView() {
  const { signInWithGoogle, signInWithEmail, registerWithEmail } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<'form' | 'google' | null>(
    null,
  );

  const isBusy = pendingAction !== null;

  const handleGoogleSignIn = async () => {
    setError('');
    setPendingAction('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      setError(
        'Firebase no está configurado en esta instalación. Podés seguir usando la app sin cuenta.',
      );
      return;
    }
    if (!isLogin && password.length < 6) {
      setError('La contraseña tiene que tener al menos 6 caracteres.');
      return;
    }

    setError('');
    setPendingAction('form');
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg-main flex flex-col items-center justify-center px-4 pt-20 pb-8">
      {/* Se llega acá desde la app, así que la salida va arriba, donde se
          busca un "atrás": entrar a la cuenta es opcional. */}
      <Link
        to="/"
        className="absolute top-4 left-4 btn btn-ghost px-3 py-2 text-sm"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Seguir sin cuenta
      </Link>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm flex flex-col items-center">
        <Logo className="w-16 h-16 mb-6" />

        <h1 className="text-display mb-2 text-center">
          Qué Miro?
        </h1>
        <p className="text-text-muted text-center mb-8">
          Con una cuenta, tu biblioteca se sincroniza entre el celular y la
          compu.
        </p>

        <div className="w-full surface p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 className="text-section mb-2">
              {isLogin ? 'Iniciar sesión' : 'Registrarse'}
            </h2>

            {error && (
              <div
                role="alert"
                className="p-3 bg-accent/10 border border-accent/20 rounded-control text-accent text-sm"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label
                htmlFor="email"
                className="text-xs font-medium text-text-muted ml-1"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-bg-main border border-border-control rounded-control px-4 py-3 focus:outline-none focus:border-accent transition-colors"
                placeholder="tu@email.com"
              />
            </div>

            <div className="flex flex-col gap-1 mb-2">
              <label
                htmlFor="password"
                className="text-xs font-medium text-text-muted ml-1"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-bg-main border border-border-control rounded-control px-4 py-3 focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="btn btn-primary w-full py-3"
            >
              {pendingAction === 'form' && (
                <Loader2 size={16} className="animate-spin" />
              )}
              {isLogin ? 'Ingresar' : 'Crear cuenta'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-sm text-text-muted hover:text-text-main underline underline-offset-4 mb-2"
            >
              {isLogin
                ? '¿No tenés cuenta? Registrate'
                : '¿Ya tenés cuenta? Iniciá sesión'}
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-border-card"></div>
              <span className="flex-shrink-0 mx-4 text-text-subtle text-xs">
                O
              </span>
              <div className="flex-grow border-t border-border-card"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isBusy}
              className="w-full bg-white text-[#1f1f1f] border border-border-card font-medium py-3 rounded-control hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {pendingAction === 'google' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Continuar con Google
            </button>
          </form>
        </div>

        <p className="text-xs text-text-subtle text-center mt-6 max-w-xs">
          Lo que guardaste sin cuenta en este dispositivo pasa solo a tu
          cuenta cuando entrás.
        </p>
      </div>
    </div>
  );
}
