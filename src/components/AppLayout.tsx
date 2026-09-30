import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  Compass,
  Film,
  LayoutGrid,
  Search,
  Shuffle,
  User,
  Users,
} from 'lucide-react';
import { SearchModal } from '@/components/SearchModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DemoBanner } from '@/components/DemoBanner';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SyncIssueBanner } from '@/components/SyncIssueBanner';
import { SyncManager } from '@/components/SyncManager';
import { DeepLinkedTitle } from '@/components/DeepLinkedTitle';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundRefresh } from '@/hooks/useBackgroundRefresh';
import { usePushSnapshot } from '@/hooks/usePushSnapshot';
import { useCalendarFeedSync } from '@/hooks/useCalendarFeed';
import { useAutoPublishProfile } from '@/hooks/usePublicProfile';
import { ListAutoPublishers } from '@/hooks/usePublicList';
import { useSocialSync } from '@/hooks/useSocial';
import { useActivityPublisher } from '@/hooks/useActivityPublisher';
import { useInbox } from '@/hooks/useInbox';
import { buildDemoSocial } from '@/lib/demoSocial';
import { cn } from '@/lib/utils';

// El Picker va al medio a propósito: es el botón destacado de la barra
// inferior, y un destacado descentrado deja la barra despareja. El perfil no
// está acá — vive en el avatar del header, que es donde se lo busca.
const NAV_ITEMS = [
  { to: '/explorar', label: 'Explorar', Icon: Compass, end: false },
  { to: '/picker', label: 'Picker', Icon: Shuffle, end: false },
  { to: '/', label: 'Mis Listas', Icon: LayoutGrid, end: true },
] as const;

/**
 * Lo que solo entra en la barra de arriba.
 *
 * El calendario no va en la barra inferior: con cuatro, el Picker deja de
 * estar al medio y la barra queda despareja, y con cinco los blancos se
 * achican por debajo de lo que un pulgar acierta. En el teléfono se llega
 * desde el ícono del header, al lado del buscador: siempre a mano, sin
 * robarle lugar a las pestañas que se usan todos los días.
 */
const DESKTOP_ONLY_ITEMS = [
  { to: '/calendario', label: 'Calendario', Icon: CalendarDays, end: false },
  { to: '/social', label: 'Social', Icon: Users, end: false },
] as const;

/** El número de notificaciones sin ver, al lado de la entrada a Social. */
function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        'min-w-4 h-4 px-1 rounded-full bg-accent text-accent-contrast text-[10px] font-bold flex items-center justify-center',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

/**
 * Marco común de la app: header, navegación y el modal de búsqueda global.
 *
 * La navegación se dibuja dos veces, y a propósito: barra inferior en el
 * teléfono, donde el pulgar llega abajo, y barra superior en escritorio, donde
 * una barra fija abajo tapa contenido y delata una app pensada solo para móvil.
 * Solo una de las dos está en el árbol de accesibilidad a la vez —la otra queda
 * en `display: none`—, así que ni el lector de pantalla ni el tabulador ven
 * enlaces duplicados.
 */
export function AppLayout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { authState, user } = useAuth();
  // En el marco y no en una vista: tiene que correr entres por donde entres.
  useBackgroundRefresh();
  usePushSnapshot();
  useCalendarFeedSync();
  useAutoPublishProfile();
  useSocialSync(buildDemoSocial);
  useActivityPublisher();
  const { unread } = useInbox();

  // Desde el buscador se puede terminar en otra página —el reparto de una
  // ficha abierta desde ahí lleva a la de esa persona—, y el buscador no
  // tiene que quedar abierto encima de la página nueva.
  const { pathname } = useLocation();
  useEffect(() => {
    setIsSearchOpen(false);
  }, [pathname]);

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
    <div className="min-h-[100dvh] bg-bg-main text-text-main font-sans selection:bg-accent/30 flex flex-col">
      <SyncManager />
      <ListAutoPublishers />

      {/* Primer elemento tabulable de la página: deja saltar el header y la
          navegación de una, que es lo que necesita quien usa teclado. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:bg-bg-card focus:text-text-main focus:border focus:border-border-card focus:rounded-control focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 bg-bg-main/80 backdrop-blur-md border-b border-border-card">
        {/* Mismo ancho y mismo margen lateral que las vistas, para que el logo
            caiga en la misma vertical que el título de la página. */}
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Film size={20} className="text-accent-contrast" aria-hidden="true" />
            </div>
            {/* Debajo de 400 px el nombre no entra con los íconos: queda el logo. */}
            <span className="font-serif italic font-bold text-xl tracking-tight hidden min-[400px]:inline">
              Qué Miro?
            </span>
          </div>

          <nav aria-label="Navegación principal" className="hidden md:block">
            <ul className="flex items-center">
              {[...NAV_ITEMS, ...DESKTOP_ONLY_ITEMS].map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        // La marca de "acá estás" es un subrayado pegado al
                        // borde del header, no un color: el color solo no
                        // alcanza para quien no lo distingue.
                        'relative flex h-16 items-center px-3 text-sm font-medium transition-colors',
                        'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full',
                        isActive
                          ? 'text-text-main after:bg-accent'
                          : 'text-text-muted hover:text-text-main after:bg-transparent',
                      )
                    }
                  >
                    {label}
                    {to === '/social' && (
                      <>
                        <UnreadBadge count={unread} className="ml-1.5" />
                        {unread > 0 && <span className="sr-only">, {unread} notificaciones sin ver</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="btn btn-secondary hidden sm:flex px-3 py-2 text-text-subtle hover:text-text-main"
            >
              <Search size={16} aria-hidden="true" />
              <span className="text-sm font-normal">Buscar...</span>
              <kbd className="hidden lg:inline-flex items-center gap-1 bg-bg-main px-1.5 py-0.5 rounded border border-border-card text-[10px] font-medium uppercase ml-3">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>

            <button
              onClick={() => setIsSearchOpen(true)}
              aria-label="Buscar títulos"
              className="btn-icon w-10 h-10 sm:hidden rounded-full text-text-main hover:bg-border-card"
            >
              <Search size={22} aria-hidden="true" />
            </button>

            {/* La entrada al calendario en el teléfono (ver DESKTOP_ONLY_ITEMS).
                Desde `md` está en la barra de arriba, así que acá se esconde:
                dos enlaces al mismo lugar confunden al lector de pantalla. */}
            <NavLink
              to="/calendario"
              aria-label="Calendario"
              title="Calendario"
              className={({ isActive }) =>
                cn(
                  'btn-icon w-10 h-10 md:hidden rounded-full hover:bg-border-card',
                  isActive ? 'text-accent' : 'text-text-main',
                )
              }
            >
              <CalendarDays size={21} aria-hidden="true" />
            </NavLink>

            {/* Social en el teléfono: como el calendario, en el header y no en
                la barra de abajo, que tiene tres a propósito. */}
            <NavLink
              to="/social"
              aria-label={unread > 0 ? `Social, ${unread} notificaciones sin ver` : 'Social'}
              title="Social"
              className={({ isActive }) =>
                cn(
                  'relative btn-icon w-10 h-10 md:hidden rounded-full hover:bg-border-card',
                  isActive ? 'text-accent' : 'text-text-main',
                )
              }
            >
              <Users size={21} aria-hidden="true" />
              <UnreadBadge count={unread} className="absolute top-1 right-1" />
            </NavLink>

            {/* En el teléfono no entra junto a Social: el tema se cambia en
                Ajustes, y el header queda con lo que se usa todos los días. */}
            <ThemeToggle className="hidden sm:flex" />

            {authState !== 'authenticated' && (
              <span className="hidden sm:flex items-center justify-center bg-border-card rounded-full px-3 py-1 text-xs font-medium text-text-muted">
                {authState === 'demo' ? 'Demo' : 'Modo Invitado'}
              </span>
            )}

            {/* La foto de perfil *es* la entrada al perfil: sacamos ese destino
                de la navegación —donde quedaba de más y dejaba la barra
                despareja— y lo pusimos donde la gente ya lo busca. El anillo
                marca que se está en esa sección, igual que el subrayado marca
                las otras. */}
            <NavLink
              to="/perfil"
              aria-label="Perfil"
              title="Perfil"
              className={({ isActive }) =>
                cn(
                  'w-8 h-8 rounded-full bg-border-card border flex items-center justify-center overflow-hidden shrink-0 transition-[box-shadow,border-color]',
                  isActive
                    ? 'border-accent ring-2 ring-accent'
                    : 'border-border-card hover:border-text-subtle',
                )
              }
            >
              {authState === 'authenticated' && user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : authState === 'authenticated' ? (
                <span className="text-xs font-bold uppercase">
                  {user?.email?.[0] || 'U'}
                </span>
              ) : (
                <User size={18} className="text-text-muted" aria-hidden="true" />
              )}
            </NavLink>
          </div>
        </div>
      </header>

      <OfflineBanner />

      <SyncIssueBanner />

      <DemoBanner />

      {/* El hueco de abajo lo reserva el marco, que es quien sabe si hay barra
          inferior; las vistas no tienen por qué enterarse. */}
      <main id="contenido" className="flex-1 overflow-x-hidden pb-28 md:pb-16">
        <Outlet />
      </main>

      <nav
        aria-label="Navegación principal"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-main/90 backdrop-blur-lg border-t border-border-card pb-safe h-20"
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
                      'flex flex-col items-center gap-1 p-2 transition-colors rounded-control',
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
                            'w-14 h-14 rounded-full flex items-center justify-center shadow-pop',
                            'transition-[background-color,color,transform] duration-200 group-active:scale-95',
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

      <DeepLinkedTitle />
    </div>
  );
}
