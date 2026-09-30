import { useEffect } from 'react';
import { loadPerson, useSocialStore } from '@/hooks/useSocial';
import { Account } from '@/lib/social';

/**
 * Las tarjetas de varias cuentas, para nombrar a quien aparece en las
 * notificaciones o en las sugerencias. Cada una se lee una vez por sesión.
 */
export function usePeople(uids: string[]): Record<string, Account | null> {
  const people = useSocialStore((state) => state.people);
  const key = Array.from(new Set(uids)).sort().join(',');

  useEffect(() => {
    if (!key) return;
    for (const uid of key.split(',')) {
      if (!(uid in useSocialStore.getState().people)) void loadPerson(uid);
    }
  }, [key]);

  return people;
}
