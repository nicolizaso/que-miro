import { useId } from 'react';
import { ToggleChip } from '@/components/taste/ToggleChip';
import { useRestrictions } from '@/hooks/useRestrictions';
import { excludableGenreOptions } from '@/lib/genres';
import { minYearOptions } from '@/lib/restrictions';
import { RestrictionScope } from '@/types';

const SCOPES: { value: RestrictionScope; label: string }[] = [
  { value: 'movie', label: 'Películas' },
  { value: 'tv', label: 'Series' },
  { value: 'both', label: 'Las dos' },
];

/**
 * "Lo que no te interesa": lo que Explorar nunca te tiene que ofrecer.
 *
 * Va aparte de las siete preguntas y no suma al progreso porque no es un gusto
 * sino un filtro: no arma filas, las recorta. Se guarda cambio por cambio,
 * igual que el cuestionario.
 */
export function RestrictionsSection({ favoriteGenres }: { favoriteGenres: string[] }) {
  const { restrictions, toggleGenre, setMinYear } = useRestrictions();
  const { minYear, excludedGenres } = restrictions;
  const scopeLabelId = useId();

  const toggleYear = (year: number) => {
    setMinYear(
      minYear?.year === year ? undefined : { year, scope: minYear?.scope ?? 'both' },
    );
  };

  return (
    <section className="surface p-5 flex flex-col gap-5" aria-labelledby="restricciones">
      <div className="flex flex-col gap-1">
        <h2 id="restricciones" className="text-section">
          Lo que no te interesa
        </h2>
        <p className="text-sm text-text-muted max-w-prose">
          Lo que marques acá no aparece en ninguna fila de Explorar. Tu
          biblioteca no se toca: lo que ya anotaste se sigue viendo.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-section">Nada anterior a</h3>
          <p className="text-sm text-text-muted">
            Tocá el mismo año otra vez para sacar el límite.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {minYearOptions().map((year) => (
            <li key={year}>
              <ToggleChip
                label={String(year)}
                selected={minYear?.year === year}
                onClick={() => toggleYear(year)}
              />
            </li>
          ))}
        </ul>

        {minYear && (
          <div className="flex flex-wrap items-center gap-2">
            <span id={scopeLabelId} className="text-sm text-text-muted">
              Aplica a
            </span>
            <div role="group" aria-labelledby={scopeLabelId} className="flex flex-wrap gap-2">
              {SCOPES.map((scope) => (
                <ToggleChip
                  key={scope.value}
                  label={scope.label}
                  selected={minYear.scope === scope.value}
                  onClick={() => setMinYear({ year: minYear.year, scope: scope.value })}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-section">Géneros</h3>
          <p className="text-sm text-text-muted">
            {favoriteGenres.length > 0
              ? 'Los que elegiste como tus géneros aparecen apagados: no pueden ser las dos cosas.'
              : 'Los que no querés ver ni de casualidad.'}
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {excludableGenreOptions().map((genre) => (
            <li key={genre}>
              <ToggleChip
                label={genre}
                selected={excludedGenres.includes(genre)}
                disabled={favoriteGenres.includes(genre)}
                onClick={() => toggleGenre(genre)}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
