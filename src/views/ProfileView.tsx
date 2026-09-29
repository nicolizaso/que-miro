import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeRadioGroup } from '@/components/ThemeToggle';
import { DataSettings } from '@/components/DataSettings';
import { CollectionsSettings } from '@/components/CollectionsSettings';
import { StatsDashboard } from '@/components/StatsDashboard';
import { GoalsPanel } from '@/components/GoalsPanel';
import { PublicProfileSettings } from '@/components/PublicProfileSettings';
import { AboutSettings } from '@/components/Attribution';
import { REGIONS, RegionCode, usePreferences } from '@/preferences';
import { formatWatchDate } from '@/lib/dates';
import { allWatches } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { LogIn, LogOut, Repeat, Star } from 'lucide-react';

/** Tarjeta de la sesión actual: cuenta, invitado o demo. */
function SessionCard() {
  const { user, authState, logout, exitGuestMode } = useAuth();

  // En demo no se muestra nada: el banner de arriba ya avisa y ya ofrece la
  // salida. Dos carteles diciendo lo mismo en la misma pantalla es ruido.
  if (authState === 'demo') return null;

  if (authState === 'guest') {
    return (
      <div className="bg-accent/10 border border-accent rounded-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-[16rem]">
          <h2 className="text-section text-accent mb-1">
            Sincronizá tus dispositivos
          </h2>
          <p className="text-sm text-text-muted">
            Iniciá sesión o registrate para sincronizar tu biblioteca entre el
            celular y la compu.
          </p>
        </div>
        <button
          // `exitGuestMode` y no `logout`: conserva los títulos guardados sin
          // cuenta para poder migrarlos cuando la persona inicie sesión.
          onClick={exitGuestMode}
          className="btn btn-primary px-4 py-2 text-sm"
        >
          <LogIn size={16} aria-hidden="true" /> Ingresar
        </button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="surface p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex-1 min-w-[14rem]">
        <h2 className="text-section truncate">
          {user.displayName || 'Mi cuenta'}
        </h2>
        <p className="text-sm text-text-muted truncate">
          Conectado como {user.email}
        </p>
      </div>
      <button
        onClick={() => logout()}
        className="btn btn-secondary bg-transparent px-4 py-2 text-sm text-text-muted hover:text-text-main"
      >
        <LogOut size={16} aria-hidden="true" /> Salir
      </button>
    </div>
  );
}

/** Preferencias del dispositivo: tema y región de las plataformas. */
function AppSettings() {
  const { region, setRegion } = usePreferences();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Preferencias</h2>
        <p className="text-sm text-text-muted">
          Valen para este dispositivo; no se sincronizan.
        </p>
      </div>

      <div className="surface p-4 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Tema</span>
          <ThemeRadioGroup />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="region" className="text-sm font-medium">
            País para las plataformas
          </label>
          <select
            id="region"
            value={region}
            onChange={(e) => setRegion(e.target.value as RegionCode)}
            className="bg-bg-main border border-border-control rounded-control pl-4 pr-9 py-3 text-text-main focus:outline-none focus:border-accent transition-colors"
          >
            {REGIONS.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-subtle">
            Define en qué servicios te decimos que está disponible cada título.
          </p>
        </div>
      </div>
    </section>
  );
}

const PROFILE_TABS = [
  { to: '.', label: 'Resumen', end: true },
  { to: 'gustos', label: 'Contanos de vos', end: false },
  { to: 'ajustes', label: 'Ajustes', end: false },
] as const;

/**
 * Marco del perfil.
 *
 * Antes esta pantalla era una sola columna de casi cuatro mil píxeles: la
 * sesión, las estadísticas, cuatro bloques de ajustes y el historial, todos
 * seguidos. Nadie baja hasta ahí, y el que baja pierde de vista dónde está.
 * Ahora son tres pestañas —lo que uno mira, lo que uno declara y lo que uno
 * configura— y cada una tiene su URL, así que "atrás" y "recargar" hacen lo
 * esperado.
 */
export function ProfileView() {
  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto px-4 pt-10">
      <div className="flex flex-col gap-5">
        <h1 className="text-display">Mi perfil</h1>

        {/* Enlaces, no botones: cada pestaña es una dirección de verdad. El rol
            de tablist se lo dejamos al patrón que sí lo es (los estados de la
            biblioteca), que no cambia de URL. */}
        <nav aria-label="Secciones del perfil">
          <ul className="flex items-center gap-1 border-b border-border-card">
            {PROFILE_TABS.map(({ to, label, end }) => (
              <li key={label}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center px-4 py-3 text-sm font-medium transition-colors',
                      'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full',
                      isActive
                        ? 'text-text-main after:bg-accent'
                        : 'text-text-muted hover:text-text-main after:bg-transparent',
                    )
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <Outlet />
    </div>
  );
}

/** Pestaña "Resumen": quién sos en la app y qué miraste. */
export function ProfileSummary() {
  const { mediaList } = useMediaStore();

  // El mismo selector que alimenta el panel de estadísticas: el historial
  // aplanado, de lo más reciente a lo más viejo.
  const watches = useMemo(() => allWatches(mediaList), [mediaList]);

  return (
    <div className="flex flex-col gap-10">
      <SessionCard />

      <GoalsPanel />

      <StatsDashboard />

      <section className="flex flex-col gap-4">
        <h2 className="text-section">Historial reciente</h2>

        {watches.length === 0 ? (
          <p className="text-center text-text-muted py-10">
            Todavía no calificaste ningún título.
          </p>
        ) : (
          /* Una sola superficie con separadores, no una tarjeta por reseña:
             seis cajas iguales apiladas no jerarquizan nada y hacen que la
             pantalla se lea como una lista de formularios. */
          <ul className="surface divide-y divide-border-card">
            {watches.map(({ media, entry }) => (
              <li key={entry.id}>
                <article className="p-5 flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{media.title}</h3>
                      <span className="text-xs text-text-subtle flex items-center gap-2">
                        {formatWatchDate(entry.completedAt)}
                        {(media.history?.length ?? 0) > 1 && (
                          <span className="flex items-center gap-1">
                            <Repeat size={11} aria-hidden="true" />
                            {media.history!.length} veces en total
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm shrink-0">
                      <span className="font-bold">{entry.rating}</span>
                      <Star
                        size={14}
                        className="fill-accent text-accent"
                        aria-hidden="true"
                      />
                      <span className="sr-only">de 5 estrellas</span>
                    </div>
                  </div>

                  {entry.tags && entry.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {entry.tags.map((tag) => (
                        <li
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-border-card text-[11px] text-text-muted"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}

                  {entry.text && (
                    <blockquote className="border-l-2 border-accent pl-4 text-sm leading-relaxed text-text-muted">
                      {entry.text}
                    </blockquote>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Pestaña "Ajustes": todo lo que se configura una vez y no se toca más. */
export function ProfileSettings() {
  return (
    <div className="flex flex-col gap-10">
      <AppSettings />

      <PublicProfileSettings />

      <CollectionsSettings />

      <DataSettings />

      {/* Al final, que es donde se busca: es lo que se consulta una vez, no lo
          que se toca seguido. */}
      <AboutSettings />
    </div>
  );
}
