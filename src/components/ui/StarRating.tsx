import { useId, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Las cinco estrellas; cada una se parte en dos mitades clicables. */
const STARS = [1, 2, 3, 4, 5];

/** "3,5 de 5 estrellas": como se lee en castellano. */
export function ratingLabel(value: number): string {
  return `${value.toString().replace('.', ',')} de 5 estrellas`;
}

interface StarRatingInputProps {
  /** De 0,5 a 5; 0 es "sin puntaje". */
  value: number;
  onChange: (value: number) => void;
  /** Qué se está puntuando, para el lector de pantalla: "Tu calificación". */
  legend: string;
  /** Lado de cada estrella, en píxeles. */
  size?: number;
  /** Rótulo visible arriba de las estrellas. */
  caption?: string;
  /** Anuncia el puntaje elegido debajo de las estrellas. */
  announce?: boolean;
  /**
   * Ofrece volver a "sin puntaje".
   *
   * Para cuando puntuar es opcional: con radios, una vez elegida una estrella
   * no hay forma de deselegirla, y quien tocó sin querer quedaba obligado a
   * dejar un puntaje que no quería dar.
   */
  clearable?: boolean;
  className?: string;
}

/**
 * Cinco estrellas con medias estrellas.
 *
 * Cada mitad es un radio de verdad (visualmente oculto) con su `<label>`
 * encima: así el mouse funciona como siempre, pero además se puede calificar
 * con las flechas del teclado y un lector de pantalla anuncia "3,5 de 5
 * estrellas".
 */
export function StarRatingInput({
  value,
  onChange,
  legend,
  size = 40,
  caption,
  announce = false,
  clearable = false,
  className,
}: StarRatingInputProps) {
  const [hover, setHover] = useState(0);
  const groupId = useId();
  const shown = hover || value;

  const renderStar = (position: number) => {
    const half = position - 0.5;
    const isFull = shown >= position;
    const isHalf = !isFull && shown >= half;

    return (
      <div key={position} className="relative" style={{ width: size, height: size }}>
        {[half, position].map((option) => (
          <input
            key={option}
            type="radio"
            name={groupId}
            id={`${groupId}-${option}`}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className={option === half ? 'peer/half sr-only' : 'peer/full sr-only'}
          />
        ))}

        {[half, position].map((option) => (
          <label
            key={option}
            htmlFor={`${groupId}-${option}`}
            onMouseEnter={() => setHover(option)}
            className={cn(
              'absolute inset-y-0 w-1/2 z-10 cursor-pointer',
              option === half ? 'left-0' : 'right-0',
            )}
          >
            <span className="sr-only">{ratingLabel(option)}</span>
          </label>
        ))}

        {/* El contorno de las vacías va con el color de los bordes de campo, que
            tiene contraste 3:1 en los dos temas: con el de las tarjetas, las
            cinco estrellas vacías casi no se veían. */}
        <span className="block rounded-sm peer-focus-visible/half:outline-2 peer-focus-visible/half:outline-offset-2 peer-focus-visible/half:outline-accent peer-focus-visible/full:outline-2 peer-focus-visible/full:outline-offset-2 peer-focus-visible/full:outline-accent">
          {isFull ? (
            <Star className="text-accent fill-accent" size={size} strokeWidth={1} />
          ) : isHalf ? (
            <span className="relative block">
              <Star className="text-border-control" size={size} strokeWidth={1} />
              <span className="absolute inset-0 overflow-hidden w-1/2">
                <Star className="text-accent fill-accent" size={size} strokeWidth={1} />
              </span>
            </span>
          ) : (
            <Star className="text-border-control" size={size} strokeWidth={1} />
          )}
        </span>
      </div>
    );
  };

  return (
    <fieldset
      className={cn('flex flex-col items-center gap-3', className)}
      onMouseLeave={() => setHover(0)}
    >
      <legend className="sr-only">{legend}</legend>
      {caption && (
        <span aria-hidden="true" className="text-sm text-text-muted font-medium">
          {caption}
        </span>
      )}
      <div className="flex gap-2">{STARS.map(renderStar)}</div>
      {(announce || (clearable && value > 0)) && (
        <div className="flex items-center gap-3 h-5">
          {announce && (
            <p aria-live="polite" className="text-sm text-text-muted">
              {value > 0 ? ratingLabel(value) : ''}
            </p>
          )}
          {clearable && value > 0 && (
            <button
              type="button"
              onClick={() => onChange(0)}
              className="text-sm text-text-muted underline underline-offset-4 hover:text-text-main"
            >
              Sin puntaje
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}
