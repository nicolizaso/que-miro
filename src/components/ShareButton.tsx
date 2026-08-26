import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { ShareCardData, share } from '@/lib/shareCard';
import { cn } from '@/lib/utils';

/**
 * Botón de compartir con la hoja del sistema.
 *
 * En el celular abre el menú nativo; en escritorio, donde casi ningún navegador
 * implementa `navigator.share`, copia el texto al portapapeles y lo avisa. La
 * diferencia se resuelve adentro de `share`, así que quien usa el botón no
 * tiene que saber en qué plataforma está.
 */
export function ShareButton({
  title,
  text,
  url,
  card,
  label = 'Compartir',
  className,
}: {
  title: string;
  text: string;
  url?: string;
  card?: ShareCardData;
  label?: string;
  className?: string;
}) {
  const { showToast } = useToast();
  const [justCopied, setJustCopied] = useState(false);

  const handleShare = async () => {
    const outcome = await share({ title, text, url, card });

    if (outcome === 'copiado') {
      setJustCopied(true);
      showToast('Copiamos el link al portapapeles.');
      setTimeout(() => setJustCopied(false), 2000);
      return;
    }
    if (outcome === 'error') {
      showToast('No pudimos compartir. Copiá el link a mano.', 'error');
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border-card text-sm font-medium hover:bg-border-card transition-colors',
        className,
      )}
    >
      {justCopied ? (
        <Check size={16} className="text-status-completada" aria-hidden="true" />
      ) : (
        <Share2 size={16} aria-hidden="true" />
      )}
      {justCopied ? 'Copiado' : label}
    </button>
  );
}
