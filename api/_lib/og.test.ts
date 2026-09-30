import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, firestoreDocumentUrl, setMeta, withPageMeta } from './og';

const HTML = `<!doctype html><html><head>
<title>Qué Miro? — Tu biblioteca</title>
<meta
  name="description"
  content="La de siempre."
/>
<meta property="og:title" content="Qué Miro?" />
<meta property="og:description" content="La de siempre." />
<meta property="og:image" content="/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Qué Miro?" />
<meta name="twitter:description" content="La de siempre." />
<meta name="twitter:image" content="/og-image.png" />
</head><body></body></html>`;

describe('las páginas públicas', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reemplazan título, descripción e imagen, escapando lo que viene del documento', () => {
    const html = withPageMeta(HTML, {
      title: 'Terror "del bueno" <3',
      description: 'Una lista de Ana & Beto.',
      image: { url: 'https://image.tmdb.org/t/p/w780/p.jpg', width: 780, height: 1170 },
    });

    expect(html).toContain('<title>Terror &quot;del bueno&quot; &lt;3</title>');
    expect(html).toContain('content="Una lista de Ana &amp; Beto."');
    expect(html).toContain('<meta property="og:image" content="https://image.tmdb.org/t/p/w780/p.jpg" />');
    expect(html).toContain('<meta property="og:image:height" content="1170" />');
    // Vertical: la tarjeta chica, que no la recorta.
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
  });

  it('sin imagen propia queda la de siempre', () => {
    const html = withPageMeta(HTML, { title: 'Algo', description: 'Algo más.' });
    expect(html).toContain('content="/og-image.png"');
    expect(html).toContain('content="summary_large_image"');
  });

  it('un meta que no existe no rompe nada', () => {
    expect(setMeta('<head></head>', 'name', 'description', 'x')).toBe('<head></head>');
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('leen de la base que use la app', () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'que-miro');
    vi.stubEnv('VITE_FIREBASE_DATABASE_ID', '');
    expect(firestoreDocumentUrl('public_lists/abc')).toBe(
      'https://firestore.googleapis.com/v1/projects/que-miro/databases/(default)/documents/public_lists/abc',
    );
    vi.stubEnv('VITE_FIREBASE_DATABASE_ID', 'otra');
    expect(firestoreDocumentUrl('public_lists/abc')).toContain('/databases/otra/documents/');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    expect(firestoreDocumentUrl('public_lists/abc')).toBeNull();
  });
});

describe('accountMeta', () => {
  it('una cuenta privada se nombra, sin nada de su biblioteca', async () => {
    const { accountMeta } = await import('./og');
    expect(accountMeta('ana', { displayName: 'Ana', isPrivate: true, bio: 'Terror' })).toEqual({
      title: 'Ana (@ana) — Qué Miro?',
      description: 'Cuenta privada en Qué Miro?.',
    });
    expect(accountMeta('ana', { displayName: 'Ana', isPrivate: false, bio: 'Terror' }).description).toBe('Terror');
  });
});
