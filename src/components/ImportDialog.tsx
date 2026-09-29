import { useId, useMemo, useRef, useState } from 'react';
import { FileUp, Film, Loader2, Search, Tv, X } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { useImporter } from '@/hooks/useImporter';
import { TitleCandidate, TMDB_IMAGE_BASE_URL, searchMulti } from '@/lib/tmdb';
import { Resolution } from '@/lib/importers/resolve';
import { Resolved } from '@/lib/importers/toMedia';
import { ImportSource } from '@/lib/importers/types';
import { cn } from '@/lib/utils';

const SOURCE_NAMES: Record<ImportSource, string> = {
  letterboxd: 'Letterboxd',
  imdb: 'IMDb',
  trakt: 'Trakt',
};

function Thumb({ candidate }: { candidate: TitleCandidate }) {
  return (
    <span className="w-8 aspect-[2/3] shrink-0 rounded bg-border-card overflow-hidden flex items-center justify-center text-text-subtle">
      {candidate.posterPath ? (
        <img src={`${TMDB_IMAGE_BASE_URL}${candidate.posterPath}`} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : candidate.mediaType === 'tv' ? (
        <Tv size={12} aria-hidden="true" />
      ) : (
        <Film size={12} aria-hidden="true" />
      )}
    </span>
  );
}

function candidateLabel(candidate: TitleCandidate): string {
  // El original, si es otro: entre dos del mismo nombre y año, suele ser lo
  // que los distingue.
  const original =
    candidate.originalTitle && candidate.originalTitle !== candidate.title ? `(${candidate.originalTitle})` : null;
  return [candidate.title, original, candidate.year, candidate.mediaType === 'tv' ? 'serie' : null]
    .filter(Boolean)
    .join(' · ');
}

function recordLabel(resolution: Resolution): string {
  const { record } = resolution;
  return [record.title, record.year].filter(Boolean).join(' · ');
}

/** Buscar a mano uno que no apareció, con el buscador de siempre. */
function ManualSearch({ initial, onPick }: { initial: string; onPick: (candidate: TitleCandidate) => void }) {
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<TitleCandidate[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const found = await searchMulti(query.trim());
      setResults(
        found.slice(0, 6).map((result) => {
          const date = result.release_date || result.first_air_date || '';
          const year = Number(date.slice(0, 4));
          return {
            id: result.id,
            mediaType: result.media_type,
            title: (result.title || result.name || '').trim(),
            ...(Number.isInteger(year) && year > 0 ? { year } : {}),
            posterPath: result.poster_path,
            backdropPath: result.backdrop_path,
            genreIds: result.genre_ids ?? [],
          };
        }),
      );
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar el título en TMDB"
          className="flex-1 min-w-0 bg-bg-main border border-border-control rounded-control px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        <button type="submit" disabled={isSearching} className="btn btn-secondary px-3 py-2 text-sm">
          {isSearching ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />}
          Buscar
        </button>
      </form>
      {results && results.length === 0 && <p className="text-xs text-text-subtle">Tampoco aparece con eso.</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((result) => (
            <li key={`${result.mediaType}-${result.id}`}>
              <button
                type="button"
                onClick={() => onPick(result)}
                className="w-full flex items-center gap-2 p-1.5 rounded-control text-left text-sm hover:bg-border-card/60"
              >
                <Thumb candidate={result} />
                {candidateLabel(result)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * La revisión antes de guardar: cuántos entraron, cuáles son dudosos —se
 * elige entre las opciones— y cuáles no aparecieron —se buscan a mano o se
 * dejan afuera—.
 */
function ImportReview({
  resolutions,
  onSave,
  onBack,
}: {
  resolutions: Resolution[];
  onSave: (chosen: Resolved[]) => void;
  onBack: () => void;
}) {
  const { exact, doubtful, missing } = useMemo(() => {
    const indexed = resolutions.map((resolution, index) => ({ resolution, index }));
    return {
      exact: indexed.filter(({ resolution }) => resolution.result.kind === 'exact'),
      doubtful: indexed.filter(({ resolution }) => resolution.result.kind === 'doubtful'),
      missing: indexed.filter(({ resolution }) => resolution.result.kind === 'missing'),
    };
  }, [resolutions]);

  // Los dudosos arrancan en la primera opción, que casi siempre es la buena;
  // los que no aparecieron, afuera hasta que se los busque.
  const [choices, setChoices] = useState<Map<number, TitleCandidate | null>>(
    () =>
      new Map(
        doubtful.map(({ resolution, index }) => [
          index,
          resolution.result.kind === 'doubtful' ? (resolution.result.options[0] ?? null) : null,
        ]),
      ),
  );
  const [fixes, setFixes] = useState<Map<number, TitleCandidate>>(new Map());
  const [searching, setSearching] = useState<number | null>(null);

  const chosen = useMemo(() => {
    const list: Resolved[] = [];
    for (const { resolution } of exact) {
      if (resolution.result.kind === 'exact') {
        list.push({ record: resolution.record, candidate: resolution.result.candidate, detail: resolution.detail });
      }
    }
    for (const [index, candidate] of choices) if (candidate) list.push({ record: resolutions[index].record, candidate });
    for (const [index, candidate] of fixes) list.push({ record: resolutions[index].record, candidate });
    return list;
  }, [exact, choices, fixes, resolutions]);

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid grid-cols-3 gap-2 text-center">
        {[
          { value: exact.length, label: exact.length === 1 ? 'encontrado' : 'encontrados' },
          { value: doubtful.length, label: doubtful.length === 1 ? 'dudoso' : 'dudosos' },
          { value: missing.length, label: 'no aparecieron' },
        ].map(({ value, label }) => (
          <li key={label} className="surface p-3">
            <p className="font-serif italic font-bold text-2xl text-accent leading-tight">{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
          </li>
        ))}
      </ul>

      {doubtful.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-section">Dudosos</h3>
          <p className="text-sm text-text-muted">Hay más de uno posible: elegí cuál es, o ninguno.</p>
          {doubtful.map(({ resolution, index }) => {
            if (resolution.result.kind !== 'doubtful') return null;
            const selected = choices.get(index) ?? null;
            return (
              <fieldset key={index} className="surface p-3 flex flex-col gap-1.5">
                <legend className="sr-only">{recordLabel(resolution)}</legend>
                <p className="text-sm font-semibold" aria-hidden="true">
                  {recordLabel(resolution)}{' '}
                  <span className="text-xs font-normal text-text-subtle">({SOURCE_NAMES[resolution.record.source]})</span>
                </p>
                {[...resolution.result.options, null].map((option) => (
                  <label
                    key={option ? `${option.mediaType}-${option.id}` : 'ninguno'}
                    className={cn(
                      'flex items-center gap-2 p-1.5 rounded-control text-sm cursor-pointer',
                      option === selected || (option && selected && option.id === selected.id && option.mediaType === selected.mediaType)
                        ? 'bg-accent/10'
                        : 'hover:bg-border-card/60',
                    )}
                  >
                    <input
                      type="radio"
                      name={`dudoso-${index}`}
                      checked={option === null ? selected === null : selected?.id === option.id && selected.mediaType === option.mediaType}
                      onChange={() => setChoices((current) => new Map(current).set(index, option))}
                      className="accent-accent"
                    />
                    {option ? (
                      <>
                        <Thumb candidate={option} />
                        {candidateLabel(option)}
                      </>
                    ) : (
                      'Ninguno de estos: no lo importo'
                    )}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </section>
      )}

      {missing.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-section">No aparecieron</h3>
          <p className="text-sm text-text-muted">
            Quedan afuera, salvo que los busques con otro nombre.
          </p>
          <ul className="flex flex-col gap-2">
            {missing.map(({ resolution, index }) => {
              const fixed = fixes.get(index);
              return (
                <li key={index} className="surface p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold min-w-0">
                      {recordLabel(resolution)}{' '}
                      <span className="text-xs font-normal text-text-subtle">({SOURCE_NAMES[resolution.record.source]})</span>
                    </p>
                    {fixed ? (
                      <button
                        type="button"
                        onClick={() =>
                          setFixes((current) => {
                            const next = new Map(current);
                            next.delete(index);
                            return next;
                          })
                        }
                        className="text-xs text-text-muted hover:text-text-main underline underline-offset-4 shrink-0"
                      >
                        Sacar
                      </button>
                    ) : (
                      searching !== index && (
                        <button
                          type="button"
                          onClick={() => setSearching(index)}
                          className="text-xs text-text-muted hover:text-text-main underline underline-offset-4 shrink-0"
                        >
                          Buscarlo
                        </button>
                      )
                    )}
                  </div>
                  {fixed && (
                    <p className="flex items-center gap-2 text-sm text-text-muted">
                      <Thumb candidate={fixed} /> Entra como: {candidateLabel(fixed)}
                    </p>
                  )}
                  {!fixed && searching === index && (
                    <ManualSearch
                      initial={resolution.record.title}
                      onPick={(candidate) => {
                        setFixes((current) => new Map(current).set(index, candidate));
                        setSearching(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
        <button type="button" onClick={onBack} className="btn btn-secondary flex-1 px-4 py-2.5 text-sm">
          Empezar de nuevo
        </button>
        <button
          type="button"
          onClick={() => onSave(chosen)}
          disabled={chosen.length === 0}
          className="btn btn-primary flex-1 px-4 py-2.5 text-sm"
        >
          Importar {chosen.length} {chosen.length === 1 ? 'título' : 'títulos'}
        </button>
      </div>
    </div>
  );
}

/**
 * "Importar de otra app": Letterboxd, IMDb o Trakt. Se eligen los archivos
 * del export, se buscan en TMDB de a pocos —con avance y para cortar— y se
 * revisa antes de guardar.
 */
export function ImportDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { step, readFiles, match, cancel, reset, save } = useImporter();

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={step.kind === 'saving' ? () => {} : close}
      labelledBy={titleId}
      className="z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-overlay backdrop-blur-sm"
    >
      <div className="w-full sm:max-w-xl bg-bg-card border border-border-card rounded-t-3xl sm:rounded-3xl shadow-pop p-6 flex flex-col gap-5 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif italic font-bold text-2xl">
            Importar de otra app
          </h2>
          {step.kind !== 'saving' && (
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="btn-icon w-9 h-9 shrink-0 rounded-full text-text-muted hover:text-text-main hover:bg-border-card"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        {(step.kind === 'idle' || step.kind === 'reading') && (
          <>
            <ul className="flex flex-col gap-2 text-sm text-text-muted">
              <li>
                <strong className="text-text-main">Letterboxd:</strong> Settings → Import &amp; Export →
                Export your data. Subí el ZIP entero.
              </li>
              <li>
                <strong className="text-text-main">IMDb:</strong> tus puntajes o tu lista para ver → Exportar.
                Subí el CSV.
              </li>
              <li>
                <strong className="text-text-main">Trakt:</strong> Settings → Data → Export. Subí los JSON, o el
                ZIP.
              </li>
            </ul>
            <p className="text-xs text-text-subtle">
              Lo que ya está en tu biblioteca no se pisa: se suman las veces que lo viste.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".zip,.csv,.json,application/zip,text/csv,application/json"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length) void readFiles(files);
              }}
              className="sr-only"
              aria-label="Elegir los archivos del export"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={step.kind === 'reading'}
              className="btn btn-primary px-4 py-2.5 text-sm"
            >
              {step.kind === 'reading' ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <FileUp size={16} aria-hidden="true" />
              )}
              Elegir los archivos
            </button>
          </>
        )}

        {step.kind === 'parsed' && (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {(Object.entries(step.parsed.bySource) as [ImportSource, number][]).map(([source, count]) => (
                <li key={source}>
                  <strong>{SOURCE_NAMES[source]}:</strong> {count} {count === 1 ? 'título' : 'títulos'}
                </li>
              ))}
            </ul>
            {(step.parsed.skipped > 0 || step.parsed.unknown.length > 0) && (
              <p className="text-xs text-text-subtle">
                {step.parsed.skipped > 0 &&
                  `Quedan afuera ${step.parsed.skipped} filas que no son películas ni series (episodios sueltos, juegos). `}
                {step.parsed.unknown.length > 0 && `No reconocimos: ${step.parsed.unknown.join(', ')}.`}
              </p>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button type="button" onClick={reset} className="btn btn-secondary flex-1 px-4 py-2.5 text-sm">
                Elegir otros
              </button>
              <button
                type="button"
                onClick={() => void match(step.parsed)}
                className="btn btn-primary flex-1 px-4 py-2.5 text-sm"
              >
                <Search size={16} aria-hidden="true" />
                Buscar en TMDB
              </button>
            </div>
          </>
        )}

        {step.kind === 'matching' && (
          <div className="flex flex-col gap-3">
            <div
              role="progressbar"
              aria-label="Buscando los títulos en TMDB"
              aria-valuemin={0}
              aria-valuemax={step.total}
              aria-valuenow={step.done}
              className="h-2 rounded-full bg-border-card overflow-hidden"
            >
              <div
                className="h-full bg-accent transition-[width] motion-reduce:transition-none"
                style={{ width: `${step.total ? (step.done / step.total) * 100 : 0}%` }}
              />
            </div>
            <p aria-live="polite" className="text-sm text-text-muted">
              Buscando {step.done} de {step.total}…
            </p>
            <button type="button" onClick={cancel} className="btn btn-secondary self-start px-4 py-2 text-sm">
              Cancelar
            </button>
          </div>
        )}

        {step.kind === 'review' && (
          <ImportReview
            resolutions={step.resolutions}
            onBack={reset}
            onSave={(chosen) => {
              void save(chosen).then(() => onClose());
            }}
          />
        )}

        {step.kind === 'saving' && (
          <p className="flex items-center gap-2 text-sm text-text-muted" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Guardando…
          </p>
        )}
      </div>
    </Dialog>
  );
}
