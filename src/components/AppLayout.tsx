import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Film, LayoutGrid, Search, Shuffle, User } from 'lucide-react';
import { SearchModal } from '@/components/SearchModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DemoBanner } from '@/components/DemoBanner';
import { SyncManager } from '@/components/SyncManager';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Mis Listas', Icon: LayoutGrid, end: true },
  { to: '/picker', label: 'Picker', Icon: Shuffle, end: false },
  { to: '/perfil', label: 'Perfil', Icon: User, end: false },
] as const;

/** Marco común de la app: header, navegación y el modal de búsqueda global. */
export function AppLayout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { authState, user } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // `ctrlKey` además de `metaKey`: en Windows y Linux el atajo es Ctrl+K.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-bg-main text-text-main font-sans selection:bg-accent/30 flex flex-col">
      <SyncManager />

      {/* Primer elemento tabulable de la página: deja saltar el header y la
          navegación de una, que es lo que necesita quien usa teclado. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:bg-bg-card focus:text-text-main focus:border focus:border-border-card focus:rounded-xl focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 bg-bg-main/80 backdrop-blur-md border-b border-border-card h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Film size={20} className="text-accent-contrast" aria-hidden="true" />
          </div>
          <h1 className="font-serif italic font-bold text-xl tracking-tight">
            Qué Miro?
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 bg-bg-card border border-border-card px-4 py-2 rounded-xl text-text-subtle hover:bg-border-card hover:text-text-main transition-colors"
          >
            <Search size={16} aria-hidden="true" />
            <span className="text-sm">Buscar...</span>
            <kbd className="hidden md:inline-flex items-center gap-1 bg-bg-main px-1.5 py-0.5 rounded border border-border-card text-[10px] font-medium uppercase ml-4">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          <button
            onClick={() => setIsSearchOpen(true)}
            aria-label="Buscar títulos"
            className="sm:hidden p-2 text-text-main hover:bg-border-card rounded-full"
          >
            <Search size={24} aria-hidden="true" />
          </button>

          <ThemeToggle />

          {authState === 'authenticated' ? (
            <div className="w-8 h-8 rounded-full bg-border-card border border-border-card flex items-center justify-center overflow-hidden shrink-0">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold uppercase">
                  {user?.email?.[0] || 'U'}
                </span>
              )}
            </div>
          ) : (
            <span className="hidden sm:flex items-center justify-center bg-border-card rounded-full px-3 py-1 text-xs font-medium text-text-muted">
              {authState === 'demo' ? 'Demo' : 'Modo Invitado'}
            </span>
          )}
        </div>
      </header>

      <DemoBanner />

      <main id="contenido" className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>

      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 left-0 right-0 z-40 bg-bg-main/90 backdrop-blur-lg border-t border-border-card pb-safe h-20 sm:h-24"
      >
        <ul className="max-w-lg mx-auto h-full flex items-center justify-around px-4">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => {
            // El Picker es el botón central destacado: mismo componente, otra
            // forma.
            const isCenter = to === '/picker';

            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 p-2 transition-colors rounded-xl',
                      isCenter && '-mt-6 group',
                      !isCenter &&
                        (isActive ? 'text-accent' : 'text-text-subtle hover:text-text-main'),
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isCenter ? (
                        <span
                          className={cn(
                            'w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg',
                            isActive
                              ? 'bg-accent text-accent-contrast scale-110'
                              : 'bg-bg-card border border-border-card text-text-main group-hover:scale-105',
                          )}
                        >
                          <Icon size={24} aria-hidden="true" />
                        </span>
                      ) : (
                        <Icon size={24} aria-hidden="true" />
                      )}
                      <span
                        className={cn(
                          'text-[10px] font-medium',
                          isCenter &&
                            (isActive ? 'text-accent' : 'text-text-subtle'),
                        )}
                      >
                        {label}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}
