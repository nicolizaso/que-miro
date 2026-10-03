import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, LogIn, Shuffle, Sparkles } from 'lucide-react';
import { TitleCarousel } from '@/components/TitleCarousel';
import { useAuth } from '@/contexts/AuthContext';
import { useTmdbList } from '@/hooks/useTmdbList';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { usePeopleBackfill } from '@/hooks/usePeopleBackfill';
import { MIN_RESULTS, TitleRegistry } from '@/lib/feed';
import { isFirebaseConfigured } from '@/lib/firebase';
import { isNewVisitor } from '@/lib/landing';
import { FeedBlock } from '@/lib/recipes';
import { useMediaStore } from '@/store';

/** Cómo terminó una fila: es lo único que la vista necesita saber de adentro. */
type RowStatus = 'ok' | 'error';

/**
 * Una fila del feed.
 *
 * Pide sus títulos recién cuando se monta —o sea, cuando la tanda a la que
 * pertenece entró en pantalla—, y los reclama contra el registro para no
 * mostrar lo que otra fila ya mostró.
 *
 * Una fila que falla o que queda flaca no se dibuja. Es deliberado: el feed
 * tiene veinte filas más para poner en su lugar, y una fila con dos pósters o
 * con un mensaje de error adentro es peor que una fila menos.
 */
function FeedRow({
  block,
  registry,
  onSettled,
}: {
  block: FeedBlock;
  registry: TitleRegistry;
  onSettled: (id: string, status: RowStatus) => void;
}) {
  const { results, isLoading, error } = useTmdbList(block.fetch, [block.id]);

  const claimed = useMemo(
    () => registry.claim(block.id, results, block.local),
    [registry, block.id, block.local, results],
  );

  useEffect(() => {
    if (isLoading) return;
    onSettled(block.id, error ? 'error' : 'ok');
  }, [isLoading, error, block.id, onSettled]);

  if (!isLoading && claimed.length < (block.minResults ?? MIN_RESULTS)) {
    return null;
  }

  return (
    <TitleCarousel
      title={block.title}
      subtitle={block.subtitle}
      avatar={block.avatar}
      results={claimed}
      isLoading={isLoading}
    />
  );
}

/**
 * La bienvenida de quien abrió la app sin cuenta y sin nada guardado.
 *
 * Explorar es donde cae la primera vez: cuenta que se puede guardar sin
 * cuenta y le deja la puerta a quien ya tiene una. Se va sola cuando guarda
 * algo.
 */
function Welcome() {
  return (
    <section
      aria-labelledby="bienvenida"
      className="surface p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <h2 id="bienvenida" className="text-section mb-1">
          Armá tu biblioteca, sin cuenta
        </h2>
        <p className="text-sm text-text-muted max-w-md">
          Lo que guardes queda en este dispositivo. Si después iniciás sesión,
          pasa solo a tu cuenta.
        </p>
      </div>
      {isFirebaseConfigured && (
        <Link to="/login" className="btn btn-secondary px-4 py-2 text-sm shrink-0">
          <LogIn size={16} aria-hidden="true" />
          Ya tengo cuenta
        </Link>
      )}
    </section>
  );
}

/**
 * Punto de entrada para descubrir qué mirar.
 *
 * Antes eran cuatro filas fijas y una sola idea —"porque viste X"—, iguales en
 * cada visita por más que la biblioteca cambiara. Ahora hay treinta y cuatro
 * recetas que se arman con dos cosas: lo que la biblioteca sabe de vos —qué
 * puntuaste alto, quién dirigió eso, con quién te cruzaste dos veces, qué
 * dejaste por la mitad— y lo que contestaste en "Contanos de vos", que es lo
 * único que funciona el primer día. Las que no tienen con qué armarse no
 * aparecen.
 *
 * El orden se baraja en cada visita y las filas entran de a tandas mientras se
 * scrollea, así que la pestaña no se termina nunca de la misma manera.
 */
export function ExploreView() {
  const mediaList = useMediaStore((state) => state.mediaList);
  usePeopleBackfill(mediaList);
  const { authState } = useAuth();
  const isNew = isNewVisitor({ isGuest: authState === 'guest', librarySize: mediaList.length });

  const { blocks, hasMore, loadMore, shuffle, registry, isPersonal, hasAnswers } =
    useExploreFeed();

  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleSettled = useCallback((id: string, status: RowStatus) => {
    setStatuses((current) =>
      current[id] === status ? current : { ...current, [id]: status },
    );
  }, []);

  const handleShuffle = () => {
    setStatuses({});
    shuffle();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Scroll infinito. El margen generoso hace que la tanda siguiente empiece a
  // cargar antes de que se vea el final, así el scroll no se frena nunca.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '800px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, blocks.length]);

  const settled = Object.values(statuses);
  // Solo si todo lo que terminó, terminó mal: con una sola fila viva —incluidas
  // las que salen de la propia biblioteca— no hay nada que avisar.
  const everythingFailed =
    settled.length > 0 && settled.every((status) => status === 'error');

  return (
    <div className="flex flex-col gap-10 w-full max-w-5xl mx-auto px-4 pt-8 pb-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display mb-1">Explorar</h1>
          <p className="text-text-muted">
            {isPersonal
              ? 'Armado con lo que viste, lo que puntuaste y lo que dejaste a medias.'
              : 'Qué se está viendo, y qué podría gustarte a vos.'}
          </p>
          {!isPersonal && (
            <p className="text-sm text-text-subtle mt-2 max-w-md">
              Puntuá lo que ya viste y esta pestaña se rearma sola: otras
              películas del director, de los actores y de los géneros que te
              gustan.
            </p>
          )}

          {/* El atajo para quien todavía no tiene biblioteca que mirar, y el
              recordatorio para quien contestó la mitad: es la única forma de
              enterarse de que el cuestionario existe sin ir a buscarlo. */}
          {!hasAnswers && (
            <Link
              to="/perfil/gustos"
              className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-accent hover:underline"
            >
              <Sparkles size={15} aria-hidden="true" />
              Contanos tus favoritos y sumamos filas nuevas
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={handleShuffle}
          className="shrink-0 flex items-center gap-2 px-3 h-10 rounded-control border border-border-control text-sm font-medium hover:bg-bg-card transition-colors active:scale-95"
        >
          <Shuffle size={16} aria-hidden="true" />
          Barajar
        </button>
      </header>

      {isNew && <Welcome />}

      {everythingFailed && (
        <div
          role="alert"
          className="flex flex-col items-center text-center gap-3 py-16 text-text-muted"
        >
          <Compass className="text-border-card w-12 h-12" aria-hidden="true" />
          <p className="max-w-sm">
            No pudimos conectarnos con TMDB. Tu biblioteca sigue funcionando
            igual: probá de nuevo en un rato.
          </p>
        </div>
      )}

      {blocks.map((block) => (
        <FeedRow
          key={block.id}
          block={block}
          registry={registry}
          onSettled={handleSettled}
        />
      ))}

      {/* El observador dispara la tanda siguiente al acercarse; el botón hace
          lo mismo con el teclado y cuando el navegador no tiene observador. */}
      <div ref={sentinelRef} className="flex flex-col items-center gap-2 pb-6">
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            className="px-4 h-10 rounded-control border border-border-control text-sm font-medium hover:bg-bg-card transition-colors"
          >
            Cargar más filas
          </button>
        ) : (
          <p className="text-sm text-text-subtle">
            Hasta acá llegamos. Probá barajar, o puntuá algo más y volvé.
          </p>
        )}
      </div>
    </div>
  );
}
