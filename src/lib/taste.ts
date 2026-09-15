import { Keyword, Person, SavedMedia } from '@/types';
import { allWatches } from '@/lib/stats';
import { progressPercent, watchedEpisodes } from '@/lib/progress';

/**
 * Los umbrales con los que se lee un puntaje.
 *
 * Están acá y no repartidos en cada receta porque son la definición de "te
 * gustó" de toda la app: si mañana se corrigen, se corrigen una vez.
 */
export const LIKED = 3.5;
export const FAVORITE = 4;
/** Más de 4: el piso que pidió el ticket para hablar de un director. */
export const LOVED = 4.5;

/** Un título con el mejor puntaje que le pusiste alguna vez. */
export interface RatedTitle {
  media: SavedMedia;
  rating: number;
  /** Cuándo lo terminaste esa vez. */
  watchedAt: string;
}

/** Alguien de tu biblioteca, con los títulos tuyos en los que aparece. */
export interface PersonSignal {
  person: Person;
  /** Tus títulos donde participa, del mejor puntuado al peor. */
  titles: SavedMedia[];
  bestRating: number;
}

export interface GenreSignal {
  name: string;
  /** Cuántos títulos puntuados tuyos son de este género. */
  count: number;
  /** Cuánto te gustaron: la suma de lo que cada uno se pasó del punto medio. */
  score: number;
}

export interface KeywordSignal {
  keyword: Keyword;
  count: number;
}

export interface SagaSignal {
  id: number;
  name: string;
  /** Las partes que sí tenés en la biblioteca. */
  titles: SavedMedia[];
}

export interface Taste {
  /** Lo que puntuaste 4 o más, de mejor a peor. */
  favorites: RatedTitle[];
  /** Lo que puntuaste 3,5 o más. */
  liked: RatedTitle[];
  /** Quienes dirigieron o crearon algo que puntuaste por encima de 4. */
  directors: PersonSignal[];
  /** Quienes actuaron en algo que puntuaste 4 o más. */
  actors: PersonSignal[];
  /** Los géneros que mirás, de más a menos afín. */
  genres: GenreSignal[];
  /** Géneros que probaste una sola vez y te gustaron. */
  blindSpots: GenreSignal[];
  decades: { decade: number; count: number }[];
  /** Idiomas originales distintos del inglés, entre tus favoritos. */
  languages: { code: string; count: number }[];
  providers: { name: string; count: number }[];
  keywords: KeywordSignal[];
  /** Etiquetas de ánimo que usaste en lo que más te gustó. */
  moods: { tag: string; count: number }[];
  sagas: SagaSignal[];
  /** Tu lista *Por Ver*, de lo último guardado a lo primero. */
  pending: SavedMedia[];
  /** Pendientes de hace más de medio año. */
  stalePending: SavedMedia[];
  /** Series empezadas y sin terminar. */
  unfinished: SavedMedia[];
  /** Lo que amaste hace más de un año: candidato a volver a ver. */
  rewatchables: SavedMedia[];
  /** El año del que más favoritos tenés. */
  bestYear?: number;
  movies: number;
  series: number;
  /** Todo lo que ya está anotado: nunca se recomienda algo de acá. */
  savedIds: Set<number>;
  /** Si hay con qué personalizar algo, aunque sea una fila. */
  hasSignal: boolean;
}

/** Medio año, que es cuando un pendiente ya se te olvidó. */
const STALE_PENDING_DAYS = 180;
/** Un año: lo que tarda algo en volver a dar ganas. */
const REWATCH_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Orden estable para los empates: primero el mejor puntaje, después el título. */
function byRating(a: RatedTitle, b: RatedTitle): number {
  return (
    b.rating - a.rating ||
    Date.parse(b.watchedAt) - Date.parse(a.watchedAt) ||
    a.media.title.localeCompare(b.media.title, 'es')
  );
}

/**
 * Cada título con el mejor puntaje que le pusiste, de mejor a peor.
 *
 * El mejor y no el último a propósito: si viste algo tres veces, es un
 * favorito, no tres entradas peleando entre sí.
 */
export function ratedTitles(list: SavedMedia[]): RatedTitle[] {
  const best = new Map<number, RatedTitle>();

  for (const { media, entry } of allWatches(list)) {
    const current = best.get(media.tmdbId);
    if (!current || entry.rating > current.rating) {
      best.set(media.tmdbId, {
        media,
        rating: entry.rating,
        watchedAt: entry.completedAt,
      });
    }
  }

  return Array.from(best.values()).sort(byRating);
}

/** Junta a la misma persona a través de todos los títulos donde aparece. */
function collectPeople(
  rated: RatedTitle[],
  role: Person['role'],
  minimumRating: number,
): PersonSignal[] {
  const signals = new Map<number, PersonSignal>();

  for (const { media, rating } of rated) {
    if (rating < minimumRating) continue;

    for (const person of media.people ?? []) {
      if (person.role !== role) continue;

      const current = signals.get(person.id);
      if (current) {
        current.titles.push(media);
        current.bestRating = Math.max(current.bestRating, rating);
      } else {
        signals.set(person.id, {
          person,
          titles: [media],
          bestRating: rating,
        });
      }
    }
  }

  return Array.from(signals.values()).sort(
    (a, b) =>
      // Primero quien te gustó en más de una cosa: que alguien aparezca dos
      // veces entre tus favoritos dice mucho más que un solo 5 suelto.
      b.titles.length - a.titles.length ||
      b.bestRating - a.bestRating ||
      a.person.name.localeCompare(b.person.name, 'es'),
  );
}

/** Cuenta ocurrencias y devuelve una lista ordenada de mayor a menor. */
function tally<T>(
  items: T[],
  key: (item: T) => string,
): { key: string; count: number; sample: T }[] {
  const counts = new Map<string, { key: string; count: number; sample: T }>();

  for (const item of items) {
    const id = key(item);
    if (!id) continue;
    const current = counts.get(id);
    if (current) current.count++;
    else counts.set(id, { key: id, count: 1, sample: item });
  }

  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key, 'es'),
  );
}

/** Los géneros de lo que puntuaste, con cuánto te gustó cada uno. */
function collectGenres(rated: RatedTitle[]): GenreSignal[] {
  const signals = new Map<string, GenreSignal>();

  for (const { media, rating } of rated) {
    for (const name of media.genres) {
      const current = signals.get(name) ?? { name, count: 0, score: 0 };
      current.count++;
      // Lo que se pasó del punto medio: un 2 resta, un 5 suma fuerte. Así diez
      // comedias mediocres no le ganan a tres policiales que te encantaron.
      current.score += rating - 2.5;
      signals.set(name, current);
    }
  }

  return Array.from(signals.values()).sort(
    (a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name, 'es'),
  );
}

/** El año del que más favoritos tenés, si hay más de uno. */
function findBestYear(favorites: RatedTitle[]): number | undefined {
  const years = tally(
    favorites.filter(({ media }) => /^\d{4}$/.test(media.releaseYear)),
    ({ media }) => media.releaseYear,
  );

  const top = years[0];
  return top && top.count >= 2 ? Number(top.key) : undefined;
}

/**
 * Todo lo que la app sabe de tu gusto, sacado de tu propia biblioteca.
 *
 * Es una función pura sobre la biblioteca: no habla con TMDB ni con Firestore.
 * Las recetas de Explorar leen de acá y de ningún otro lado, así que agregar
 * una fila nueva no obliga a volver a recorrer el historial.
 *
 * `now` se puede inyectar para los tests: hay señales —lo que ya se te
 * olvidó, lo que podrías volver a ver— que dependen de cuánto tiempo pasó.
 */
export function tasteProfile(list: SavedMedia[], now = new Date()): Taste {
  const rated = ratedTitles(list);
  const favorites = rated.filter(({ rating }) => rating >= FAVORITE);
  const liked = rated.filter(({ rating }) => rating >= LIKED);

  const genres = collectGenres(liked);

  const pending = list
    .filter((media) => media.status === 'por_ver')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const sagas = new Map<number, SagaSignal>();
  for (const { media } of favorites) {
    if (!media.sagaId || !media.sagaName) continue;
    const current = sagas.get(media.sagaId);
    if (current) current.titles.push(media);
    else {
      sagas.set(media.sagaId, {
        id: media.sagaId,
        name: media.sagaName,
        titles: [media],
      });
    }
  }

  const moodTags = allWatches(list)
    .filter(({ entry }) => entry.rating >= FAVORITE)
    .flatMap(({ entry }) => entry.tags ?? []);

  const keywordsOfFavorites = favorites.flatMap(
    ({ media }) => media.keywords ?? [],
  );

  return {
    favorites,
    liked,
    directors: collectPeople(rated, 'direccion', LOVED),
    actors: collectPeople(rated, 'reparto', FAVORITE),
    genres,
    // Un género que probaste una sola vez y te gustó: hay señal de que te
    // interesa, y casi nada visto. Es el hueco más fácil de llenar.
    blindSpots: genres.filter((genre) => genre.count === 1 && genre.score > 1),
    decades: tally(
      liked.filter(({ media }) => /^\d{4}$/.test(media.releaseYear)),
      ({ media }) => String(Math.floor(Number(media.releaseYear) / 10) * 10),
    ).map(({ key, count }) => ({ decade: Number(key), count })),
    languages: tally(
      favorites.filter(
        ({ media }) => media.originalLanguage && media.originalLanguage !== 'en',
      ),
      ({ media }) => media.originalLanguage ?? '',
    ).map(({ key, count }) => ({ code: key, count })),
    providers: tally(
      list.flatMap((media) => media.providers ?? []),
      (name) => name,
    ).map(({ key, count }) => ({ name: key, count })),
    keywords: tally(keywordsOfFavorites, (keyword) => String(keyword.id))
      .filter(({ count }) => count >= 2)
      .map(({ sample, count }) => ({ keyword: sample, count })),
    moods: tally(moodTags, (tag) => tag)
      .filter(({ count }) => count >= 2)
      .map(({ key, count }) => ({ tag: key, count })),
    sagas: Array.from(sagas.values()),
    pending,
    stalePending: pending.filter(
      (media) =>
        now.getTime() - Date.parse(media.updatedAt) > STALE_PENDING_DAYS * DAY_MS,
    ),
    unfinished: list
      .filter(
        (media) =>
          media.mediaType === 'tv' &&
          watchedEpisodes(media) > 0 &&
          (media.history?.length ?? 0) === 0 &&
          progressPercent(media) < 100,
      )
      .sort(
        (a, b) =>
          Date.parse(b.progress?.lastWatchedAt ?? b.updatedAt) -
          Date.parse(a.progress?.lastWatchedAt ?? a.updatedAt),
      ),
    rewatchables: rated
      .filter(
        ({ rating, watchedAt }) =>
          rating >= LOVED &&
          now.getTime() - Date.parse(watchedAt) > REWATCH_DAYS * DAY_MS,
      )
      .map(({ media }) => media),
    bestYear: findBestYear(favorites),
    movies: list.filter((media) => media.mediaType === 'movie').length,
    series: list.filter((media) => media.mediaType === 'tv').length,
    savedIds: new Set(list.map((media) => media.tmdbId)),
    hasSignal: liked.length > 0 || pending.length > 0,
  };
}
