import { useEffect, useState } from 'react';
import { ExternalLink, Globe, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaStore } from '@/store';
import { PublishError, usePublishProfile } from '@/hooks/usePublicProfile';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ShareButton } from '@/components/ShareButton';
import { SLUG_MAX, toSlug } from '@/lib/publicProfile';
import { formatDuration, summarize } from '@/lib/stats';

/**
 * Publicar la biblioteca propia en una dirección compartible.
 *
 * Lo que se publica es una instantánea, no una ventana a los datos en vivo, así
 * que la UI lo dice y ofrece volver a publicar cuando quedó vieja. Es más
 * trabajo para quien comparte, pero deja claro qué está mostrando.
 */
export function PublicProfileSettings() {
  const { user, authState } = useAuth();
  const mediaList = useMediaStore((state) => state.mediaList);
  const { showToast } = useToast();
  const { slug, isLoading, canPublish, publish, unpublish } = usePublishProfile();

  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);

  // La sugerencia sale del nombre de la cuenta, y solo mientras no haya nada
  // escrito: si la persona ya empezó a escribir, no se le pisa.
  useEffect(() => {
    if (slug) {
      setDraft(slug);
      return;
    }
    setDraft((current) =>
      current || toSlug(user?.displayName || user?.email?.split('@')[0] || ''),
    );
  }, [slug, user]);

  if (authState !== 'authenticated') return null;

  const summary = summarize(mediaList);
  const publicUrl =
    slug && typeof window !== 'undefined'
      ? `${window.location.origin}/u/${slug}`
      : '';

  const handlePublish = async () => {
    setIsSaving(true);
    try {
      const saved = await publish(draft);
      showToast(
        slug === saved
          ? 'Actualizamos tu perfil público.'
          : 'Publicamos tu perfil.',
      );
    } catch (error) {
      showToast(
        error instanceof PublishError
          ? error.message
          : 'No pudimos publicar tu perfil.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnpublish = async () => {
    try {
      await unpublish();
      showToast('Tu perfil ya no es público.');
    } catch (error) {
      showToast(
        error instanceof PublishError ? error.message : 'No pudimos despublicarlo.',
        'error',
      );
    } finally {
      setIsConfirmingRemoval(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="font-bold text-lg">Perfil público</h3>
        <p className="text-sm text-text-muted">
          Una página con tus estadísticas y reseñas, para compartir.
        </p>
      </div>

      <div className="bg-bg-card border border-border-card rounded-2xl p-4 flex flex-col gap-4">
        {!canPublish ? (
          <p className="text-sm text-text-subtle">
            Necesitás una cuenta para publicar tu perfil.
          </p>
        ) : isLoading ? (
          <p className="flex items-center gap-2 text-sm text-text-subtle">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Cargando...
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="slug" className="text-sm font-medium">
                Tu dirección
              </label>
              <div className="flex items-center gap-0 rounded-xl border border-border-card bg-bg-main overflow-hidden focus-within:border-accent transition-colors">
                <span className="pl-3 text-sm text-text-subtle shrink-0">/u/</span>
                <input
                  id="slug"
                  value={draft}
                  onChange={(e) => setDraft(toSlug(e.target.value))}
                  maxLength={SLUG_MAX}
                  placeholder="tu-nombre"
                  className="flex-1 bg-transparent px-1 py-3 text-sm text-text-main placeholder:text-text-subtle focus:outline-none"
                />
              </div>
              <p className="text-xs text-text-subtle">
                Entre 3 y 24 caracteres: letras, números y guiones.
              </p>
            </div>

            {slug ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isSaving || !draft}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-accent text-accent-contrast text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw size={16} aria-hidden="true" />
                    )}
                    {draft === slug ? 'Actualizar' : 'Cambiar dirección'}
                  </button>

                  <ShareButton
                    className="flex-1"
                    label="Compartir"
                    title="Mi biblioteca en Qué Miro?"
                    text={`Mirá mi biblioteca: ${summary.totalWatches} vistas, ${formatDuration(
                      summary.minutes,
                    )} mirando.`}
                    url={publicUrl}
                    card={{
                      eyebrow: 'Mi biblioteca',
                      headline: user?.displayName || 'Qué Miro?',
                      subline: publicUrl.replace(/^https?:\/\//, ''),
                      stats: [
                        { value: String(summary.totalWatches), label: 'vistas' },
                        {
                          value: summary.averageRating.toFixed(1),
                          label: 'promedio',
                        },
                        {
                          value: formatDuration(summary.minutes),
                          label: 'mirando',
                        },
                      ],
                    }}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link
                    to={`/u/${slug}`}
                    className="flex items-center gap-1.5 text-accent hover:underline min-w-0"
                  >
                    <Globe size={14} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">/u/{slug}</span>
                    <ExternalLink size={12} aria-hidden="true" className="shrink-0" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingRemoval(true)}
                    className="text-text-muted hover:text-accent transition-colors shrink-0"
                  >
                    Despublicar
                  </button>
                </div>

                <p className="text-xs text-text-subtle">
                  Es una copia de tus datos, no una ventana en vivo: cuando
                  agregues reseñas, tocá "Actualizar" para reflejarlas.
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={isSaving || !draft}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-accent text-accent-contrast text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Globe size={16} aria-hidden="true" />
                )}
                Publicar mi perfil
              </button>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={isConfirmingRemoval}
        title="Despublicar el perfil"
        confirmLabel="Despublicar"
        destructive
        onConfirm={handleUnpublish}
        onClose={() => setIsConfirmingRemoval(false)}
        description={
          <p>
            La página deja de estar disponible y el link que hayas compartido
            deja de funcionar. Tu biblioteca no se toca.
          </p>
        }
      />
    </section>
  );
}
