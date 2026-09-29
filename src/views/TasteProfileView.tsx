import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Check,
  Clapperboard,
  Compass,
  Film,
  Tv,
  User,
  X,
} from 'lucide-react';
import { PickerSearch } from '@/components/taste/PickerSearch';
import { useTastePicks } from '@/hooks/useTastePicks';
import {
  MAX_GENRES,
  MAX_PEOPLE,
  MAX_STUDIOS,
  TOTAL_QUESTIONS,
  answeredCount,
  decadeLabel,
  decadeOptions,
} from '@/lib/picks';
import {
  TMDB_IMAGE_BASE_URL,
  genreOptions,
  searchCompanies,
  searchMulti,
  searchPeople,
} from '@/lib/tmdb';
import { cn } from '@/lib/utils';
import {
  MediaType,
  PickedPerson,
  PickedStudio,
  PickedTitle,
  TMDbCompany,
  TMDbPerson,
  TMDbResult,
} from '@/types';

/** Cuánto de lo que se contestó ya cambia Explorar. */
function Progress({ answered }: { answered: number }) {
  const percent = Math.round((answered / TOTAL_QUESTIONS) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-eyebrow">Tus respuestas</span>
        <span className="text-sm text-text-muted">
          {answered} de {TOTAL_QUESTIONS}
        </span>
      </div>
      {/* La barra es decorativa: el número de al lado ya dice lo mismo en texto,
          así que no hace falta anunciarla dos veces. */}
      <div
        aria-hidden="true"
        className="h-1.5 rounded-full bg-border-card overflow-hidden"
      >
        <div
          className="h-full bg-accent rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Una pregunta del cuestionario.
 *
 * El número y el tilde de contestada hacen el trabajo que en un formulario
 * largo hace la barra de progreso: decir cuánto falta sin obligar a contar.
 */
function Question({
  index,
  title,
  hint,
  answered,
  children,
}: {
  index: number;
  title: string;
  hint: string;
  answered: boolean;
  children: ReactNode;
}) {
  return (
    <li className="surface p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-semibold border transition-colors',
            answered
              ? 'bg-accent text-accent-contrast border-accent'
              : 'border-border-control text-text-subtle',
          )}
        >
          {answered ? <Check size={14} /> : index}
        </span>
        <div className="min-w-0">
          <h3 className="text-section">{title}</h3>
          <p className="text-sm text-text-muted">{hint}</p>
        </div>
      </div>

      {children}
    </li>
  );
}

/** Un botón que se prende y se apaga: un género, una década. */
function ToggleChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !selected}
      aria-pressed={selected}
      className={cn(
        'px-3 py-1.5 rounded-full border text-sm transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        selected
          ? 'bg-accent text-accent-contrast border-accent font-medium'
          : 'border-border-control text-text-muted hover:text-text-main hover:border-accent',
      )}
    >
      {label}
    </button>
  );
}

/** Una respuesta ya elegida, con su forma de sacarla. */
function AnswerChip({
  label,
  image,
  fallback,
  to,
  onRemove,
}: {
  label: string;
  image?: string | null;
  fallback: ReactNode;
  /** Adónde lleva la respuesta, si tiene página propia: la de una persona. */
  to?: string;
  onRemove: () => void;
}) {
  const content = (
    <>
      <span className="w-7 h-7 rounded-full overflow-hidden bg-border-card grid place-items-center text-text-subtle shrink-0">
        {image ? (
          <img
            src={`${TMDB_IMAGE_BASE_URL}${image}`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          fallback
        )}
      </span>
      <span className="text-sm font-medium min-w-0">{label}</span>
    </>
  );

  return (
    <li className="flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-full bg-bg-main border border-border-card">
      {to ? (
        <Link to={to} className="flex items-center gap-2 min-w-0 rounded-full hover:text-accent transition-colors">
          {content}
        </Link>
      ) : (
        content
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Sacar a ${label}`}
        className="btn-icon w-7 h-7 text-text-subtle hover:text-accent hover:bg-border-card"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  );
}

/** La película o la serie elegida, con su póster. */
function TitleAnswer({
  title,
  onRemove,
}: {
  title: PickedTitle;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-control bg-bg-main border border-border-card">
      <div className="w-12 h-[4.5rem] rounded-lg overflow-hidden bg-border-card grid place-items-center text-text-subtle shrink-0">
        {title.posterPath ? (
          <img
            src={`${TMDB_IMAGE_BASE_URL}${title.posterPath}`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : title.mediaType === 'movie' ? (
          <Film size={18} aria-hidden="true" />
        ) : (
          <Tv size={18} aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{title.title}</p>
        <p className="text-sm text-text-subtle">{title.releaseYear}</p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Cambiar ${title.title}`}
        className="btn-icon w-9 h-9 border border-border-card text-text-muted hover:text-accent"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Lo que se muestra de un resultado de título en la lista de búsqueda. */
function TitleResult({ result }: { result: TMDbResult }) {
  const name = result.title || result.name || '';
  const date = result.release_date || result.first_air_date || '';

  return (
    <>
      <span className="w-9 h-12 rounded overflow-hidden bg-border-card grid place-items-center text-text-subtle shrink-0">
        {result.poster_path ? (
          <img
            src={`${TMDB_IMAGE_BASE_URL}${result.poster_path}`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <Film size={14} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate">{name}</span>
        <span className="block text-xs text-text-subtle">
          {date ? date.split('-')[0] : 'Sin fecha'}
        </span>
      </span>
    </>
  );
}

/** Un resultado de persona: la cara y con qué se la reconoce. */
function PersonResult({ person }: { person: TMDbPerson }) {
  return (
    <>
      <span className="w-9 h-12 rounded overflow-hidden bg-border-card grid place-items-center text-text-subtle shrink-0">
        {person.profile_path ? (
          <img
            src={`${TMDB_IMAGE_BASE_URL}${person.profile_path}`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <User size={14} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate">{person.name}</span>
        <span className="block text-xs text-text-subtle truncate">
          {person.known_for?.join(', ') || 'Sin títulos conocidos'}
        </span>
      </span>
    </>
  );
}

/** Un resultado de productora. El logo va sobre blanco: muchos son negros. */
function StudioResult({ company }: { company: TMDbCompany }) {
  return (
    <>
      <span className="w-9 h-12 grid place-items-center shrink-0">
        {company.logo_path ? (
          <img
            src={`${TMDB_IMAGE_BASE_URL}${company.logo_path}`}
            alt=""
            loading="lazy"
            className="max-w-full max-h-8 object-contain bg-white rounded p-1"
          />
        ) : (
          <Building2 size={14} className="text-text-subtle" aria-hidden="true" />
        )}
      </span>
      <span className="text-sm font-medium truncate">{company.name}</span>
    </>
  );
}

/** Los resultados de búsqueda que son del tipo que pide la pregunta. */
function onlyOfType(results: TMDbResult[], mediaType: MediaType): TMDbResult[] {
  return results.filter((result) => result.media_type === mediaType);
}

/**
 * Las personas que trabajan de esto primero.
 *
 * TMDB no separa actores de directores en la búsqueda, y quien escribe
 * "Coppola" en la pregunta de dirección espera ver primero a quien dirige. No
 * se filtra, se ordena: hay gente que hace las dos cosas y esconderla sería
 * peor que ponerla segunda.
 */
function departmentFirst(
  people: TMDbPerson[],
  department: 'Acting' | 'Directing',
): TMDbPerson[] {
  return [...people].sort((a, b) => {
    const first = a.known_for_department === department ? 0 : 1;
    const second = b.known_for_department === department ? 0 : 1;
    return first - second;
  });
}

/** Un resultado de TMDB con la forma mínima que se guarda como respuesta. */
function toPickedTitle(result: TMDbResult, mediaType: MediaType): PickedTitle {
  const date = result.release_date || result.first_air_date || '';

  return {
    tmdbId: result.id,
    mediaType,
    title: result.title || result.name || '',
    posterPath: result.poster_path,
    releaseYear: date ? date.split('-')[0] : '',
  };
}

/**
 * "Contanos de vos": las siete preguntas que personalizan Explorar.
 *
 * La biblioteca ya dice mucho de alguien, pero tarda: hasta que no hay una
 * docena de títulos puntuados, Explorar no tiene con qué armar una fila
 * personal. Esto es el atajo — y además dice cosas que la biblioteca no sabe,
 * como cuál es *la* película, esa que se vio antes de instalar la app y que
 * nunca se va a anotar en "Por Ver".
 *
 * Se guarda respuesta por respuesta, sin botón de guardar: cada una es
 * independiente y con una sola ya aparecen filas nuevas.
 */
export function TasteProfileView() {
  const { picks, savePicks } = useTastePicks();
  const answered = answeredCount(picks);

  const toggleGenre = (name: string) => {
    const genres = picks.genres.includes(name)
      ? picks.genres.filter((genre) => genre !== name)
      : [...picks.genres, name].slice(0, MAX_GENRES);
    savePicks({ genres });
  };

  /** Suma a alguien a una de las dos listas de gente, sin repetir ni pasarse. */
  const addPerson = (key: 'actors' | 'directors', person: TMDbPerson) => {
    const current = picks[key];
    if (current.some((saved) => saved.id === person.id)) return;

    const next: PickedPerson[] = [
      ...current,
      { id: person.id, name: person.name, profilePath: person.profile_path },
    ].slice(0, MAX_PEOPLE);

    savePicks(key === 'actors' ? { actors: next } : { directors: next });
  };

  const removePerson = (key: 'actors' | 'directors', id: number) => {
    const next = picks[key].filter((person) => person.id !== id);
    savePicks(key === 'actors' ? { actors: next } : { directors: next });
  };

  const addStudio = (company: TMDbCompany) => {
    if (picks.studios.some((studio) => studio.id === company.id)) return;
    const next: PickedStudio = {
      id: company.id,
      name: company.name,
      logoPath: company.logo_path,
    };
    savePicks({ studios: [...picks.studios, next].slice(0, MAX_STUDIOS) });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="surface p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section">Contanos de vos</h2>
          <p className="text-sm text-text-muted max-w-prose">
            Siete preguntas para que Explorar deje de adivinar. Con una sola
            alcanza: cada respuesta suma filas nuevas —lo que se parece a tu
            película favorita, lo que hizo la gente que elegiste, el catálogo de
            tu productora— y se guarda sola.
          </p>
        </div>

        <Progress answered={answered} />

        {answered > 0 && (
          <Link
            to="/explorar"
            className="btn btn-secondary self-start px-4 py-2 text-sm"
          >
            <Compass size={16} aria-hidden="true" />
            Ver cómo quedó Explorar
          </Link>
        )}
      </section>

      <ol className="flex flex-col gap-4">
        <Question
          index={1}
          title="Tu película favorita"
          hint="Esa que recomendás sin pensarlo."
          answered={picks.movie !== undefined}
        >
          {picks.movie ? (
            <TitleAnswer
              title={picks.movie}
              onRemove={() => savePicks({ movie: undefined })}
            />
          ) : (
            <PickerSearch<TMDbResult>
              label="Buscar tu película favorita"
              placeholder="El Padrino, Parasite, Relatos Salvajes…"
              search={async (query) => onlyOfType(await searchMulti(query), 'movie')}
              itemKey={(result) => result.id}
              itemLabel={(result) => result.title ?? ''}
              renderItem={(result) => <TitleResult result={result} />}
              onSelect={(result) =>
                savePicks({ movie: toPickedTitle(result, 'movie') })
              }
            />
          )}
        </Question>

        <Question
          index={2}
          title="Tu serie favorita"
          hint="La que volverías a empezar mañana."
          answered={picks.series !== undefined}
        >
          {picks.series ? (
            <TitleAnswer
              title={picks.series}
              onRemove={() => savePicks({ series: undefined })}
            />
          ) : (
            <PickerSearch<TMDbResult>
              label="Buscar tu serie favorita"
              placeholder="Los Soprano, Chernobyl, Fleabag…"
              search={async (query) => onlyOfType(await searchMulti(query), 'tv')}
              itemKey={(result) => result.id}
              itemLabel={(result) => result.name ?? ''}
              renderItem={(result) => <TitleResult result={result} />}
              onSelect={(result) =>
                savePicks({ series: toPickedTitle(result, 'tv') })
              }
            />
          )}
        </Question>

        <Question
          index={3}
          title="Tus géneros"
          hint={`Hasta ${MAX_GENRES}. Los que ponés cuando no sabés qué mirar.`}
          answered={picks.genres.length > 0}
        >
          <ul className="flex flex-wrap gap-2">
            {genreOptions().map((genre) => (
              <li key={genre}>
                <ToggleChip
                  label={genre}
                  selected={picks.genres.includes(genre)}
                  disabled={picks.genres.length >= MAX_GENRES}
                  onClick={() => toggleGenre(genre)}
                />
              </li>
            ))}
          </ul>
        </Question>

        <Question
          index={4}
          title="Actores y actrices"
          hint={`Hasta ${MAX_PEOPLE}. Gente a la que seguirías a cualquier película.`}
          answered={picks.actors.length > 0}
        >
          {picks.actors.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {picks.actors.map((person) => (
                <AnswerChip
                  key={person.id}
                  label={person.name}
                  image={person.profilePath}
                  fallback={<User size={14} aria-hidden="true" />}
                  to={`/persona/${person.id}`}
                  onRemove={() => removePerson('actors', person.id)}
                />
              ))}
            </ul>
          )}

          <PickerSearch<TMDbPerson>
            label="Buscar un actor o una actriz"
            placeholder="Buscá por nombre…"
            search={async (query) =>
              departmentFirst(await searchPeople(query), 'Acting')
            }
            itemKey={(person) => person.id}
            itemLabel={(person) => person.name}
            renderItem={(person) => <PersonResult person={person} />}
            onSelect={(person) => addPerson('actors', person)}
            full={picks.actors.length >= MAX_PEOPLE}
            fullHint={`Ya elegiste ${MAX_PEOPLE}. Sacá a alguien para sumar a otra persona.`}
          />
        </Question>

        <Question
          index={5}
          title="Directores y directoras"
          hint={`Hasta ${MAX_PEOPLE}. Quien firma una película y con eso te alcanza.`}
          answered={picks.directors.length > 0}
        >
          {picks.directors.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {picks.directors.map((person) => (
                <AnswerChip
                  key={person.id}
                  label={person.name}
                  image={person.profilePath}
                  fallback={<Clapperboard size={14} aria-hidden="true" />}
                  to={`/persona/${person.id}`}
                  onRemove={() => removePerson('directors', person.id)}
                />
              ))}
            </ul>
          )}

          <PickerSearch<TMDbPerson>
            label="Buscar un director o una directora"
            placeholder="Buscá por nombre…"
            search={async (query) =>
              departmentFirst(await searchPeople(query), 'Directing')
            }
            itemKey={(person) => person.id}
            itemLabel={(person) => person.name}
            renderItem={(person) => <PersonResult person={person} />}
            onSelect={(person) => addPerson('directors', person)}
            full={picks.directors.length >= MAX_PEOPLE}
            fullHint={`Ya elegiste ${MAX_PEOPLE}. Sacá a alguien para sumar a otra persona.`}
          />
        </Question>

        <Question
          index={6}
          title="Productoras"
          hint={`Hasta ${MAX_STUDIOS}. A24, Ghibli, Pixar: el sello también es un gusto.`}
          answered={picks.studios.length > 0}
        >
          {picks.studios.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {picks.studios.map((studio) => (
                <AnswerChip
                  key={studio.id}
                  label={studio.name}
                  fallback={<Building2 size={14} aria-hidden="true" />}
                  onRemove={() =>
                    savePicks({
                      studios: picks.studios.filter((s) => s.id !== studio.id),
                    })
                  }
                />
              ))}
            </ul>
          )}

          <PickerSearch<TMDbCompany>
            label="Buscar una productora"
            placeholder="A24, Studio Ghibli, HBO…"
            search={searchCompanies}
            itemKey={(company) => company.id}
            itemLabel={(company) => company.name}
            renderItem={(company) => <StudioResult company={company} />}
            onSelect={addStudio}
            full={picks.studios.length >= MAX_STUDIOS}
            fullHint={`Ya elegiste ${MAX_STUDIOS}. Sacá una para sumar otra.`}
          />
        </Question>

        <Question
          index={7}
          title="Tu década"
          hint="De dónde salen las que más te gustan."
          answered={picks.decade !== undefined}
        >
          <ul className="flex flex-wrap gap-2">
            {decadeOptions().map((decade) => (
              <li key={decade}>
                <ToggleChip
                  label={decadeLabel(decade)}
                  selected={picks.decade === decade}
                  onClick={() =>
                    savePicks({
                      decade: picks.decade === decade ? undefined : decade,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </Question>
      </ol>

      <p className="text-sm text-text-subtle">
        Tus respuestas viajan con tu biblioteca: se sincronizan entre
        dispositivos, se van en el backup y se borran con la cuenta.
      </p>
    </div>
  );
}
