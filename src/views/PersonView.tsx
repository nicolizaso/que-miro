import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Film, RotateCw, Tv, User, UserX } from 'lucide-react';
import { useMediaStore } from '@/store';
import { usePersonPage } from '@/hooks/usePersonPage';
import { TitleDetailModal } from '@/components/TitleDetailModal';
import {
  FilmographyItem,
  LibraryMark,
  MARK_LABELS,
  MIN_VOTES,
  PersonRole,
  buildFilmography,
  creditLine,
  departmentLabel,
  filterByRole,
  lifeFacts,
  personSummary,
  rolesIn,
} from '@/lib/person';
import { toDayKey } from '@/lib/dates';
import { TMDB_IMAGE_BASE_URL } from '@/lib/tmdb';
import { cn } from '@/lib/utils';

/** Cuántos títulos se dibujan de entrada: hay filmografías de doscientos. */
const PAGE_SIZE = 30;

/** Desde qué largo la biografía arranca recortada, con "Leer más". */
const LONG_BIOGRAPHY = 420;

const ROLE_LABELS: Record<PersonRole, string> = {
  reparto: 'Reparto',
  direccion: 'Dirección',
};

/**
 * El color de cada marca. Los tres estados de siempre con su color de siempre;
 * lo archivado, apagado. Sobre la tarjeta y no sobre el póster: la etiqueta se
 * tiene que leer arriba de cualquier imagen.
 */
const MARK_STYLES: Record<LibraryMark, string> = {
  visto: 'text-status-completada',
  viendo: 'text-status-viendo',
  por_ver: 'text-status-por-ver',
  en_pausa: 'text-text-muted',
  abandonado: 'text-text-muted',
};

type Opened = Pick<FilmographyItem, 'id' | 'mediaType'>;

/** Un título de la filmografía: el póster, cómo está en tu biblioteca y qué hizo ahí. */
function FilmographyCard({ item, onOpen }: { item: FilmographyItem; onOpen: (item: Opened) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(item)} className="group block w-full text-left">
        <span
          className={cn(
            'relative block aspect-[2/3] w-full rounded-control overflow-hidden bg-border-card',
            'shadow-card transition-[transform,box-shadow] duration-200',
            'group-hover:-translate-y-1 group-hover:shadow-lift',
          )}
        >
          {item.posterPath ? (
            <img
              src={`${TMDB_IMAGE_BASE_URL}${item.posterPath}`}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-text-subtle">
              {item.mediaType === 'movie' ? (
                <Film size={28} aria-hidden="true" />
              ) : (
                <Tv size={28} aria-hidden="true" />
              )}
            </span>
          )}
          <span className="absolute inset-0 rounded-control ring-1 ring-inset ring-text-main/10" />
          {item.mark && (
            <span
              className={cn(
                'absolute top-2 left-2 px-2 py-0.5 rounded-full bg-bg-card text-[11px] font-semibold shadow-card',
                MARK_STYLES[item.mark],
              )}
            >
              {MARK_LABELS[item.mark]}
            </span>
          )}
        </span>
        <span className="block text-sm font-medium mt-3 line-clamp-2 leading-tight min-h-[2.5em]">
          {item.title}
        </span>
        <span className="block text-xs text-text-subtle mt-0.5 truncate">
          {creditLine(item)}
        </span>
      </button>
    </li>
  );
}

/** La biografía, recortada si es larga. Sin biografía, nada. */
function Biography({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_BIOGRAPHY;

  return (
    <div className="flex flex-col gap-2 max-w-3xl">
      <p
        id="biografia"
        className={cn(
          'text-sm text-text-muted leading-relaxed whitespace-pre-line',
          isLong && !expanded && 'line-clamp-5',
        )}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="biografia"
          onClick={() => setExpanded((current) => !current)}
          className="self-start text-sm font-medium text-text-main underline underline-offset-4 hover:text-accent"
        >
          {expanded ? 'Leer menos' : 'Leer más'}
        </button>
      )}
    </div>
  );
}

function PersonLoading() {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 pt-10 flex flex-col gap-8" role="status" aria-label="Cargando">
      <div className="flex items-center gap-5">
        <div className="w-28 h-28 rounded-full bg-border-card animate-pulse shrink-0" />
        <div className="flex-1 flex flex-col gap-3">
          <div className="h-3 w-24 rounded bg-border-card animate-pulse" />
          <div className="h-9 w-2/3 rounded bg-border-card animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="aspect-[2/3] rounded-control bg-border-card animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/**
 * La página de una persona: quién es, qué hizo y qué de eso viste.
 *
 * Los datos son de TMDB y son iguales para todos; lo que la hace tuya es el
 * cruce con la biblioteca, que se arma acá (`lib/person.ts`) y no en el
 * servidor. Se llega desde el reparto de la ficha, desde las filas de
 * Explorar que hablan de alguien y desde "Contanos de vos".
 */
function PersonPageView({ personId }: { personId: number }) {
  const { page, isLoading, error, retry } = usePersonPage(personId);
  const mediaList = useMediaStore((state) => state.mediaList);
  const [role, setRole] = useState<PersonRole | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [opened, setOpened] = useState<Opened | null>(null);

  const items = useMemo(() => buildFilmography(page?.credits ?? [], mediaList), [page, mediaList]);
  const summary = useMemo(() => personSummary(items, { today: toDayKey(new Date()) }), [items]);
  const roles = rolesIn(items);
  const shown = filterByRole(items, role);

  if (isLoading) return <PersonLoading />;

  if (!page) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-20 px-4 max-w-md mx-auto">
        <UserX className="text-border-card w-14 h-14" aria-hidden="true" />
        <h1 className="text-display">{error ? 'No pudimos cargar esta página' : 'Esta persona no existe'}</h1>
        <p className="text-text-muted">
          {error || 'El link puede estar mal escrito.'}
        </p>
        {error ? (
          <button type="button" onClick={retry} className="btn btn-secondary px-4 py-2.5 text-sm">
            <RotateCw size={16} aria-hidden="true" /> Reintentar
          </button>
        ) : (
          <Link to="/explorar" className="btn btn-secondary px-4 py-2.5 text-sm">
            Ir a Explorar
          </Link>
        )}
      </div>
    );
  }

  const { person } = page;
  const department = departmentLabel(person.known_for_department);
  const facts = lifeFacts(person, toDayKey(new Date()));
  const openedMedia = opened
    ? mediaList.find((media) => media.tmdbId === opened.id && media.mediaType === opened.mediaType)
    : undefined;
  const missing = summary.missingTopRated;

  const chooseRole = (next: PersonRole | null) => {
    setRole(next);
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pt-10 flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <span className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-border-card shrink-0 flex items-center justify-center text-text-subtle ring-1 ring-inset ring-text-main/10">
            {person.profile_path ? (
              <img
                src={`${TMDB_IMAGE_BASE_URL}${person.profile_path}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <User size={40} aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            {department && <p className="text-eyebrow text-accent mb-1">{department}</p>}
            <h1 className="text-display">{person.name}</h1>
            {facts && <p className="text-sm text-text-muted mt-2">{facts}</p>}
          </div>
        </div>
        {person.biography && <Biography text={person.biography} />}
      </header>

      {summary.total > 0 && (
        <section aria-labelledby="en-tu-biblioteca" className="surface p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="en-tu-biblioteca" className="text-eyebrow">
              En tu biblioteca
            </h2>
            <p className="font-serif italic font-bold text-3xl text-accent leading-tight">
              Viste {summary.seen} de {summary.total}
            </p>
            <div className="h-1.5 rounded-full bg-border-card overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round((summary.seen / summary.total) * 100)}%` }}
              />
            </div>
          </div>

          {missing.length > 0 && (
            <div className="flex flex-col gap-3">
              <div>
                <h3 id="te-faltan" className="text-section">
                  {missing.length === 1 ? 'Te falta esta bien puntuada' : `Te faltan estas ${missing.length} bien puntuadas`}
                </h3>
                <p className="text-xs text-text-subtle mt-0.5">
                  Según el puntaje de TMDB, entre las que tienen al menos {MIN_VOTES} votos.
                </p>
              </div>
              <ul aria-labelledby="te-faltan" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-3 gap-y-5">
                {missing.map((item) => (
                  <FilmographyCard key={`${item.mediaType}-${item.id}`} item={item} onOpen={setOpened} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {items.length > 0 && (
        <section aria-labelledby="filmografia" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="filmografia" className="text-section">
              Filmografía <span className="text-text-subtle font-normal">· {shown.length}</span>
            </h2>
            {/* El filtro, solo si hay entre qué elegir: con un solo papel sería
                un botón que no cambia nada. */}
            {roles.length > 1 && (
              <div
                role="group"
                aria-label="Filtrar por papel"
                className="flex bg-bg-card p-1 rounded-control border border-border-card"
              >
                {[null, ...roles].map((value) => (
                  <button
                    key={value ?? 'todo'}
                    type="button"
                    aria-pressed={role === value}
                    onClick={() => chooseRole(value)}
                    className={cn(
                      'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                      role === value ? 'bg-border-card text-text-main' : 'text-text-muted hover:text-text-main',
                    )}
                  >
                    {value ? ROLE_LABELS[value] : 'Todo'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-3 gap-y-6">
            {shown.slice(0, visible).map((item) => (
              <FilmographyCard key={`${item.mediaType}-${item.id}`} item={item} onOpen={setOpened} />
            ))}
          </ul>

          {shown.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((current) => current + PAGE_SIZE)}
              className="btn btn-secondary self-center px-5 py-2.5 text-sm"
            >
              Mostrar más ({shown.length - visible})
            </button>
          )}
        </section>
      )}

      {opened && (
        <TitleDetailModal
          id={opened.id}
          mediaType={opened.mediaType}
          media={openedMedia}
          isOpen
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}

export function PersonView() {
  const { id } = useParams<{ id: string }>();
  const personId = Number(id);

  // Se llega desde abajo de otra página —una fila de Explorar, el reparto de
  // una ficha abierta a mitad de la filmografía—, y el navegador conserva el
  // scroll de donde se venía: sin esto, la página nueva abriría por la mitad.
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }, [personId]);

  // Con `key`: de una persona se pasa a otra desde el reparto de una ficha, y
  // la página nueva tiene que arrancar de cero —sin el filtro ni la ficha
  // abierta de la anterior—.
  return <PersonPageView key={personId} personId={personId} />;
}
