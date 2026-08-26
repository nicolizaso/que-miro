import { useMemo } from 'react';
import { useMediaStore } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeRadioGroup } from '@/components/ThemeToggle';
import { DataSettings } from '@/components/DataSettings';
import { CollectionsSettings } from '@/components/CollectionsSettings';
import { StatsDashboard } from '@/components/StatsDashboard';
import { PublicProfileSettings } from '@/components/PublicProfileSettings';
import { REGIONS, RegionCode, usePreferences } from '@/preferences';
import { formatWatchDate } from '@/lib/dates';
import { allWatches } from '@/lib/stats';
import { LogIn, LogOut, Repeat, Star } from 'lucide-react';

/** Tarjeta de la sesión actual: cuenta, invitado o demo. */
function SessionCard() {
  const { user, authState, logout, exitGuestMode } = useAuth();

  // En demo no se muestra nada: el banner de arriba ya avisa y ya ofrece la
  // salida. Dos carteles diciendo lo mismo en la misma pantalla es ruido.
  if (authState === 'demo') return null;

  if (authState === 'guest') {
    return (
      <div className="bg-accent/10 border border-accent rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-bold text-accent mb-1">
            ¡Sincronizá tus dispositivos!
          </h3>
          <p className="text-sm text-text-muted">
            Iniciá sesión o registrate para sincronizar tu biblioteca entre el
            celular y la compu.
          </p>
        </div>
        <button
          // `exitGuestMode` y no `logout`: conserva los títulos guardados sin
          // cuenta para poder migrarlos cuando la persona inicie sesión.
          onClick={exitGuestMode}
          className="flex items-center gap-2 bg-accent text-accent-contrast px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <LogIn size={16} aria-hidden="true" /> Ingresar
        </button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="bg-bg-card border border-border-card rounded-2xl p-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-text-main mb-1 truncate">
          {user.displayName || 'Mi Cuenta'}
        </h3>
        <p className="text-sm text-text-muted truncate">
          Conectado como {user.email}
        </p>
      </div>
      <button
        onClick={() => logout()}
        className="flex items-center gap-2 border border-border-card text-text-muted px-4 py-2 rounded-xl text-sm font-medium hover:bg-border-card hover:text-text-main transition-colors whitespace-nowrap"
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
        <h3 className="font-bold text-lg">Ajustes</h3>
        <p className="text-sm text-text-muted">
          Valen para este dispositivo; no se sincronizan.
        </p>
      </div>

      <div className="bg-bg-card border border-border-card rounded-2xl p-4 flex flex-col gap-5">
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
            className="bg-bg-main border border-border-card rounded-xl px-4 py-3 text-text-main focus:outline-none focus:border-accent transition-colors"
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

export function ProfileView() {
  const { mediaList } = useMediaStore();

  // El mismo selector que alimenta el panel de estadísticas: el historial
  // aplanado, de lo más reciente a lo más viejo.
  const watches = useMemo(() => allWatches(mediaList), [mediaList]);

  return (
    <div className="flex flex-col gap-10 w-full max-w-5xl mx-auto px-4 pt-10 pb-28">
      <SessionCard />

      <StatsDashboard />

      <AppSettings />

      <PublicProfileSettings />

      <CollectionsSettings />

      <DataSettings />

      <section className="flex flex-col gap-4">
        <h3 className="font-bold text-lg">Historial Reciente</h3>

        {watches.length === 0 ? (
          <div className="text-center text-text-muted py-10">
            Todavía no calificaste ningún título.
          </div>
        ) : (
          watches.map(({ media, entry }) => (
            <article
              key={entry.id}
              className="bg-bg-card border border-border-card rounded-2xl p-6 flex flex-col gap-4"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h4 className="font-serif italic font-bold text-xl">
                    {media.title}
                  </h4>
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
                <div className="flex items-center gap-1 bg-bg-main px-3 py-1 rounded-lg border border-border-card shrink-0">
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
                <div className="relative pt-4">
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 left-0 text-4xl text-accent font-serif opacity-30"
                  >
                    "
                  </span>
                  <p className="text-text-main/80 italic pl-4 text-sm leading-relaxed relative z-10">
                    {entry.text}
                  </p>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
