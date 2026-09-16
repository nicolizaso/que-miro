import { SavedMedia, TMDbResult, TastePicks } from '@/types';
import { Taste } from '@/lib/taste';
import {
  getDiscover,
  getGenreId,
  getList,
  getPersonCredits,
  getRecommendations,
  getSaga,
  getSimilar,
  getTrending,
} from '@/lib/tmdb';

/**
 * De qué habla una fila.
 *
 * El feed la usa para no poner dos filas seguidas del mismo tipo: tres
 * "porque viste" pegadas se leen como una sola recomendación repetida.
 */
export type BlockFamily =
  | 'semilla'
  | 'gente'
  | 'genero'
  | 'epoca'
  | 'catalogo'
  | 'biblioteca'
  | 'general';

/** Una fila del feed de Explorar, ya lista para pedir sus títulos. */
export interface FeedBlock {
  /** Estable: la misma receta con el mismo insumo da siempre el mismo id. */
  id: string;
  family: BlockFamily;
  title: string;
  subtitle?: string;
  /** La cara de quien protagoniza la fila, cuando la fila habla de alguien. */
  avatar?: { name: string; profilePath?: string | null };
  /** Cuánto queremos que aparezca temprano. Las más personales pesan más. */
  weight: number;
  /**
   * Con cuántos títulos ya vale la pena dibujarla.
   *
   * Por defecto tres, que es donde una fila deja de parecer rota. Lo bajan las
   * que son cortas por naturaleza: la parte que te falta de una saga es una
   * sola película, y esconderla sería esconder justo la más pertinente.
   */
  minResults?: number;
  /**
   * La fila muestra títulos de tu propia biblioteca.
   *
   * Son las únicas que no se filtran contra lo guardado: "terminá lo que
   * empezaste" no tendría nada para mostrar si se descartara lo que ya tenés.
   */
  local?: boolean;
  fetch: () => Promise<TMDbResult[]>;
}

export interface RecipeContext {
  /** El gusto deducido de la biblioteca: qué puntuaste, con quién te cruzaste. */
  taste: Taste;
  /** El gusto declarado: lo que la persona contestó en "Contanos de vos". */
  picks: TastePicks;
  /** País para el catálogo de plataformas. */
  region: string;
}

/** Una forma de armar filas. Si no hay señal, no devuelve ninguna. */
export interface Recipe {
  id: string;
  build: (context: RecipeContext) => FeedBlock[];
}

/** "4,5" y no "4.5": los puntajes se escriben como se leen en castellano. */
function formatRating(rating: number): string {
  return rating.toString().replace('.', ',');
}

/** Un título de la biblioteca con la forma que muestran las tarjetas. */
function fromSaved(media: SavedMedia): TMDbResult {
  const date = media.releaseYear ? `${media.releaseYear}-01-01` : undefined;

  return {
    id: media.tmdbId,
    media_type: media.mediaType,
    title: media.mediaType === 'movie' ? media.title : undefined,
    name: media.mediaType === 'tv' ? media.title : undefined,
    poster_path: media.posterPath,
    backdrop_path: media.backdropPath,
    release_date: media.mediaType === 'movie' ? date : undefined,
    first_air_date: media.mediaType === 'tv' ? date : undefined,
    genre_ids: [],
    overview: '',
  };
}

/** Los títulos de la biblioteca, resueltos sin pedirle nada a nadie. */
function localFetch(items: SavedMedia[]): () => Promise<TMDbResult[]> {
  return () => Promise.resolve(items.map(fromSaved));
}

/** "película" o "serie", para que los títulos de las filas suenen bien. */
function plural(mediaType: 'movie' | 'tv'): string {
  return mediaType === 'movie' ? 'películas' : 'series';
}

/**
 * El género favorito que exista en este tipo de medio, con su id de TMDB.
 *
 * No todos los géneros están en los dos lados: "Terror" solo existe en
 * películas. Si el favorito no está, se prueba con el siguiente.
 */
function topGenreFor(
  taste: Taste,
  mediaType: 'movie' | 'tv',
  minimumCount = 2,
  skip = 0,
): { name: string; id: number } | undefined {
  const usable = taste.genres
    .filter((genre) => genre.count >= minimumCount && genre.score > 0)
    .map((genre) => ({ name: genre.name, id: getGenreId(genre.name, mediaType) }))
    .filter((genre): genre is { name: string; id: number } => genre.id !== undefined);

  return usable[skip];
}

/**
 * Los géneros elegidos a mano que existen en este tipo de medio, con su id.
 *
 * Mismo problema que arriba: "Terror" no existe en series. El que no está se
 * cae de la lista en vez de armar una fila con el id equivocado.
 */
function pickedGenresFor(
  picks: TastePicks,
  mediaType: 'movie' | 'tv',
): { name: string; id: number }[] {
  return picks.genres
    .map((name) => ({ name, id: getGenreId(name, mediaType) }))
    .filter((genre): genre is { name: string; id: number } => genre.id !== undefined);
}

// ---------------------------------------------------------------------------
// Las recetas.
//
// Cada una declara con qué señal se activa y de dónde saca los títulos. Si la
// señal no está —nunca puntuaste nada arriba de 4, no guardaste plataformas—,
// devuelve cero filas y la fila no existe. Preferimos una pestaña más corta
// antes que una fila vacía con una excusa adentro.
//
// Las señales son de dos clases y las recetas no las mezclan: las primeras
// veinticinco leen `taste`, que sale de la biblioteca, y las últimas nueve leen
// `picks`, que es lo que la persona contestó a mano. La diferencia se nota en
// el peso: lo que alguien declara favorito pesa más que lo que dedujimos de
// sus estrellas, porque no hay nada que interpretar.
// ---------------------------------------------------------------------------

export const RECIPES: Recipe[] = [
  {
    // 1. La clásica, la que ya existía. Sigue siendo la mejor que tenemos.
    id: 'porque-viste',
    build: ({ taste }) =>
      taste.favorites.slice(0, 3).map(({ media, rating }) => ({
        id: `porque-viste-${media.tmdbId}`,
        family: 'semilla',
        title: `Porque viste ${media.title}`,
        subtitle: `Le pusiste ${formatRating(rating)} estrellas.`,
        weight: 10,
        fetch: () => getRecommendations(media.tmdbId, media.mediaType),
      })),
  },
  {
    // 2. El mismo título, por la otra puerta: `/similar` va por metadatos y no
    // por quién mira qué, así que devuelve otra cosa que `/recommendations`.
    id: 'en-la-misma-linea',
    build: ({ taste }) =>
      taste.favorites.slice(0, 2).map(({ media }) => ({
        id: `en-la-misma-linea-${media.tmdbId}`,
        family: 'semilla',
        title: `En la misma línea que ${media.title}`,
        subtitle: 'Mismo género, misma época, mismo clima.',
        weight: 7,
        fetch: () => getSimilar(media.tmdbId, media.mediaType),
      })),
  },
  {
    // 3. Lo que pidió el ticket: un director al que puntuaste por encima de 4.
    id: 'director',
    build: ({ taste }) =>
      taste.directors.slice(0, 2).map((signal) => ({
        id: `director-${signal.person.id}`,
        family: 'gente',
        title: `Otros trabajos de ${signal.person.name}`,
        subtitle: `Dirigió ${signal.titles[0].title}, que puntuaste ${formatRating(signal.bestRating)}.`,
        avatar: {
          name: signal.person.name,
          profilePath: signal.person.profilePath,
        },
        weight: 9,
        fetch: () => getPersonCredits(signal.person.id, 'direccion'),
      })),
  },
  {
    // 4. Un actor de algo que te gustó.
    id: 'actor',
    build: ({ taste }) =>
      taste.actors
        .filter((signal) => signal.titles.length === 1)
        .slice(0, 2)
        .map((signal) => ({
          id: `actor-${signal.person.id}`,
          family: 'gente',
          title: `Si te gustó ${signal.person.name}`,
          subtitle: `Lo viste en ${signal.titles[0].title}.`,
          avatar: {
            name: signal.person.name,
            profilePath: signal.person.profilePath,
          },
          weight: 8,
          fetch: () => getPersonCredits(signal.person.id, 'reparto'),
        })),
  },
  {
    // 5. Quien aparece en más de un favorito tuyo: la señal más fuerte que hay
    // sobre una persona, y la que menos se nota sola.
    id: 'cara-conocida',
    build: ({ taste }) =>
      taste.actors
        .filter((signal) => signal.titles.length >= 2)
        .slice(0, 2)
        .map((signal) => ({
          id: `cara-conocida-${signal.person.id}`,
          family: 'gente',
          title: `Tu cara me suena: ${signal.person.name}`,
          subtitle: `Está en ${signal.titles.length} de tus favoritas, arrancando por ${signal.titles[0].title}.`,
          avatar: {
            name: signal.person.name,
            profilePath: signal.person.profilePath,
          },
          weight: 10,
          fetch: () => getPersonCredits(signal.person.id, 'reparto'),
        })),
  },
  {
    // 6. "Si tiene un par de películas de terror, mostrale terror."
    id: 'genero-afin',
    build: ({ taste }) => {
      const mediaType = taste.series > taste.movies ? 'tv' : 'movie';

      return [0, 1]
        .map((skip) => topGenreFor(taste, mediaType, 2, skip))
        .filter((genre): genre is { name: string; id: number } => Boolean(genre))
        .map((genre) => ({
          id: `genero-afin-${mediaType}-${genre.id}`,
          family: 'genero' as const,
          title: `Estas ${plural(mediaType)} de ${genre.name.toLowerCase()} te pueden gustar`,
          subtitle: 'Bien puntuadas, y ninguna está en tu biblioteca.',
          weight: 8,
          fetch: () =>
            getDiscover({ mediaType, genres: [genre.id], sort: 'rating' }),
        }));
    },
  },
  {
    // 7. Un género que probaste una sola vez y te gustó. El hueco más fácil de
    // llenar de toda la biblioteca.
    id: 'punto-ciego',
    build: ({ taste }) =>
      taste.blindSpots
        .slice(0, 1)
        .map((genre) => ({ name: genre.name, id: getGenreId(genre.name, 'movie') }))
        .filter((genre): genre is { name: string; id: number } => genre.id !== undefined)
        .map((genre) => ({
          id: `punto-ciego-${genre.id}`,
          family: 'genero' as const,
          title: `Poco ${genre.name.toLowerCase()} en tu biblioteca`,
          subtitle: 'Viste una sola y la puntuaste bien. Hay más.',
          weight: 6,
          fetch: () =>
            getDiscover({ mediaType: 'movie', genres: [genre.id], sort: 'rating' }),
        })),
  },
  {
    // 8. El cruce de tus dos géneros: comedia + crimen no es ninguno de los dos.
    id: 'cruce-generos',
    build: ({ taste }) => {
      const first = topGenreFor(taste, 'movie', 2, 0);
      const second = topGenreFor(taste, 'movie', 2, 1);
      if (!first || !second) return [];

      return [
        {
          id: `cruce-generos-${first.id}-${second.id}`,
          family: 'genero',
          title: `${first.name} y ${second.name.toLowerCase()} a la vez`,
          subtitle: 'Tus dos géneros, en la misma película.',
          weight: 7,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              genres: [first.id, second.id],
              sort: 'popular',
            }),
        },
      ];
    },
  },
  {
    // 9. Lo viejo del género que más te gusta: `popular` nunca lo muestra.
    id: 'clasicos-genero',
    build: ({ taste }) => {
      const genre = topGenreFor(taste, 'movie', 2, 0);
      if (!genre) return [];

      return [
        {
          id: `clasicos-genero-${genre.id}`,
          family: 'epoca',
          title: `Clásicos de ${genre.name.toLowerCase()}`,
          subtitle: 'Anteriores al 2000, y con el puntaje intacto.',
          weight: 6,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              genres: [genre.id],
              to: 1999,
              sort: 'rating',
            }),
        },
      ];
    },
  },
  {
    // 10. La década de la que más mirás.
    id: 'decada',
    build: ({ taste }) => {
      const decade = taste.decades[0];
      if (!decade || decade.count < 3) return [];

      return [
        {
          id: `decada-${decade.decade}`,
          family: 'epoca',
          title: `Los ${String(decade.decade).slice(2)} te quedaron bien`,
          subtitle: `Tenés ${decade.count} títulos de esa década puntuados.`,
          weight: 6,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              from: decade.decade,
              to: decade.decade + 9,
              sort: 'rating',
            }),
        },
      ];
    },
  },
  {
    // 11. Si mirás casi puras películas, series — y al revés.
    id: 'otro-tipo',
    build: ({ taste }) => {
      const total = taste.movies + taste.series;
      if (total < 5) return [];

      const minority = taste.movies > taste.series ? 'tv' : 'movie';
      const majorityShare =
        Math.max(taste.movies, taste.series) / Math.max(total, 1);
      // Solo cuando el desbalance es real: con 60/40 no hay nada que señalar.
      if (majorityShare < 0.75) return [];

      const genre = topGenreFor(taste, minority, 1, 0);

      return [
        {
          id: `otro-tipo-${minority}`,
          family: 'genero',
          title:
            minority === 'tv'
              ? 'Series, para variar'
              : 'Películas, para cortar con las series',
          subtitle: 'Casi todo lo que tenés anotado es de lo otro.',
          weight: 6,
          fetch: () =>
            getDiscover({
              mediaType: minority,
              genres: genre ? [genre.id] : undefined,
              sort: 'rating',
            }),
        },
      ];
    },
  },
  {
    // 12. Lo que podés mirar esta noche sin pagar nada nuevo.
    id: 'plataforma',
    build: ({ taste, region }) =>
      taste.providers
        .filter((provider) => provider.count >= 2)
        .slice(0, 2)
        .map((provider) => ({
          id: `plataforma-${provider.name}`,
          family: 'catalogo',
          title: `Está en tu ${provider.name}`,
          subtitle: 'Bien puntuadas, y disponibles donde ya mirás.',
          weight: 8,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              provider: provider.name,
              region,
              sort: 'rating',
            }),
        })),
  },
  {
    // 13. Para la noche en la que no da para tres horas.
    id: 'cortitas',
    build: ({ taste }) => {
      const genre = topGenreFor(taste, 'movie', 2, 0);

      return [
        {
          id: 'cortitas',
          family: 'catalogo',
          title: 'Menos de 100 minutos',
          subtitle: 'Para cuando no da para una de tres horas.',
          weight: 5,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              genres: genre ? [genre.id] : undefined,
              minRuntime: 60,
              maxRuntime: 100,
              sort: 'rating',
            }),
        },
      ];
    },
  },
  {
    // 14. Series de capítulos cortos: se empiezan sin miedo.
    id: 'episodios-cortos',
    build: ({ taste }) => {
      if (taste.series === 0) return [];
      const genre = topGenreFor(taste, 'tv', 1, 0);

      return [
        {
          id: 'episodios-cortos',
          family: 'catalogo',
          title: 'Series de media hora',
          subtitle: 'Capítulos cortos: se arrancan un martes.',
          weight: 5,
          fetch: () =>
            getDiscover({
              mediaType: 'tv',
              genres: genre ? [genre.id] : undefined,
              maxRuntime: 35,
              sort: 'rating',
            }),
        },
      ];
    },
  },
  {
    // 15. Viste la segunda y la tercera, pero nunca la primera.
    id: 'saga',
    build: ({ taste }) =>
      taste.sagas.slice(0, 2).map((saga) => ({
        id: `saga-${saga.id}`,
        family: 'semilla',
        title: `Te falta una parte de ${saga.name}`,
        subtitle: `Tenés ${saga.titles.length} de la saga en tu biblioteca.`,
        weight: 9,
        minResults: 1,
        fetch: () => getSaga(saga.id),
      })),
  },
  {
    // 16. Si tus favoritas no son en inglés, hay un mundo ahí afuera.
    id: 'idioma',
    build: ({ taste }) => {
      const language = taste.languages[0];
      if (!language || language.count < 2) return [];

      const names: Record<string, string> = {
        es: 'en castellano',
        ko: 'coreanas',
        ja: 'japonesas',
        fr: 'francesas',
        it: 'italianas',
        pt: 'en portugués',
        de: 'alemanas',
        da: 'danesas',
        sv: 'suecas',
        zh: 'chinas',
        hi: 'indias',
      };

      return [
        {
          id: `idioma-${language.code}`,
          family: 'catalogo',
          title: `Más películas ${names[language.code] ?? 'en ese idioma'}`,
          subtitle: 'Tus favoritas no son todas en inglés.',
          weight: 7,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              language: language.code,
              sort: 'rating',
            }),
        },
      ];
    },
  },
  {
    // 17. El tema que se repite en tus favoritas, que casi nunca coincide con
    // un género: "viajes en el tiempo" no es ciencia ficción a secas.
    id: 'tema',
    build: ({ taste }) =>
      taste.keywords.slice(0, 2).map(({ keyword, count }) => ({
        id: `tema-${keyword.id}`,
        family: 'genero',
        title: `Más sobre ${keyword.name.toLowerCase()}`,
        subtitle: `El tema aparece en ${count} de tus favoritas.`,
        weight: 7,
        fetch: () =>
          getDiscover({
            mediaType: 'movie',
            keyword: keyword.id,
            sort: 'popular',
          }),
      })),
  },
  {
    // 18. Tus propias etiquetas de ánimo, devueltas como recomendación.
    id: 'mood',
    build: ({ taste }) => {
      const mood = taste.moods[0];
      if (!mood) return [];

      const seed = taste.favorites.find(({ media }) =>
        (media.history ?? []).some((entry) => entry.tags?.includes(mood.tag)),
      );
      if (!seed) return [];

      return [
        {
          id: `mood-${mood.tag}`,
          family: 'semilla',
          title: `Otra "${mood.tag}"`,
          subtitle: `Así etiquetaste ${seed.media.title}.`,
          weight: 7,
          fetch: () =>
            getRecommendations(seed.media.tmdbId, seed.media.mediaType),
        },
      ];
    },
  },
  {
    // 19. Lo que anotaste para después también dice qué te interesa, aunque
    // todavía no lo hayas visto.
    id: 'pendiente',
    build: ({ taste }) =>
      taste.pending.slice(0, 2).map((media) => ({
        id: `pendiente-${media.tmdbId}`,
        family: 'semilla',
        title: `Porque tenés ${media.title} en Por Ver`,
        subtitle: 'Todavía no lo viste, pero algo te llamó.',
        weight: 6,
        fetch: () => getRecommendations(media.tmdbId, media.mediaType),
      })),
  },
  {
    // 20. El año del que más favoritos tenés.
    id: 'mejor-ano',
    build: ({ taste }) => {
      if (!taste.bestYear) return [];

      return [
        {
          id: `mejor-ano-${taste.bestYear}`,
          family: 'epoca',
          title: `Tu mejor año fue ${taste.bestYear}`,
          subtitle: 'Es de donde salen varias de tus favoritas.',
          weight: 5,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              from: taste.bestYear,
              to: taste.bestYear,
              sort: 'rating',
            }),
        },
      ];
    },
  },
  {
    // 21. Local: la serie que dejaste en la mitad.
    id: 'terminar',
    build: ({ taste }) => {
      if (taste.unfinished.length === 0) return [];

      return [
        {
          id: 'terminar',
          family: 'biblioteca',
          title: 'Terminá lo que empezaste',
          subtitle: 'Series tuyas que quedaron por la mitad.',
          weight: 9,
          local: true,
          minResults: 1,
          fetch: localFetch(taste.unfinished.slice(0, 12)),
        },
      ];
    },
  },
  {
    // 22. Local: lo que amaste hace mucho.
    id: 'volver-a-ver',
    build: ({ taste }) => {
      if (taste.rewatchables.length === 0) return [];

      return [
        {
          id: 'volver-a-ver',
          family: 'biblioteca',
          title: '¿Te la volvés a ver?',
          subtitle: 'Las puntuaste altísimo, hace más de un año.',
          weight: 5,
          local: true,
          minResults: 1,
          fetch: localFetch(taste.rewatchables.slice(0, 12)),
        },
      ];
    },
  },
  {
    // 23. Local: el pendiente que ya se te olvidó.
    id: 'pendiente-viejo',
    build: ({ taste }) => {
      if (taste.stalePending.length === 0) return [];

      return [
        {
          id: 'pendiente-viejo',
          family: 'biblioteca',
          title: 'Guardaste esto hace rato',
          subtitle: 'Sigue esperándote en Por Ver.',
          weight: 6,
          local: true,
          minResults: 1,
          fetch: localFetch(taste.stalePending.slice(0, 12)),
        },
      ];
    },
  },
  {
    // 24. Estrenos: lo único que se mira por ser nuevo y no por ser bueno.
    id: 'estrenos',
    build: ({ taste }) => {
      const genre = topGenreFor(taste, 'movie', 2, 0);

      return [
        {
          id: 'estrenos',
          family: 'general',
          title: genre ? `Estrenos de ${genre.name.toLowerCase()}` : 'Recién estrenadas',
          subtitle: 'Lo último que salió, sin spoilers del futuro.',
          weight: 5,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              genres: genre ? [genre.id] : undefined,
              sort: 'recent',
            }),
        },
      ];
    },
  },
  {
    // 25. Las tres de siempre. Son el piso del feed: lo que se muestra el
    // primer día, cuando todavía no hay ni una estrella puesta.
    id: 'populares',
    build: () => [
      {
        id: 'tendencias',
        family: 'general',
        title: 'Tendencias de la semana',
        subtitle: 'Lo que está mirando todo el mundo.',
        weight: 4,
        fetch: () => getTrending('week'),
      },
      {
        id: 'populares-peliculas',
        family: 'general',
        title: 'Películas populares',
        weight: 3,
        fetch: () => getList('movie', 'popular'),
      },
      {
        id: 'series-mejor-puntuadas',
        family: 'general',
        title: 'Series mejor puntuadas',
        subtitle: 'Según la comunidad de TMDB.',
        weight: 3,
        fetch: () => getList('tv', 'top_rated'),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Las que salen de "Contanos de vos".
  //
  // Nada de acá se deduce: alguien se sentó a contestar que su película
  // favorita es esa. Por eso pesan más que sus equivalentes de arriba, y por
  // eso son las únicas que funcionan el primer día, con la biblioteca vacía y
  // sin una sola estrella puesta.
  // -------------------------------------------------------------------------

  {
    // 26. La respuesta a la primera pregunta del cuestionario.
    id: 'favorita-pelicula',
    build: ({ picks }) => {
      const movie = picks.movie;
      if (!movie) return [];

      return [
        {
          id: `favorita-pelicula-${movie.tmdbId}`,
          family: 'semilla',
          title: `Si tu película favorita es ${movie.title}`,
          subtitle: 'Te recomendamos estas otras.',
          weight: 11,
          fetch: () => getRecommendations(movie.tmdbId, 'movie'),
        },
      ];
    },
  },
  {
    // 27. Lo mismo con la serie.
    id: 'favorita-serie',
    build: ({ picks }) => {
      const series = picks.series;
      if (!series) return [];

      return [
        {
          id: `favorita-serie-${series.tmdbId}`,
          family: 'semilla',
          title: `Si tu serie favorita es ${series.title}`,
          subtitle: 'Estas van por el mismo camino.',
          weight: 11,
          fetch: () => getRecommendations(series.tmdbId, 'tv'),
        },
      ];
    },
  },
  {
    // 28. Las mismas dos semillas por la otra puerta: `/similar` va por
    // metadatos y no por quién mira qué, así que trae otra cosa.
    id: 'favorita-similar',
    build: ({ picks }) =>
      [picks.movie, picks.series]
        .filter((title): title is NonNullable<typeof title> => Boolean(title))
        .map((title) => ({
          id: `favorita-similar-${title.mediaType}-${title.tmdbId}`,
          family: 'semilla' as const,
          title: `Lo más parecido a ${title.title}`,
          subtitle: 'Mismo género, misma época, mismo clima.',
          weight: 8,
          fetch: () => getSimilar(title.tmdbId, title.mediaType),
        })),
  },
  {
    // 29. Los géneros que eligió, no los que deducimos de sus puntajes.
    id: 'genero-elegido',
    build: ({ picks }) =>
      pickedGenresFor(picks, 'movie')
        .slice(0, 2)
        .map((genre) => ({
          id: `genero-elegido-${genre.id}`,
          family: 'genero' as const,
          title: `Lo mejor de ${genre.name.toLowerCase()}`,
          subtitle: 'Uno de los géneros que elegiste.',
          weight: 9,
          fetch: () =>
            getDiscover({ mediaType: 'movie', genres: [genre.id], sort: 'rating' }),
        })),
  },
  {
    // 30. El mismo género, pero en serie: son dos catálogos distintos y quien
    // dijo "terror" no dijo "películas de terror".
    id: 'genero-elegido-series',
    build: ({ picks }) =>
      pickedGenresFor(picks, 'tv')
        .slice(0, 1)
        .map((genre) => ({
          id: `genero-elegido-series-${genre.id}`,
          family: 'genero' as const,
          title: `Series de ${genre.name.toLowerCase()}`,
          subtitle: 'Tu género favorito, en capítulos.',
          weight: 8,
          fetch: () =>
            getDiscover({ mediaType: 'tv', genres: [genre.id], sort: 'rating' }),
        })),
  },
  {
    // 31. Quien dirige lo que le gusta, dicho por ella misma.
    id: 'director-elegido',
    build: ({ picks }) =>
      picks.directors.slice(0, 2).map((person) => ({
        id: `director-elegido-${person.id}`,
        family: 'gente' as const,
        title: `Todo lo de ${person.name}`,
        subtitle: 'Está entre tus directores favoritos.',
        avatar: { name: person.name, profilePath: person.profilePath },
        weight: 10,
        fetch: () => getPersonCredits(person.id, 'direccion'),
      })),
  },
  {
    // 32. Y quien actúa.
    id: 'actor-elegido',
    build: ({ picks }) =>
      picks.actors.slice(0, 2).map((person) => ({
        id: `actor-elegido-${person.id}`,
        family: 'gente' as const,
        title: `Con ${person.name} en pantalla`,
        subtitle: 'Está entre tus actores favoritos.',
        avatar: { name: person.name, profilePath: person.profilePath },
        weight: 10,
        fetch: () => getPersonCredits(person.id, 'reparto'),
      })),
  },
  {
    // 33. La productora: la única señal que no es ni un título ni una persona,
    // y la que mejor describe un gusto cuando existe —quien dice "A24" está
    // diciendo algo bastante preciso sobre lo que quiere ver.
    id: 'productora-elegida',
    build: ({ picks }) =>
      picks.studios.slice(0, 2).map((studio) => ({
        id: `productora-elegida-${studio.id}`,
        family: 'catalogo' as const,
        title: `Del catálogo de ${studio.name}`,
        subtitle: 'La productora que elegiste.',
        weight: 9,
        // Por popularidad y no por puntaje: el catálogo de una productora ya
        // está acotado, y pedirle además 300 votos deja afuera justo lo que
        // alguien todavía no vio.
        fetch: () =>
          getDiscover({ mediaType: 'movie', company: studio.id, sort: 'popular' }),
      })),
  },
  {
    // 34. La década elegida, cruzada con el género elegido si hay los dos:
    // "terror de los 90" es una fila; "los 90" es un cajón.
    id: 'decada-elegida',
    build: ({ picks }) => {
      const decade = picks.decade;
      if (decade === undefined) return [];

      const genre = pickedGenresFor(picks, 'movie')[0];
      const label = decade < 2000 ? `los ${String(decade).slice(2)}` : `los ${decade}`;

      return [
        {
          id: `decada-elegida-${decade}${genre ? `-${genre.id}` : ''}`,
          family: 'epoca',
          title: genre
            ? `${genre.name} de ${label}`
            : `Lo mejor de ${label}`,
          subtitle: 'Tu década favorita, bien puntuada.',
          weight: 7,
          fetch: () =>
            getDiscover({
              mediaType: 'movie',
              genres: genre ? [genre.id] : undefined,
              from: decade,
              to: decade + 9,
              sort: 'rating',
            }),
        },
      ];
    },
  },
];

/**
 * Todas las filas que se pueden armar con esta biblioteca.
 *
 * Salen sin ordenar: el orden lo decide `feed.ts`, que es el que sabe de
 * barajar y de paginar. Acá solo se decide qué existe.
 */
export function buildBlocks(context: RecipeContext): FeedBlock[] {
  return RECIPES.flatMap((recipe) => {
    try {
      return recipe.build(context);
    } catch (error) {
      // Una receta rota no se lleva puesta la pestaña entera.
      console.error(`[explorar] La receta "${recipe.id}" falló:`, error);
      return [];
    }
  });
}
