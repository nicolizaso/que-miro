import { useRef, useState } from 'react';
import { Download, FileUp, LifeBuoy, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useMediaActions } from '@/hooks/useMediaActions';
import { AccountDeletionError, useAccountActions } from '@/hooks/useAccountActions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useMediaStore } from '@/store';
import type { ParsedBackup } from '@/lib/backup';
import {
  ImportError,
  backupFilename,
  buildBackup,
  downloadFile,
  mergeLibraries,
  parseBackup,
  toCsv,
} from '@/lib/backup';
import { clearRescue, readRescue } from '@/lib/rescue';
import { useTastePicks } from '@/hooks/useTastePicks';
import { useGoals } from '@/hooks/useGoals';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useFollowing } from '@/hooks/useFollowing';
import { useSocialSettings } from '@/hooks/useSocialSettings';
import { loadPerson, useSocial, useSocialStore } from '@/hooks/useSocial';
import { useFollowActions } from '@/hooks/useFollowActions';
import { useSocialCache } from '@/hooks/useSocialFeed';
import { MyFollows } from '@/lib/social';

/** A quiénes seguís, con el usuario si ya se sabe: para el backup. */
function followedAccountsFor(follows: MyFollows) {
  const { people } = useSocialStore.getState();
  const { activities } = useSocialCache.getState();
  return follows.outgoing.map(({ followed }) => {
    const cached = activities[followed];
    const handle = people[followed]?.handle ?? (cached && cached !== 'locked' ? cached.handle : '');
    return { uid: followed, handle };
  });
}
import { formatWatchDate } from '@/lib/dates';
import { ImportDialog } from '@/components/ImportDialog';

type PendingDialog = 'import' | 'clear' | 'delete' | null;

/**
 * Bloque de "tus datos": exportar, importar y borrar.
 *
 * La contraparte de guardar todo en la nube es poder llevárselo y poder
 * borrarlo. Sin esto la biblioteca es rehén de la app.
 */
export function DataSettings() {
  const { mediaList, collections } = useMediaStore();
  const { picks, savePicks } = useTastePicks();
  const { goals, replaceGoals } = useGoals();
  const { subscriptions, replaceSubscriptions } = useSubscriptions();
  const { following, replaceFollowing } = useFollowing();
  const { settings: socialSettings, replaceSettings } = useSocialSettings();
  const { follows, account: socialAccount } = useSocial();
  const { follow } = useFollowActions();
  const { authState } = useAuth();
  const { showToast } = useToast();
  const { saveMany } = useMediaActions();
  const { clearLibrary, deleteAccount } = useAccountActions();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingOther, setIsImportingOther] = useState(false);
  const [dialog, setDialog] = useState<PendingDialog>(null);
  const [isPending, setIsPending] = useState(false);
  // Se guarda el archivo elegido para confirmarlo antes de tocar la biblioteca.
  const [pendingImport, setPendingImport] = useState<ParsedBackup | null>(null);
  // Se lee una sola vez: es localStorage y no cambia sola mientras la pantalla
  // está abierta.
  const [rescue, setRescue] = useState(() => readRescue());

  const isEmpty = mediaList.length === 0;
  const isDemo = authState === 'demo';

  const handleExportJson = () => {
    downloadFile(
      backupFilename('json'),
      JSON.stringify(
        buildBackup(mediaList, collections, picks, goals, subscriptions, following, {
          settings: socialSettings,
          followed: followedAccountsFor(follows),
        }),
        null,
        2,
      ),
      'application/json',
    );
    showToast('Descargamos tu biblioteca en JSON.');
  };

  const handleExportCsv = () => {
    downloadFile(backupFilename('csv'), toCsv(mediaList), 'text/csv');
    showToast('Descargamos tu biblioteca en CSV.');
  };

  /** Vuelve a poner en la biblioteca la copia que quedó de una sesión anterior. */
  const restoreRescue = () => {
    if (!rescue) return;
    setPendingImport({
      media: rescue.media,
      collections: rescue.collections,
      picks: null,
      goals: null,
      subscriptions: null,
      following: null,
      social: null,
      followedAccounts: [],
      skipped: 0,
    });
    setDialog('import');
  };

  const discardRescue = () => {
    clearRescue();
    setRescue(null);
    showToast('Descartamos la copia guardada en este dispositivo.');
  };

  const handleFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // El input se limpia siempre: si no, elegir el mismo archivo dos veces
    // seguidas no dispara el evento la segunda.
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = parseBackup(await file.text());
      if (parsed.media.length === 0) {
        showToast('El archivo no tiene títulos para importar.', 'error');
        return;
      }
      setPendingImport(parsed);
      setDialog('import');
    } catch (error) {
      showToast(
        error instanceof ImportError
          ? error.message
          : 'No pudimos leer el archivo.',
        'error',
      );
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setIsPending(true);
    try {
      const { media, added, updated } = mergeLibraries(
        mediaList,
        pendingImport.media,
      );
      // Solo se re-escriben los que cambian: importar un backup casi idéntico
      // no debería costar una escritura por título.
      const touched = media.filter((item) => {
        const existing = mediaList.find((m) => m.tmdbId === item.tmdbId);
        return !existing || existing.updatedAt !== item.updatedAt;
      });
      await saveMany(touched);

      // El cuestionario del archivo solo pisa al de acá si es más nuevo, que
      // es la misma regla con la que se resuelve un título repetido.
      const incomingPicks = pendingImport.picks;
      if (
        incomingPicks &&
        Date.parse(incomingPicks.updatedAt) > Date.parse(picks.updatedAt)
      ) {
        savePicks(incomingPicks);
      }
      // Y las metas, igual.
      const incomingGoals = pendingImport.goals;
      if (
        incomingGoals &&
        Date.parse(incomingGoals.updatedAt) > Date.parse(goals.updatedAt)
      ) {
        replaceGoals(incomingGoals);
      }
      const incomingSubscriptions = pendingImport.subscriptions;
      if (
        incomingSubscriptions &&
        Date.parse(incomingSubscriptions.updatedAt) > Date.parse(subscriptions.updatedAt)
      ) {
        replaceSubscriptions(incomingSubscriptions);
      }
      const incomingFollowing = pendingImport.following;
      if (
        incomingFollowing &&
        Date.parse(incomingFollowing.updatedAt) > Date.parse(following.updatedAt)
      ) {
        replaceFollowing(incomingFollowing);
      }
      const incomingSocial = pendingImport.social;
      if (incomingSocial && Date.parse(incomingSocial.updatedAt) > Date.parse(socialSettings.updatedAt)) {
        replaceSettings(incomingSocial);
      }
      // A quienes seguías se los vuelve a seguir, si ya tenés usuario. Los que
      // ya seguís, o que borraron su cuenta, se saltean.
      if (socialAccount && pendingImport.followedAccounts.length) {
        const current = new Set(follows.outgoing.map((f) => f.followed));
        for (const { uid } of pendingImport.followedAccounts) {
          if (current.has(uid) || uid === socialAccount.uid) continue;
          const target = await loadPerson(uid);
          if (target) follow(target);
        }
      }

      showToast(
        added || updated
          ? `Importamos ${added} título${added === 1 ? '' : 's'} nuevo${
              added === 1 ? '' : 's'
            }${updated ? ` y actualizamos ${updated}` : ''}.`
          : 'Tu biblioteca ya estaba al día: no hubo cambios.',
      );

      // La copia de rescate cumplió: ya está de vuelta en la biblioteca.
      if (rescue) {
        clearRescue();
        setRescue(null);
      }
    } finally {
      setIsPending(false);
      setPendingImport(null);
      setDialog(null);
    }
  };

  const runDestructive = async (action: () => Promise<void>, done: string) => {
    setIsPending(true);
    try {
      await action();
      showToast(done);
      setDialog(null);
    } catch (error) {
      showToast(
        error instanceof AccountDeletionError
          ? error.message
          : 'No pudimos completar la operación.',
        'error',
      );
      setDialog(null);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-section">Tus datos</h2>
        <p className="text-sm text-text-muted">
          Tu biblioteca es tuya: llevatela cuando quieras.
        </p>
      </div>

      {rescue && (
        <div className="bg-accent/10 border border-accent/40 rounded-surface p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <LifeBuoy
              size={18}
              className="text-accent shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-section text-accent">
                Hay una biblioteca guardada en este dispositivo
              </h3>
              <p className="text-sm text-text-muted">
                Son {rescue.media.length} título
                {rescue.media.length === 1 ? '' : 's'} de una sesión anterior
                que nunca llegaron al servidor, del{' '}
                {formatWatchDate(rescue.savedAt)}. Se pueden sumar a la
                biblioteca actual.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={restoreRescue}
              disabled={isDemo}
              title={isDemo ? 'No disponible mientras estás en el demo' : undefined}
              className="btn btn-primary flex-1 py-3 px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Recuperar esos títulos
            </button>
            <button
              type="button"
              onClick={discardRescue}
              className="flex-1 py-3 px-4 rounded-control border border-border-card text-sm font-medium text-text-muted hover:bg-border-card hover:text-text-main transition-colors"
            >
              Descartar la copia
            </button>
          </div>
        </div>
      )}

      <div className="surface p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={isEmpty}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-control border border-border-card text-sm font-medium hover:bg-border-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} aria-hidden="true" />
            Exportar JSON
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isEmpty}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-control border border-border-card text-sm font-medium hover:bg-border-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} aria-hidden="true" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDemo}
            title={isDemo ? 'No disponible mientras estás en el demo' : undefined}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-control border border-border-card text-sm font-medium hover:bg-border-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileUp size={16} aria-hidden="true" />
            Importar
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChosen}
          className="sr-only"
          aria-label="Elegir archivo de backup"
        />

        <p className="text-xs text-text-subtle">
          El JSON se puede volver a importar; el CSV es para abrir en una
          planilla.
        </p>

        <button
          type="button"
          onClick={() => setIsImportingOther(true)}
          disabled={isDemo}
          title={isDemo ? 'No disponible mientras estás en el demo' : undefined}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-control border border-border-card text-sm font-medium hover:bg-border-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileUp size={16} aria-hidden="true" />
          Importar de Letterboxd, IMDb o Trakt
        </button>
      </div>

      {isImportingOther && (
        <ImportDialog isOpen onClose={() => setIsImportingOther(false)} />
      )}

      <div className="surface p-4 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setDialog('clear')}
          disabled={isEmpty || isDemo}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-control border border-border-card text-sm font-medium text-text-muted hover:bg-border-card hover:text-text-main transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={16} aria-hidden="true" />
          Vaciar mi biblioteca
        </button>

        {authState === 'authenticated' && (
          <button
            type="button"
            onClick={() => setDialog('delete')}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-control border border-accent/40 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
          >
            <Trash2 size={16} aria-hidden="true" />
            Eliminar mi cuenta
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={dialog === 'import'}
        title="Importar biblioteca"
        confirmLabel="Importar"
        isPending={isPending}
        onConfirm={confirmImport}
        onClose={() => {
          setPendingImport(null);
          setDialog(null);
        }}
        description={
          <>
            <p>
              El archivo tiene{' '}
              <strong className="text-text-main">
                {pendingImport?.media.length ?? 0} título
                {pendingImport?.media.length === 1 ? '' : 's'}
              </strong>
              . Se suman a tu biblioteca; ante un repetido queda el que se
              modificó más tarde.
            </p>
            {!!pendingImport?.skipped && (
              <p className="mt-2">
                {pendingImport.skipped} entrada
                {pendingImport.skipped === 1 ? '' : 's'} del archivo{' '}
                {pendingImport.skipped === 1 ? 'está' : 'están'} incompleta
                {pendingImport.skipped === 1 ? '' : 's'} y se{' '}
                {pendingImport.skipped === 1 ? 'descarta' : 'descartan'}.
              </p>
            )}
          </>
        }
      />

      <ConfirmDialog
        isOpen={dialog === 'clear'}
        title="Vaciar la biblioteca"
        confirmLabel="Vaciar"
        destructive
        isPending={isPending}
        onConfirm={() =>
          runDestructive(clearLibrary, 'Tu biblioteca quedó vacía.')
        }
        onClose={() => setDialog(null)}
        description={
          <p>
            Se borran los {mediaList.length} títulos que tenés guardados, con sus
            reseñas. Esto no se puede deshacer: si querés conservarlos,
            exportalos antes.
          </p>
        }
      />

      <ConfirmDialog
        isOpen={dialog === 'delete'}
        title="Eliminar la cuenta"
        confirmLabel="Eliminar cuenta"
        destructive
        isPending={isPending}
        onConfirm={() =>
          runDestructive(deleteAccount, 'Eliminamos tu cuenta y todos sus datos.')
        }
        onClose={() => setDialog(null)}
        description={
          <p>
            Se elimina tu cuenta junto con toda tu biblioteca y tus reseñas, en
            este dispositivo y en la nube. No hay vuelta atrás.
          </p>
        }
      />
    </section>
  );
}
