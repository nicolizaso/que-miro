import { useId, useMemo, useRef, useState } from 'react';
import { Flame, Target } from 'lucide-react';
import { YearGoal } from '@/types';
import { useMediaStore } from '@/store';
import { useGoals } from '@/hooks/useGoals';
import { Dialog } from '@/components/ui/Dialog';
import { ShareButton } from '@/components/ShareButton';
import {
  GOAL_KINDS,
  GOAL_LABELS,
  GOAL_LIMITS,
  GoalKind,
  GoalProgress,
  goalFor,
  goalProgress,
  goalUnit,
  paceLabel,
  weeklyStreaks,
} from '@/lib/goals';

/** Una meta con su barra: cuánto llevás, de cuánto, y cómo venís. */
function GoalCard({ progress }: { progress: GoalProgress }) {
  const percent = Math.min(100, Math.round((progress.done / progress.target) * 100));

  return (
    <div className="surface p-4 flex flex-col gap-2">
      <span className="text-eyebrow text-text-subtle">{GOAL_LABELS[progress.kind]}</span>
      <span className="font-serif italic font-bold text-2xl text-accent tabular-nums">
        {progress.done}
        <span className="text-text-muted text-base font-sans not-italic font-normal">
          {' '}
          de {progress.target}
        </span>
      </span>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${GOAL_LABELS[progress.kind]}: ${progress.done} de ${progress.target}`}
        className="h-1.5 w-full bg-border-card rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-accent rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-text-muted">{paceLabel(progress)}</p>
    </div>
  );
}

/**
 * Las metas del año, para escribir o cambiar.
 *
 * Tres campos que se pueden dejar vacíos: una meta de horas sola es tan
 * válida como una de películas, y obligar a completar las tres convertía el
 * formulario en un trámite.
 */
function GoalsDialog({
  year,
  initial,
  onSave,
  onClose,
}: {
  year: number;
  initial: YearGoal;
  onSave: (goal: YearGoal) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<GoalKind, string>>({
    movies: initial.movies ? String(initial.movies) : '',
    series: initial.series ? String(initial.series) : '',
    hours: initial.hours ? String(initial.hours) : '',
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const goal: YearGoal = {};
    for (const kind of GOAL_KINDS) {
      const number = Number(values[kind]);
      if (values[kind] !== '' && Number.isInteger(number) && number > 0) goal[kind] = number;
    }
    onSave(goal);
  };

  return (
    <Dialog
      isOpen
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={firstRef}
      className="z-[70] flex items-center justify-center p-4 bg-overlay backdrop-blur-sm overflow-y-auto"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-bg-card border border-border-card rounded-3xl shadow-pop p-6 flex flex-col gap-5 my-auto"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="font-serif italic font-bold text-2xl">
            Tus metas de {year}
          </h2>
          <p className="text-sm text-text-muted">
            Completá las que quieras. Lo que dejes vacío no cuenta como meta.
          </p>
        </div>

        {GOAL_KINDS.map((kind, index) => (
          <label key={kind} className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{GOAL_LABELS[kind]}</span>
            <input
              ref={index === 0 ? firstRef : undefined}
              type="number"
              inputMode="numeric"
              min={1}
              max={GOAL_LIMITS[kind]}
              step={1}
              value={values[kind]}
              onChange={(event) =>
                setValues((current) => ({ ...current, [kind]: event.target.value }))
              }
              placeholder="Sin meta"
              className="w-32 bg-bg-main border border-border-control rounded-control px-3 py-2 text-right tabular-nums text-text-main placeholder:text-text-subtle focus:outline-none focus:border-accent"
            />
          </label>
        ))}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-control border border-border-card font-medium text-text-muted hover:bg-border-card hover:text-text-main transition-colors"
          >
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary flex-1 py-3">
            Guardar
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Metas del año y racha semanal, al lado de las estadísticas.
 *
 * La meta se mide contra el ritmo y no solo contra el total: "4 de 12" en
 * septiembre no dice si vas bien; "2 películas abajo del ritmo", sí. La racha
 * cuenta semanas y no días a propósito: nadie mira algo todos los días, y una
 * racha diaria se corta el primer viernes que salís.
 */
export function GoalsPanel() {
  const mediaList = useMediaStore((state) => state.mediaList);
  const { goals, saveYearGoal } = useGoals();
  const [isEditing, setIsEditing] = useState(false);

  // El año se fija una vez por visita, como el día en el calendario.
  const [now] = useState(() => new Date());
  const year = now.getFullYear();
  const progress = useMemo(
    () => goalProgress(mediaList, goals, year, now),
    [mediaList, goals, year, now],
  );
  const streaks = useMemo(() => weeklyStreaks(mediaList, now), [mediaList, now]);
  const met = progress.filter((goal) => goal.met);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section">Tus metas de {year}</h2>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="btn btn-secondary px-3 py-2 text-sm"
        >
          <Target size={16} aria-hidden="true" />
          {progress.length > 0 ? 'Cambiar metas' : 'Ponerme una meta'}
        </button>
      </div>

      {progress.length > 0 ? (
        <div className="grid sm:grid-cols-3 gap-3">
          {progress.map((goal) => (
            <GoalCard key={goal.kind} progress={goal} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Cuántas películas, cuántas series o cuántas horas querés mirar este
          año. Te mostramos cómo venís contra el ritmo.
        </p>
      )}

      {/* Sin nada visto no hay racha que contar: el cartel no aparece. */}
      {streaks.best > 0 && (
        <div className="surface p-4 flex items-center gap-4">
          <Flame
            size={28}
            aria-hidden="true"
            className={streaks.current > 0 ? 'text-accent shrink-0' : 'text-text-subtle shrink-0'}
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {streaks.current > 0
                ? `${streaks.current} ${streaks.current === 1 ? 'semana' : 'semanas'} seguidas mirando algo`
                : 'Sin racha en curso'}
            </p>
            <p className="text-sm text-text-muted">
              {streaks.current > 0 && !streaks.activeThisWeek
                ? 'Mirá algo esta semana para no cortarla. '
                : ''}
              Tu mejor racha: {streaks.best} {streaks.best === 1 ? 'semana' : 'semanas'}.
            </p>
          </div>
        </div>
      )}

      {met.length > 0 && (
        <ShareButton
          className="self-start"
          label="Compartir la meta cumplida"
          title={`Cumplí mi meta de ${year} en Qué Miro?`}
          text={`Cumplí mi meta de ${year}: ${met
            .map((goal) => goalUnit(goal.kind, goal.target))
            .join(' y ')}.`}
          card={{
            eyebrow: `Meta ${year} cumplida`,
            headline: met.map((goal) => goalUnit(goal.kind, goal.target)).join(' y '),
            subline:
              streaks.best > 1 ? `Mejor racha: ${streaks.best} semanas` : undefined,
            stats: met.map((goal) => ({
              value: String(goal.done),
              label: GOAL_LABELS[goal.kind].toLowerCase(),
            })),
          }}
        />
      )}

      {isEditing && (
        <GoalsDialog
          year={year}
          initial={goalFor(goals, year)}
          onClose={() => setIsEditing(false)}
          onSave={(goal) => {
            saveYearGoal(year, goal);
            setIsEditing(false);
          }}
        />
      )}
    </section>
  );
}
