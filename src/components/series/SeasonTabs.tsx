import { useRef } from 'react';
import { Check } from 'lucide-react';
import { SeasonInfo } from '@/types';
import { cn } from '@/lib/utils';

export interface SeasonTabInfo {
  season: SeasonInfo;
  seen: number;
  aired: number;
}

/** El id de la pestaña de una temporada, para que el panel diga cuál muestra. */
export function seasonTabId(panelId: string, seasonNumber: number): string {
  return `${panelId}-t${seasonNumber}`;
}

/**
 * Las temporadas en pastillas, una elegida por vez.
 *
 * Reemplazan a los acordeones apilados: con varias temporadas abiertas la
 * ficha se volvía una lista interminable, y casi siempre se mira una sola.
 * Elegida va invertida, como las píldoras de filtro: el rojo queda para "Lo
 * vi", que es la acción de esta parte de la ficha.
 */
export function SeasonTabs({
  tabs,
  selected,
  panelId,
  onSelect,
}: {
  tabs: SeasonTabInfo[];
  selected: number;
  /** El id del panel que muestra la temporada elegida. */
  panelId: string;
  onSelect: (seasonNumber: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Las flechas mueven entre temporadas, como en cualquier lista de pestañas.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = tabs.findIndex((tab) => tab.season.seasonNumber === selected);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const target = tabs[(index + step + tabs.length) % tabs.length];
    event.preventDefault();
    onSelect(target.season.seasonNumber);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-season="${target.season.seasonNumber}"]`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Temporadas"
      onKeyDown={handleKeyDown}
      className="rail flex gap-2 overflow-x-auto -mx-6 px-6"
    >
      {tabs.map(({ season, seen, aired }) => {
        const isSelected = season.seasonNumber === selected;
        const isComplete = aired > 0 && seen >= aired;
        return (
          <button
            key={season.seasonNumber}
            type="button"
            role="tab"
            id={seasonTabId(panelId, season.seasonNumber)}
            aria-controls={panelId}
            data-season={season.seasonNumber}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(season.seasonNumber)}
            className={cn(
              'pill h-9 px-3.5 tabular-nums',
              'aria-selected:bg-text-main aria-selected:border-text-main aria-selected:text-bg-main aria-selected:font-medium',
            )}
          >
            <span aria-hidden="true">T{season.seasonNumber}</span>
            <span className="sr-only">{season.name}</span>
            {isComplete ? (
              <>
                <Check
                  size={14}
                  aria-hidden="true"
                  className={isSelected ? undefined : 'text-status-completada'}
                />
                <span className="sr-only">, vista entera</span>
              </>
            ) : aired > 0 ? (
              <span className={isSelected ? undefined : 'text-text-subtle'}>
                <span aria-hidden="true">
                  {seen}/{aired}
                </span>
                <span className="sr-only">
                  , {seen} de {aired} vistos
                </span>
              </span>
            ) : (
              <span className={isSelected ? undefined : 'text-text-subtle'}>pronto</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
