import { describe, expect, it } from 'vitest';
import { CARD_HEIGHT, CARD_WIDTH, buildCardSvg } from './shareCard';

describe('buildCardSvg', () => {
  it('sale un SVG con las medidas de una imagen para redes', () => {
    const svg = buildCardSvg({ eyebrow: 'Te tocó', headline: 'Matrix' });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${CARD_WIDTH}"`);
    expect(svg).toContain(`height="${CARD_HEIGHT}"`);
  });

  it('escapa el texto, que en XML no perdona', () => {
    // Un título con `&` rompería el documento entero si no se escapara.
    const svg = buildCardSvg({
      eyebrow: 'Te tocó',
      headline: 'Tom & Jerry <script>',
    });

    expect(svg).toContain('Tom &amp; Jerry &lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('parte los títulos largos en renglones', () => {
    const svg = buildCardSvg({
      eyebrow: 'Te tocó',
      headline: 'Todo en Todas Partes al Mismo Tiempo',
    });

    const lines = svg.match(/<tspan/g) ?? [];
    expect(lines.length).toBeGreaterThan(1);
  });

  it('corta con puntos suspensivos lo que no entra', () => {
    const svg = buildCardSvg({
      eyebrow: 'Te tocó',
      headline:
        'Un título absurdamente largo que no hay forma de que entre en tres renglones de una tarjeta para compartir',
    });

    expect(svg).toContain('…');
    expect((svg.match(/<tspan/g) ?? []).length).toBeLessThanOrEqual(3);
  });

  it('incluye la línea de apoyo y las estadísticas', () => {
    const svg = buildCardSvg({
      eyebrow: 'Mi año',
      headline: '2026',
      subline: '42 títulos',
      stats: [
        { value: '42', label: 'vistas' },
        { value: '4,3', label: 'promedio' },
      ],
    });

    expect(svg).toContain('42 títulos');
    expect(svg).toContain('promedio');
  });

  it('nunca pone más de tres estadísticas', () => {
    const svg = buildCardSvg({
      eyebrow: 'x',
      headline: 'y',
      stats: [
        { value: '1', label: 'a' },
        { value: '2', label: 'b' },
        { value: '3', label: 'c' },
        { value: '4', label: 'd' },
      ],
    });

    expect(svg).not.toContain('>d<');
  });

  it('pone el ojo de arriba en mayúsculas', () => {
    expect(buildCardSvg({ eyebrow: 'Te tocó', headline: 'x' })).toContain(
      'TE TOCÓ',
    );
  });
});

describe('la tarjeta de reseña para historias', () => {
  it('es vertical y lleva la cita y el puntaje', async () => {
    const { reviewCard, cardSize, STORY_HEIGHT, STORY_WIDTH } = await import('./shareCard');
    const card = reviewCard({ author: 'Ana', title: 'Past Lives', rating: 4.5, text: 'Me partió & me armó', own: false });
    expect(cardSize(card)).toEqual({ width: STORY_WIDTH, height: STORY_HEIGHT });
    const svg = buildCardSvg(card);
    expect(svg).toContain(`height="${STORY_HEIGHT}"`);
    expect(svg).toContain('LA RESEÑA DE ANA');
    expect(svg).toContain('4,5 ★');
    expect(svg).toContain('me armó');
    expect(svg).toContain('&amp;');
  });
});
