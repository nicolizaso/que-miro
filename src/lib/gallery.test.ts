import { describe, expect, it } from 'vitest';
import { pickGalleryImages, stepIndex } from './gallery';
import type { TMDbImage } from './tmdb';

function image(path: string, vote_average = 0, vote_count = 0): TMDbImage {
  return { file_path: path, width: 1920, height: 1080, vote_average, vote_count };
}

describe('pickGalleryImages', () => {
  it('ordena por puntaje y, a igual puntaje, por cantidad de votos', () => {
    const picked = pickGalleryImages([
      image('/a.jpg', 5.2, 3),
      image('/b.jpg', 5.6, 1),
      image('/c.jpg', 5.2, 10),
    ]);
    expect(picked.map((i) => i.file_path)).toEqual(['/b.jpg', '/c.jpg', '/a.jpg']);
  });

  it('sin votos respeta el orden de TMDB', () => {
    const picked = pickGalleryImages([image('/x.jpg'), image('/y.jpg'), image('/z.jpg')]);
    expect(picked.map((i) => i.file_path)).toEqual(['/x.jpg', '/y.jpg', '/z.jpg']);
  });

  it('saca la que ya está de fondo en la ficha y las repetidas', () => {
    const picked = pickGalleryImages(
      [image('/fondo.jpg', 9), image('/a.jpg'), image('/a.jpg'), image('/b.jpg')],
      '/fondo.jpg',
    );
    expect(picked.map((i) => i.file_path)).toEqual(['/a.jpg', '/b.jpg']);
  });

  it('corta en el máximo', () => {
    const many = Array.from({ length: 30 }, (_, n) => image(`/${n}.jpg`));
    expect(pickGalleryImages(many)).toHaveLength(20);
    expect(pickGalleryImages(many, null, 5)).toHaveLength(5);
  });

  it('sin imágenes devuelve una lista vacía', () => {
    expect(pickGalleryImages([], '/fondo.jpg')).toEqual([]);
  });
});

describe('stepIndex', () => {
  it('avanza y retrocede', () => {
    expect(stepIndex(1, 1, 5)).toBe(2);
    expect(stepIndex(1, -1, 5)).toBe(0);
  });

  it('da la vuelta en las puntas', () => {
    expect(stepIndex(4, 1, 5)).toBe(0);
    expect(stepIndex(0, -1, 5)).toBe(4);
  });

  it('sin fotos se queda en cero', () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
