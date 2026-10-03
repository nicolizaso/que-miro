import { useState } from 'react';
import { Download } from 'lucide-react';
import { InstallSheet } from '@/components/install/InstallSheet';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useToast } from '@/contexts/ToastContext';
import { canOfferInstall } from '@/lib/install';
import { cn } from '@/lib/utils';

/**
 * "Instalar la app": instala directo donde el navegador lo permite y, en
 * iPhone, abre la guía con los pasos. Donde no hay nada que ofrecer —ya
 * instalada, o un navegador que no sabe— no aparece.
 */
export function InstallButton({
  label = 'Instalar la app',
  variant = 'primary',
  className,
}: {
  label?: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const { platform, promptInstall } = useInstallPrompt();
  const { showToast } = useToast();
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  if (!canOfferInstall(platform) && !isGuideOpen) return null;

  const handleClick = async () => {
    if (platform === 'prompt') {
      if (await promptInstall()) showToast('Listo: Qué Miro? quedó en tu pantalla de inicio.');
      return;
    }
    setIsGuideOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={cn(
          'btn px-4 py-2 text-sm',
          variant === 'primary' ? 'btn-primary' : 'btn-secondary',
          className,
        )}
      >
        <Download size={16} aria-hidden="true" />
        {label}
      </button>
      {(platform === 'ios-safari' || platform === 'ios-browser' || platform === 'ios-in-app') && (
        <InstallSheet
          platform={platform}
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
        />
      )}
    </>
  );
}
