import { Link } from 'react-router-dom';
import { Film, LucideIcon } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';

/**
 * El marco de las páginas que se ven sin sesión: un perfil público o una
 * lista compartida. Sin la navegación de la app, con su llamada a probarla y
 * con el conmutador de tema, para que quien llega desde un link no quede
 * atado al tema de quien lo mandó.
 */
export function PublicFrame({ children }: { children: React.ReactNode }) {
  const { authState } = useAuth();
  // Quien ya usa la app no necesita que se la vendan: vuelve a la suya.
  const hasLibrary = authState !== 'unauthenticated' && authState !== 'loading';

  return (
    <div className="min-h-[100dvh] bg-bg-main text-text-main flex flex-col">
      <header className="border-b border-border-card">
        {/* Mismo ancho que el contenido: el logo cae en la vertical del título. */}
        <div className="w-full max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Film size={20} className="text-accent-contrast" aria-hidden="true" />
            </span>
            <span className="font-serif italic font-bold text-xl">Qué Miro?</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/" className="btn btn-primary px-4 py-2 text-sm">
              {hasLibrary ? 'Mi biblioteca' : 'Armá la tuya'}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10">{children}</main>

      <footer className="border-t border-border-card px-4 py-6 text-center text-sm text-text-subtle flex flex-col gap-2">
        <p>
          Hecho con{' '}
          <Link to="/" className="text-accent hover:underline">
            Qué Miro?
          </Link>
        </p>
        {/* Quien llega por un link no ve nunca los Ajustes, que es donde vive
            el resto de la atribución: los pósters de acá también son de TMDB. */}
        <p className="text-xs">
          Datos de películas y series de{' '}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-text-main"
          >
            TMDB
          </a>
          . Este producto usa la API de TMDB pero no está avalado ni certificado
          por TMDB.
        </p>
      </footer>
    </div>
  );
}

/** Cargando: la forma de la página, sin contenido. */
export function PublicLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={label}>
      <div className="h-10 w-2/3 bg-border-card rounded-control animate-pulse" />
      <div className="h-24 bg-border-card rounded-surface animate-pulse" />
      <div className="h-40 bg-border-card rounded-surface animate-pulse" />
    </div>
  );
}

/** No existe o no se pudo leer: la página propia, no el login. */
export function PublicMissing({
  Icon,
  title,
  text,
}: {
  Icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-20">
      <Icon className="text-border-card w-14 h-14" aria-hidden="true" />
      <h1 className="text-display">{title}</h1>
      <p className="text-text-muted max-w-sm">{text}</p>
      <Link
        to="/"
        className="mt-2 px-5 py-2.5 rounded-control border border-border-card text-sm font-medium hover:bg-border-card transition-colors"
      >
        Ir a Qué Miro?
      </Link>
    </div>
  );
}
