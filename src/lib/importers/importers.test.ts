/**
 * Los fixtures de `__fixtures__/` están reconstruidos a partir del formato
 * documentado de cada export (ver su README): no son exports reales.
 */
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import imdbRatings from './__fixtures__/imdb-ratings.csv?raw';
import imdbWatchlist from './__fixtures__/imdb-watchlist.csv?raw';
import lbDiary from './__fixtures__/letterboxd/diary.csv?raw';
import lbRatings from './__fixtures__/letterboxd/ratings.csv?raw';
import lbReviews from './__fixtures__/letterboxd/reviews.csv?raw';
import lbWatched from './__fixtures__/letterboxd/watched.csv?raw';
import lbWatchlist from './__fixtures__/letterboxd/watchlist.csv?raw';
import traktHistory from './__fixtures__/trakt/history.json?raw';
import traktRatingsEpisodes from './__fixtures__/trakt/ratings-episodes.json?raw';
import traktRatingsMovies from './__fixtures__/trakt/ratings-movies.json?raw';
import traktWatchedMovies from './__fixtures__/trakt/watched-movies.json?raw';
import traktWatchedShows from './__fixtures__/trakt/watched-shows.json?raw';
import traktWatchlist from './__fixtures__/trakt/watchlist.json?raw';
import { parseCsv } from './csv';
import { imdbMediaType, parseImdbCsv } from './imdb';
import { parseLetterboxd } from './letterboxd';
import { parseTrakt } from './trakt';
import { fromStars, fromTenPoint } from './ratings';
import { parseImportFiles, unzipTextFiles } from './detect';
import { ImportRecord } from './types';

const LETTERBOXD = [
  { name: 'diary.csv', text: lbDiary },
  { name: 'ratings.csv', text: lbRatings },
  { name: 'reviews.csv', text: lbReviews },
  { name: 'watched.csv', text: lbWatched },
  { name: 'watchlist.csv', text: lbWatchlist },
];

const TRAKT = [
  { name: 'watched-movies.json', text: traktWatchedMovies },
  { name: 'history.json', text: traktHistory },
  { name: 'watched-shows.json', text: traktWatchedShows },
  { name: 'ratings-movies.json', text: traktRatingsMovies },
  { name: 'ratings-episodes.json', text: traktRatingsEpisodes },
  { name: 'watchlist.json', text: traktWatchlist },
];

const byTitle = (records: ImportRecord[], title: string) => records.find((record) => record.title === title)!;

describe('parseCsv', () => {
  it('respeta comillas, comas y saltos de línea adentro de un campo', () => {
    expect(parseCsv('a,b\r\n"uno, dos","tres\ncuatro"\n"con ""comillas""",x\n\n')).toEqual([
      ['a', 'b'],
      ['uno, dos', 'tres\ncuatro'],
      ['con "comillas"', 'x'],
    ]);
  });

  it('ignora la marca de orden de bytes', () => {
    expect(parseCsv('﻿Const,Title\ntt1,X')[0]).toEqual(['Const', 'Title']);
  });
});

describe('los puntajes', () => {
  it('de 1 a 10, cada punto es media estrella', () => {
    expect(fromTenPoint('10')).toBe(5);
    expect(fromTenPoint(9)).toBe(4.5);
    expect(fromTenPoint('1')).toBe(0.5);
    expect(fromTenPoint('')).toBeUndefined();
    expect(fromTenPoint('11')).toBeUndefined();
    expect(fromTenPoint('0')).toBeUndefined();
  });

  it('las estrellas de Letterboxd quedan como están', () => {
    expect(fromStars('4.5')).toBe(4.5);
    expect(fromStars('0.5')).toBe(0.5);
    expect(fromStars('')).toBeUndefined();
    expect(fromStars('6')).toBeUndefined();
  });
});

describe('IMDb', () => {
  it('lo puntuado entra como visto, con su id y el puntaje en estrellas', () => {
    const { records, skipped } = parseImdbCsv(imdbRatings);
    expect(skipped).toBe(1);
    expect(byTitle(records, 'Parasite')).toEqual({
      source: 'imdb',
      title: 'Parasite',
      year: 2019,
      mediaType: 'movie',
      ids: { imdb: 'tt6751668' },
      status: 'completada',
      watches: [{ rating: 4.5, date: '2024-01-15' }],
    });
    expect(byTitle(records, 'Breaking Bad').mediaType).toBe('tv');
  });

  it('una lista sin puntaje va a Por Ver, y los tipos viejos también se entienden', () => {
    const { records, skipped } = parseImdbCsv(imdbWatchlist);
    expect(skipped).toBe(1);
    expect(records.map((record) => [record.title, record.mediaType, record.status])).toEqual([
      ['Dune: Part Two', 'movie', 'por_ver'],
      ['Severance', 'tv', 'por_ver'],
    ]);
  });

  it('los tipos de título, de las dos épocas', () => {
    expect(imdbMediaType('TV Mini Series')).toBe('tv');
    expect(imdbMediaType('tvMiniSeries')).toBe('tv');
    expect(imdbMediaType('TV Movie')).toBe('movie');
    expect(imdbMediaType('TV Episode')).toBeNull();
    expect(imdbMediaType('Video Game')).toBeNull();
  });
});

describe('Letterboxd', () => {
  const records = parseLetterboxd(LETTERBOXD);

  it('el diario da una entrada por vez que se vio, con la reseña pegada a su vez', () => {
    const pastLives = byTitle(records, 'Past Lives');
    expect(pastLives.status).toBe('completada');
    expect(pastLives.watches).toEqual([
      { date: '2024-01-02', rating: 5 },
      {
        date: '2023-05-14',
        rating: 4.5,
        tags: ['cine', 'con amigos'],
        text: 'Hermosa. Te deja pensando,\ncon ganas de llamar a alguien & no cortar.',
      },
    ]);
  });

  it('una vez vista sin puntaje toma el puntaje actual de la película', () => {
    expect(byTitle(records, 'Oppenheimer').watches).toEqual([{ date: '2023-07-21', rating: 4 }]);
  });

  it('puntuada sin diario: una entrada con la fecha del puntaje', () => {
    expect(byTitle(records, 'Everything Everywhere All at Once').watches).toEqual([{ date: '2022-10-10', rating: 4.5 }]);
  });

  it('vista gana sobre para ver; lo que solo está para ver, a Por Ver', () => {
    expect(byTitle(records, 'The Godfather')).toMatchObject({ status: 'completada', watches: [], year: 1972 });
    expect(byTitle(records, 'Aftersun')).toMatchObject({ status: 'por_ver', mediaType: 'movie', ids: {} });
  });
});

describe('Trakt', () => {
  const records = parseTrakt(TRAKT);

  it('el id de TMDB viene en el export', () => {
    expect(byTitle(records, 'Past Lives').ids).toEqual({ tmdb: 666277, imdb: 'tt13238346' });
  });

  it('cada vez vista cuenta, y el puntaje va a la más reciente', () => {
    expect(byTitle(records, 'Past Lives')).toMatchObject({
      status: 'completada',
      watches: [{ date: '2024-01-02T22:10:00.000Z', rating: 4.5 }, { date: '2023-06-01T20:00:00.000Z' }],
    });
  });

  it('puntuada sin vistas: vista, con la fecha del puntaje', () => {
    expect(byTitle(records, 'Barbie')).toMatchObject({
      status: 'completada',
      watches: [{ date: '2023-08-01T00:00:00.000Z', rating: 3.5 }],
    });
  });

  it('una serie trae sus episodios con fecha, del historial y de lo visto', () => {
    const severance = byTitle(records, 'Severance');
    expect(severance.status).toBe('viendo');
    expect(severance.episodes).toEqual([
      { season: 1, episode: 1, watchedAt: '2022-02-20T03:00:00.000Z' },
      { season: 1, episode: 2, watchedAt: '2022-02-21T03:00:00.000Z' },
      { season: 1, episode: 3, watchedAt: '2022-02-27T03:00:00.000Z' },
    ]);
  });

  it('el puntaje de un episodio no crea la serie, y lo que está para ver va a Por Ver', () => {
    expect(records.filter((record) => record.title === 'Severance')).toHaveLength(1);
    expect(byTitle(records, 'Aftersun')).toMatchObject({ status: 'por_ver', mediaType: 'movie', ids: { tmdb: 965150 } });
    expect(byTitle(records, 'The Bear')).toMatchObject({ status: 'por_ver', mediaType: 'tv' });
  });
});

describe('reconocer los archivos', () => {
  it('cada archivo por su contenido, y los de Letterboxd dentro del ZIP', () => {
    const zip = zipSync({
      'letterboxd-ana-2026-09-29-12-00-utc/diary.csv': strToU8(lbDiary),
      'letterboxd-ana-2026-09-29-12-00-utc/watchlist.csv': strToU8(lbWatchlist),
      'letterboxd-ana-2026-09-29-12-00-utc/profile.png': new Uint8Array([1, 2, 3]),
      '__MACOSX/._diary.csv': strToU8('basura'),
    });
    const fromZip = unzipTextFiles(zip);
    expect(fromZip.map((file) => file.name.split('/').pop()).sort()).toEqual(['diary.csv', 'watchlist.csv']);

    const parsed = parseImportFiles([
      ...fromZip,
      { name: 'ratings.csv', text: imdbRatings },
      { name: 'watchlist.json', text: traktWatchlist },
      { name: 'otra-cosa.csv', text: 'a,b\n1,2' },
    ]);
    expect(parsed.bySource).toEqual({ imdb: 3, letterboxd: 4, trakt: 2 });
    expect(parsed.skipped).toBe(1);
    expect(parsed.unknown).toEqual(['otra-cosa.csv']);
  });

  it('un CSV de Letterboxd renombrado se reconoce por sus columnas', () => {
    const parsed = parseImportFiles([{ name: 'mi-diario (1).csv', text: lbDiary }]);
    expect(parsed.bySource).toEqual({ letterboxd: 2 });
    expect(parsed.records.find((record) => record.title === 'Past Lives')?.watches).toHaveLength(2);
  });
});
