export type MediaType = 'movie' | 'tv';
/**
 * En qué lista está un título.
 *
 * Las tres primeras son las pestañas de Mis listas. `en_pausa` y `abandonada`
 * viven aparte, en *Archivadas*: son estados de un título que empezaste, no
 * listas que se recorren todos los días.
 *
 * Ojo con Firestore: ahí `status` guarda solo los tres de siempre, porque una
 * versión vieja de la app que lee un estado que no conoce lo cambia por
 * `por_ver` y, con la próxima escritura, lo pisa. Los dos nuevos viajan en
 * {@link StoredArchive}; `toStoredMedia` y `parseMedia` hacen la traducción.
 */
export type MediaStatus = 'por_ver' | 'viendo' | 'completada' | 'en_pausa' | 'abandonada';

/** Los estados que no son pestañas: se ven juntos en *Archivadas*. */
export type ArchivedStatus = 'en_pausa' | 'abandonada';

/** Cuándo y por qué se archivó un título que está en pausa o abandonado. */
export interface ArchiveInfo {
  at: string; // ISO
  /** Motivo corto, si lo dejaste. Solo en abandonados. */
  reason?: string;
}

/**
 * Cómo se guarda un título archivado en Firestore y en los backups: `status`
 * queda en `viendo` —lo que entiende una versión vieja— y el estado real va
 * acá. Si una versión vieja lo mueve a otra lista, `status` deja de ser
 * `viendo` y esto ya no vale: gana lo último que hizo la persona.
 */
export interface StoredArchive extends ArchiveInfo {
  status: ArchivedStatus;
}

/**
 * En qué castellano se le piden los textos a TMDB: el de España o el latino.
 * Sale de la región (ver `lib/language.ts`).
 */
export type TmdbLanguage = 'es-ES' | 'es-MX';

/**
 * Una vez que viste un título, de principio a fin.
 *
 * Reemplaza al `review` único de la v1 del schema: volver a ver algo ya no pisa
 * lo que habías escrito la primera vez, queda como una entrada más del
 * historial.
 */
export interface WatchEntry {
  /** Identifica la entrada dentro del historial de su título. */
  id: string;
  /** 0,5 a 5,0. */
  rating: number;
  text?: string;
  /** Etiquetas de ánimo: "para llorar", "con amigos". */
  tags?: string[];
  /** Puntaje por temporada, para series. Número de temporada -> puntaje. */
  seasonRatings?: Record<number, number>;
  completedAt: string; // ISO
  /**
   * Es de una vuelta que abandonaste: el puntaje que dejaste al abandonar, o
   * una reseña escrita con el título abandonado.
   *
   * Cuenta como opinión —el gusto la lee, y en contra— pero no como "lo
   * viste": no suma horas ni títulos terminados, y no se vuelve una vez que lo
   * viste aunque después lo retomes. Por eso es una marca en la entrada y no
   * algo que se deduzca del estado del título.
   */
  abandoned?: boolean;
}

/**
 * En qué anda una serie, según el `status` de su ficha en TMDB.
 *
 * Es lo que decide cada cuánto vale la pena volver a preguntar: una serie en
 * emisión suma episodios cada semana; una terminada, nunca más.
 */
export type SeriesStatus =
  | 'Returning Series'
  | 'Planned'
  | 'In Production'
  | 'Ended'
  | 'Canceled'
  | 'Pilot';

/** Un episodio puntual de una serie, como lo anuncia TMDB. */
export interface EpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
  /**
   * El día en que sale, `YYYY-MM-DD`.
   *
   * TMDB da días y no horas, así que se guarda y se compara como día: pasarlo
   * a una hora inventaría una precisión que el dato no tiene.
   */
  airDate: string;
  name?: string;
}

/** El primer episodio nuevo de una serie, y cuándo se lo detectó. */
export interface NewEpisodesMarker {
  seasonNumber: number;
  episodeNumber: number;
  detectedAt: string; // ISO
}

/** Una temporada, como la describe TMDB. */
export interface SeasonInfo {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  /**
   * Minutos que dura la temporada entera, sumando episodio por episodio.
   *
   * Opcional: se conoce recién cuando alguien despliega la temporada y llegan
   * sus episodios, y solo si todos traen duración. Es mejor dato que "lo que
   * dura el primer episodio por la cantidad de episodios", que en una serie
   * con un piloto largo o un final de dos horas se equivoca feo.
   */
  totalRuntime?: number;
}

/**
 * Qué episodios viste de una serie.
 *
 * `watched` es un mapa de número de temporada a la lista de episodios vistos.
 * Se guarda la lista y no un contador porque la gente no mira en orden: se
 * saltea un episodio, vuelve a uno viejo, retoma una temporada a la mitad.
 */
export interface SeriesProgress {
  watched: Record<number, number[]>;
  /**
   * Cuándo se marcó cada episodio: clave `"2x5"` (temporada x episodio) →
   * fecha ISO.
   *
   * Va aparte de `watched` a propósito, en vez de convertir cada número en un
   * objeto con su fecha: una PWA vieja en otro dispositivo sigue leyendo
   * `watched` como una lista de números, y cambiarle la forma le rompería el
   * progreso. Este campo lo ignora sin enterarse.
   *
   * Lo marcado antes de que existiera no tiene fecha, y no se inventa: las
   * estadísticas que dependen de cuándo se vio algo lo dejan afuera.
   */
  watchedAt?: Record<string, string>;
  /**
   * Tu puntaje de cada episodio visto: clave `"2x5"` → de 0,5 a 5.
   *
   * Vive en el progreso y no en el historial porque los episodios se puntúan
   * mientras se mira, antes de que exista una reseña de la serie. Y va aparte
   * de `watched` por lo mismo que `watchedAt`: una versión vieja lo ignora sin
   * romperse.
   */
  episodeRatings?: Record<string, number>;
  lastWatchedAt?: string; // ISO
}

/**
 * Alguien del reparto o de la dirección, como lo identifica TMDB.
 *
 * Se guarda con el título porque es lo que hace posibles las filas de Explorar
 * que hablan de gente: "otros trabajos de este director", "si te gustó esta
 * actriz". Calcularlas pidiendo la ficha de la biblioteca entera cada vez que
 * alguien abre la pestaña no es viable — el mismo motivo por el que ya se
 * cachean plataformas y duración.
 */
export interface Person {
  id: number;
  name: string;
  /** `direccion` incluye a quienes crearon una serie: es el mismo rol. */
  role: 'reparto' | 'direccion';
  profilePath?: string | null;
}

/** Un tema de TMDB: "viajes en el tiempo", "distopía", "vampiros". */
export interface Keyword {
  id: number;
  name: string;
}

export interface SavedMedia {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseYear: string;
  genres: string[];
  status: MediaStatus;
  updatedAt: string; // ISO

  /**
   * Datos traídos de TMDB en el momento de guardar el título.
   *
   * Se cachean acá en vez de pedirlos cada vez porque los necesitan la lista y
   * el picker, que trabajan sobre la biblioteca entera: pedir la ficha de cada
   * título para poder filtrar sería impagable.
   */
  /** Minutos: la duración de la película, o la de un episodio en las series. */
  runtime?: number | null;
  /** Temporadas de la serie, para poder marcar episodios sin volver a TMDB. */
  seasons?: SeasonInfo[];
  totalEpisodes?: number | null;
  /** Plataformas donde estaba disponible, según la región de abajo. */
  providers?: string[];
  /**
   * De esas, en las que está incluido con la suscripción —o gratis—, en tu
   * región. `providers` junta eso con alquiler y compra, así que "está en
   * Prime Video" podía ser cualquiera de las dos cosas.
   *
   * Aparte y no en lugar de `providers`: los filtros y los documentos viejos
   * siguen leyendo aquel. Un array vacío es "no está incluido en ninguna"; la
   * ausencia es "todavía no se calculó", y eso hace que se refresque.
   */
  streaming?: string[];
  /** Región cuyo catálogo se consultó al guardar. */
  providerRegion?: string;

  /** Reparto principal y dirección, para las recomendaciones por gente. */
  people?: Person[];
  /** Temas de TMDB, para las recomendaciones por tema. */
  keywords?: Keyword[];
  /** Saga de TMDB a la que pertenece: *El Padrino*, *Alien*. Solo en películas. */
  sagaId?: number | null;
  sagaName?: string;
  /** Idioma original, en ISO 639-1. Distingue lo que ves doblado de lo que no. */
  originalLanguage?: string;
  /**
   * El día de estreno de una película, `YYYY-MM-DD`. Es lo que pone en el
   * calendario a lo que tenés en *Por Ver* y todavía no salió.
   */
  releaseDate?: string;
  /**
   * En qué castellano se pidió la ficha que completó el título: de ahí salen
   * el título y el nombre de la saga.
   *
   * Ausente en lo guardado antes de que existiera, que se pidió todo en
   * `es-ES`. `isStale` lo compara con el de la región actual: así lo que se
   * guardó como "La jungla de cristal" pasa a "Duro de matar" cuando se
   * refresca, sin migrar nada de golpe.
   */
  enrichedLanguage?: TmdbLanguage;
  /**
   * La región para la que se pidió la ficha.
   *
   * No es lo mismo que `providerRegion`, que es la región de la que salieron
   * las plataformas: si en la elegida no había datos, esa es otra. Comparar
   * contra aquella dejaba vencido para siempre a todo título sin catálogo en tu
   * país, y el refresco en segundo plano lo volvía a pedir en cada visita.
   */
  enrichedRegion?: string;
  /**
   * Cuándo se pidió la ficha por última vez. Es lo que mide la antigüedad en
   * `isStale`: sin esto, una serie guardada no se volvía a pedir nunca.
   */
  enrichedAt?: string; // ISO

  /** En qué anda la serie según TMDB. Solo en series. */
  seriesStatus?: SeriesStatus;
  /** El último episodio que salió. Solo en series. */
  lastAired?: EpisodeRef;
  /** El próximo que sale, si ya tiene fecha. Solo en series. */
  nextToAir?: EpisodeRef;
  /**
   * Desde qué episodio hay novedades que todavía no viste.
   *
   * Lo anota el refresco cuando una serie que habías terminado —o en la que
   * estabas al día— trae episodios nuevos. Es una marca y no un contador: lo
   * que falta ver se calcula cada vez contra el progreso, así que el aviso se
   * apaga solo a medida que los mirás.
   */
  newEpisodesSince?: NewEpisodesMarker;

  /**
   * Desde cuándo está en pausa o abandonado, y por qué. Solo con esos dos
   * estados; con cualquier otro, ausente.
   */
  archive?: ArchiveInfo;

  /**
   * El día en que llega a digital en tu región, `YYYY-MM-DD`. Solo en
   * películas: es lo que dice que una que anotaste antes de que saliera ya
   * se puede ver.
   */
  digitalRelease?: string;
  /**
   * Lo que cambió desde que lo anotaste: llegó a una plataforma, o salió en
   * digital. Lo anota el refresco —el cliente cruzando lo que refrescó; el
   * servidor no se entera— y se descarta con un toque. Lo descartado se
   * queda, con su `seenAt`, para que la misma novedad no vuelva.
   */
  availabilityNews?: AvailabilityNews[];

  /** Episodios vistos. Solo en series. */
  progress?: SeriesProgress;

  /** Veces que lo viste, de la más reciente a la más vieja. */
  history?: WatchEntry[];

  /** Ids de las colecciones a las que pertenece. */
  collections?: string[];

  /**
   * Puntaje del modo duelo, estilo Elo.
   *
   * Ausente mientras el título no haya peleado; `duel.ts` lo trata como el
   * puntaje base. Son campos opcionales que se suman al schema v2 sin migración:
   * un documento viejo simplemente no los trae.
   */
  duelScore?: number;
  duelCount?: number;
}

/** Una lista propia, más allá de los tres estados fijos. */
export interface Collection {
  id: string;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface TMDbResult {
  id: number;
  media_type: MediaType;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  overview: string;
  vote_average?: number;
  vote_count?: number;
  original_language?: string;
}

/** Una persona, como la devuelve la búsqueda de TMDB. */
export interface TMDbPerson {
  id: number;
  name: string;
  profile_path: string | null;
  /** "Acting", "Directing": con qué trabaja TMDB que se la conoce. */
  known_for_department?: string | null;
  /** Un par de títulos suyos, para distinguir dos homónimos de un vistazo. */
  known_for?: string[];
}

/** Una productora, como la devuelve la búsqueda de TMDB. */
export interface TMDbCompany {
  id: number;
  name: string;
  logo_path: string | null;
}

/** Un episodio de una temporada, como lo reenvía `/api/tmdb/season`. */
export interface TMDbEpisode {
  episode_number: number;
  name: string;
  overview: string;
  /** `YYYY-MM-DD`, o `null` si todavía no tiene fecha. */
  air_date: string | null;
  /** Minutos, o `null` si todavía no se sabe. */
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
  /** `standard`, `mid_season` o `finale`. */
  episode_type: string | null;
}

/** Una temporada con sus episodios. */
export interface TMDbSeason {
  season_number: number;
  name: string;
  episodes: TMDbEpisode[];
}

/** Un episodio como lo manda TMDB en `last_episode_to_air` y `next_episode_to_air`. */
export interface TMDbEpisodeToAir {
  season_number: number;
  episode_number: number;
  air_date: string | null;
  name?: string;
}

export interface TMDbDetail extends Omit<TMDbResult, 'genre_ids'> {
  genres: { id: number; name: string }[];
  /** Minutos. Solo en películas. */
  runtime?: number | null;
  /** Minutos por episodio. Solo en series; TMDB devuelve una lista. */
  episode_run_time?: number[];
  number_of_episodes?: number;
  videos?: {
    results: {
      type: string;
      key: string;
      site: string;
    }[];
  };
  credits?: {
    cast: {
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }[];
    crew?: {
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path: string | null;
    }[];
  };
  /** Quiénes crearon la serie. En TMDB no vienen en `crew`, vienen acá. */
  created_by?: {
    id: number;
    name: string;
    profile_path: string | null;
  }[];
  /**
   * Temas del título. TMDB los devuelve bajo `keywords` en películas y bajo
   * `results` en series — el mismo dato, dos nombres.
   */
  keywords?: {
    keywords?: { id: number; name: string }[];
    results?: { id: number; name: string }[];
  };
  /** La saga a la que pertenece la película, si pertenece a alguna. */
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
  } | null;
  seasons?: {
    season_number: number;
    name: string;
    episode_count: number;
  }[];
  /** En series, en qué anda: "Returning Series", "Ended". En películas, otra cosa. */
  status?: string;
  last_episode_to_air?: TMDbEpisodeToAir | null;
  next_episode_to_air?: TMDbEpisodeToAir | null;
  /**
   * Cuándo llega a digital, país por país (`{ AR: '2024-05-21' }`). Lo arma
   * el servidor a partir de las fechas de estreno de TMDB. Solo en películas.
   */
  digital_releases?: Record<string, string>;
  'watch/providers'?: {
    results: Record<string, {
      /**
       * La página de TMDB con dónde verlo en esa región. Es la que tiene los
       * enlaces directos a cada plataforma, que la API no manda.
       */
      link?: string;
      flatrate?: { provider_name: string; logo_path: string }[];
      /** Gratis, sin suscripción. No en todas las regiones. */
      free?: { provider_name: string; logo_path: string }[];
      /** Gratis con publicidad. No en todas las regiones. */
      ads?: { provider_name: string; logo_path: string }[];
      rent?: { provider_name: string; logo_path: string }[];
      buy?: { provider_name: string; logo_path: string }[];
    }>;
  };
}

/**
 * Un título elegido a mano en "Contanos de vos".
 *
 * Es una copia mínima del resultado de TMDB y no una referencia a la
 * biblioteca: tu película favorita puede no estar anotada en ninguna lista —de
 * hecho es lo más probable, porque la viste antes de instalar esto.
 */
export interface PickedTitle {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseYear: string;
}

/** Alguien elegido a mano: un actor, una directora. */
export interface PickedPerson {
  id: number;
  name: string;
  profilePath?: string | null;
}

/** Una productora elegida a mano: A24, Ghibli, Pixar. */
export interface PickedStudio {
  id: number;
  name: string;
  logoPath?: string | null;
}

/**
 * Lo que la persona dijo de sí misma, en sus propias palabras.
 *
 * Es la otra mitad de lo que Explorar sabe de alguien. `taste.ts` deduce el
 * gusto de la biblioteca —qué puntuaste, con quién te cruzaste dos veces—;
 * esto, en cambio, no se deduce: se declara. Sirve justo donde la deducción no
 * llega, que es el primer día, cuando todavía no hay ni una estrella puesta.
 *
 * Todos los campos son opcionales a propósito: el cuestionario se puede
 * contestar de a una pregunta por vez, y con una sola ya hay filas nuevas.
 */
/** Una novedad de un título de *Por Ver*. */
export interface AvailabilityNews {
  /** `provider`: llegó a una plataforma. `release`: salió en digital. */
  kind: 'provider' | 'release';
  /** La plataforma, en las de `provider`. Vacío en un estreno digital. */
  provider: string;
  since: string; // ISO
  /** Cuándo se descartó. Mientras falte, se muestra. */
  seenAt?: string;
}

/** Una plataforma elegida como suscripción, con lo que hace falta para mostrarla. */
export interface SubscribedProvider {
  id: number;
  name: string;
  logoPath: string | null;
}

/**
 * Las plataformas que pagás, en `users/{uid}/profile/subscriptions`.
 *
 * Es de la cuenta y no del dispositivo: se paga una vez y vale en el celular y
 * en la compu.
 */
export interface Subscriptions {
  providers: SubscribedProvider[];
  updatedAt: string; // ISO
}

/** La meta de un año. Cualquiera de las tres puede faltar. */
export interface YearGoal {
  movies?: number;
  series?: number;
  hours?: number;
}

/**
 * Las metas de la cuenta, en `users/{uid}/profile/goals`.
 *
 * Año por año y no una sola: la meta de 2025 tiene que seguir diciendo si se
 * cumplió en el resumen de 2025 aunque para 2026 te pongas otra.
 */
export interface Goals {
  /** Año (`"2026"`) → su meta. */
  byYear: Record<string, YearGoal>;
  updatedAt: string; // ISO
}

export interface TastePicks {
  movie?: PickedTitle;
  series?: PickedTitle;
  /** Nombres de género, como los guarda la biblioteca: "Terror", "Comedia". */
  genres: string[];
  actors: PickedPerson[];
  directors: PickedPerson[];
  studios: PickedStudio[];
  /** El primer año de la década: 1990, 2000. */
  decade?: number;
  updatedAt: string; // ISO
}
