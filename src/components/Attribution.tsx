import { cn } from '@/lib/utils';

/**
 * Las fuentes de los datos, con el aviso que TMDB pide.
 *
 * No es cortesía: TMDB revoca el acceso a la API si los datos se usan sin
 * atribuirlos, y los de plataformas —en qué servicio está cada título— no son
 * suyos sino de JustWatch, que también hay que nombrar.
 */

const TMDB_URL = 'https://www.themoviedb.org/';
const JUSTWATCH_URL = 'https://www.justwatch.com/';

/**
 * El crédito corto que va al lado de cualquier lista de plataformas.
 *
 * Discreto a propósito: acompaña al dato, no compite con él.
 */
export function JustWatchCredit({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-text-subtle', className)}>
      Datos de plataformas:{' '}
      <a
        href={JUSTWATCH_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-text-main transition-colors"
      >
        JustWatch
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
    </p>
  );
}

/**
 * La sección "Acerca de" de Ajustes: el logo de TMDB, su aviso y JustWatch.
 *
 * El logo va chico y al fondo de los ajustes: las pautas de TMDB piden que sea
 * menos prominente que la marca propia, que es la que encabeza cada pantalla.
 */
export function AboutSettings() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Acerca de</h2>
        <p className="text-sm text-text-muted">De dónde salen los datos.</p>
      </div>

      <div className="surface p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <a
          href={TMDB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 self-start sm:self-center rounded-sm"
        >
          {/* Alto fijo y ancho proporcional: el logo es un poco más ancho que
              alto, y así no se deforma en ninguna pantalla. */}
          <img
            src="/tmdb-logo.svg"
            alt="The Movie Database (TMDB). Se abre en otra pestaña."
            width={49}
            height={36}
            className="h-9 w-auto"
          />
        </a>

        <div className="flex flex-col gap-2 text-sm text-text-muted">
          <p>
            Las películas y las series —títulos, sinopsis, reparto y pósters—
            vienen de{' '}
            <a
              href={TMDB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-main underline underline-offset-2 hover:text-accent transition-colors"
            >
              TMDB
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
            .
          </p>
          <p>
            Este producto usa la API de TMDB pero no está avalado ni certificado
            por TMDB.
          </p>
          <p>
            Los datos de plataformas —en qué servicio está cada título— son de{' '}
            <a
              href={JUSTWATCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-main underline underline-offset-2 hover:text-accent transition-colors"
            >
              JustWatch
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
