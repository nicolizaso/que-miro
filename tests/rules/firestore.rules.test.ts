import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RulesTestContext,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Las reglas de lo social, contra el emulador de Firestore
 * (`npm run test:rules`).
 *
 * Son la única barrera real: la app puede equivocarse o estar vieja en otro
 * dispositivo, y alguien puede escribirle a Firestore sin pasar por la app.
 * Por eso cada caso prueba lo que se permite y, sobre todo, lo que no.
 */

let env: RulesTestEnvironment;

// Cada rechazo esperado lo loguea el SDK como error: sin esto la salida
// entierra el resultado.
setLogLevel('silent');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-que-miro',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const NOW = '2026-09-30T12:00:00.000Z';

function account(uid: string, handle: string, isPrivate = false) {
  return {
    uid,
    handle,
    displayName: handle.toUpperCase(),
    bio: '',
    avatarPath: null,
    top4: [],
    private: isPrivate,
    followers: 0,
    following: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function activity(uid: string) {
  return { uid, handle: uid, displayName: uid, avatarPath: null, updatedAt: NOW, events: [], watching: [], library: [], watchlist: [], lists: [], reactions: {} };
}

/** Siembra sin reglas: cuentas, usuarios y actividad ya existentes. */
async function seed(fn: (ctx: RulesTestContext) => Promise<void>) {
  await env.withSecurityRulesDisabled(fn);
}

async function seedAccount(uid: string, handle: string, isPrivate = false) {
  await seed(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `handles/${handle}`), { uid, createdAt: NOW });
    await setDoc(doc(db, `accounts/${uid}`), account(uid, handle, isPrivate));
    await setDoc(doc(db, `activity/${uid}`), activity(uid));
  });
}

async function seedFollow(follower: string, followed: string, status: 'pending' | 'accepted') {
  await seed(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `follows/${follower}_${followed}`), {
      follower,
      followed,
      status,
      createdAt: NOW,
    });
  });
}

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('handles y accounts', () => {
  it('crea usuario y cuenta en el mismo lote', async () => {
    const db = as('ana');
    const batch = writeBatch(db);
    batch.set(doc(db, 'handles/ana'), { uid: 'ana', createdAt: NOW });
    batch.set(doc(db, 'accounts/ana'), account('ana', 'ana'));
    await assertSucceeds(batch.commit());
  });

  it('no deja declarar un usuario ajeno en la cuenta', async () => {
    await seedAccount('beto', 'beto');
    await assertFails(setDoc(doc(as('ana'), 'accounts/ana'), account('ana', 'beto')));
  });

  it('no deja tomar un usuario que ya existe', async () => {
    await seedAccount('beto', 'beto');
    await assertFails(setDoc(doc(as('ana'), 'handles/beto'), { uid: 'ana', createdAt: NOW }));
  });

  it('no deja tomar la dirección del perfil público de otra cuenta', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'public_profiles/beto'), { slug: 'beto', uid: 'beto' });
    });
    await assertFails(setDoc(doc(as('ana'), 'handles/beto'), { uid: 'ana', createdAt: NOW }));
    // La propia, sí: es como el usuario hereda la dirección de siempre.
    await assertSucceeds(setDoc(doc(as('beto'), 'handles/beto'), { uid: 'beto', createdAt: NOW }));
  });

  it('rechaza usuarios con forma inválida', async () => {
    await assertFails(setDoc(doc(as('ana'), 'handles/Ana_1'), { uid: 'ana', createdAt: NOW }));
    await assertFails(setDoc(doc(as('ana'), 'handles/an'), { uid: 'ana', createdAt: NOW }));
  });

  it('la tarjeta se lee sin sesión, de a una', async () => {
    await seedAccount('ana', 'ana', true);
    await assertSucceeds(getDoc(doc(anon(), 'accounts/ana')));
    await assertSucceeds(getDoc(doc(anon(), 'handles/ana')));
    await assertFails(getDocs(collection(anon(), 'accounts')));
    await assertFails(getDocs(collection(anon(), 'handles')));
  });

  it('nadie edita la cuenta de otro', async () => {
    await seedAccount('ana', 'ana');
    await assertFails(setDoc(doc(as('beto'), 'accounts/ana'), account('ana', 'ana')));
  });
});

describe('follows', () => {
  beforeEach(async () => {
    await seedAccount('ana', 'ana');
    await seedAccount('beto', 'beto', true);
  });

  it('seguir una cuenta pública entra aceptado', async () => {
    const data = { follower: 'beto', followed: 'ana', status: 'accepted', createdAt: NOW };
    await assertSucceeds(setDoc(doc(as('beto'), 'follows/beto_ana'), data));
  });

  it('a una cuenta pública no se le manda "pending", ni a una privada "accepted"', async () => {
    await assertFails(
      setDoc(doc(as('beto'), 'follows/beto_ana'), { follower: 'beto', followed: 'ana', status: 'pending', createdAt: NOW }),
    );
    await assertFails(
      setDoc(doc(as('ana'), 'follows/ana_beto'), { follower: 'ana', followed: 'beto', status: 'accepted', createdAt: NOW }),
    );
    await assertSucceeds(
      setDoc(doc(as('ana'), 'follows/ana_beto'), { follower: 'ana', followed: 'beto', status: 'pending', createdAt: NOW }),
    );
  });

  it('nadie sigue en nombre de otro', async () => {
    await seedAccount('caro', 'caro');
    await assertFails(
      setDoc(doc(as('caro'), 'follows/beto_ana'), { follower: 'beto', followed: 'ana', status: 'accepted', createdAt: NOW }),
    );
  });

  it('sin cuenta propia no se sigue a nadie', async () => {
    await assertFails(
      setDoc(doc(as('dani'), 'follows/dani_ana'), { follower: 'dani', followed: 'ana', status: 'accepted', createdAt: NOW }),
    );
  });

  it('quien te bloqueó no te deja seguirlo', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/blocks/beto'), { at: NOW });
    });
    await assertFails(
      setDoc(doc(as('beto'), 'follows/beto_ana'), { follower: 'beto', followed: 'ana', status: 'accepted', createdAt: NOW }),
    );
  });

  it('solo quien recibe la solicitud la acepta', async () => {
    await seedFollow('ana', 'beto', 'pending');
    await assertFails(updateDoc(doc(as('ana'), 'follows/ana_beto'), { status: 'accepted', acceptedAt: NOW }));
    await assertSucceeds(updateDoc(doc(as('beto'), 'follows/ana_beto'), { status: 'accepted', acceptedAt: NOW }));
  });

  it('aceptar no cambia nada más', async () => {
    await seedFollow('ana', 'beto', 'pending');
    await assertFails(
      updateDoc(doc(as('beto'), 'follows/ana_beto'), { status: 'accepted', acceptedAt: NOW, followed: 'caro' }),
    );
  });

  it('cualquiera de los dos la borra; un tercero no', async () => {
    await seedAccount('caro', 'caro');
    await seedFollow('ana', 'beto', 'accepted');
    await assertFails(deleteDoc(doc(as('caro'), 'follows/ana_beto')));
    await assertSucceeds(deleteDoc(doc(as('beto'), 'follows/ana_beto')));
  });

  it('las listas de seguidores solo las ven las dos partes', async () => {
    await seedAccount('caro', 'caro');
    await seedFollow('ana', 'beto', 'accepted');
    await assertSucceeds(getDocs(query(collection(as('beto'), 'follows'), where('followed', '==', 'beto'))));
    await assertSucceeds(getDocs(query(collection(as('ana'), 'follows'), where('follower', '==', 'ana'))));
    await assertFails(getDocs(query(collection(as('caro'), 'follows'), where('followed', '==', 'beto'))));
    // "¿Ya lo sigo?" antes de que exista la relación.
    await assertSucceeds(getDoc(doc(as('caro'), 'follows/caro_ana')));
    await assertFails(getDoc(doc(as('caro'), 'follows/ana_beto')));
  });
});

describe('activity', () => {
  beforeEach(async () => {
    await seedAccount('ana', 'ana');
    await seedAccount('beto', 'beto', true);
    await seedAccount('caro', 'caro');
  });

  it('de una cuenta pública la lee cualquiera con sesión, sin sesión nadie', async () => {
    await assertSucceeds(getDoc(doc(as('caro'), 'activity/ana')));
    await assertFails(getDoc(doc(anon(), 'activity/ana')));
  });

  it('de una cuenta privada, solo seguidores aceptados', async () => {
    await assertFails(getDoc(doc(as('caro'), 'activity/beto')));
    await seedFollow('caro', 'beto', 'pending');
    await assertFails(getDoc(doc(as('caro'), 'activity/beto')));
    await seedFollow('caro', 'beto', 'accepted');
    await assertSucceeds(getDoc(doc(as('caro'), 'activity/beto')));
  });

  it('quien te bloqueó no te deja leerla', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/blocks/caro'), { at: NOW });
    });
    await assertFails(getDoc(doc(as('caro'), 'activity/ana')));
  });

  it('solo la escribe su dueño, con las claves que corresponden', async () => {
    await assertFails(setDoc(doc(as('caro'), 'activity/ana'), activity('ana')));
    await assertSucceeds(setDoc(doc(as('ana'), 'activity/ana'), activity('ana')));
    await assertFails(setDoc(doc(as('ana'), 'activity/ana'), { ...activity('ana'), saved_media: [] }));
  });

  it('reacciona quien puede leerla, firmando con su uid', async () => {
    const reaction = { reactor: 'caro', reactorName: 'Caro', reactorHandle: 'caro', eventId: 'c:m1:x', emoji: 'fire', at: NOW };
    await assertSucceeds(setDoc(doc(as('caro'), 'activity/ana/reactions/caro_c:m1:x'), reaction));
    await assertFails(setDoc(doc(as('caro'), 'activity/beto/reactions/caro_c:m1:x'), reaction));
    await assertFails(setDoc(doc(as('caro'), 'activity/ana/reactions/beto_c:m1:x'), { ...reaction, reactor: 'beto' }));
    await assertFails(setDoc(doc(as('caro'), 'activity/ana/reactions/caro_c:m1:x'), { ...reaction, emoji: 'script' }));
  });

  it('el dueño lee todas sus reacciones; otros solo las suyas', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activity/ana/reactions/caro_e1'), {
        reactor: 'caro', reactorName: 'Caro', reactorHandle: 'caro', eventId: 'e1', emoji: 'fire', at: NOW,
      });
    });
    await assertSucceeds(getDocs(collection(as('ana'), 'activity/ana/reactions')));
    await assertFails(getDocs(collection(as('beto'), 'activity/ana/reactions')));
    await assertSucceeds(getDoc(doc(as('caro'), 'activity/ana/reactions/caro_e1')));
  });
});

describe('recommendations', () => {
  const rec = (from: string) => ({
    from,
    fromName: from,
    fromHandle: from,
    tmdbId: 603,
    mediaType: 'movie',
    title: 'Matrix',
    posterPath: null,
    releaseYear: '1999',
    note: '',
    at: NOW,
  });

  beforeEach(async () => {
    await seedAccount('ana', 'ana');
    await seedAccount('beto', 'beto');
  });

  it('solo entre mutuos', async () => {
    await assertFails(setDoc(doc(as('beto'), 'users/ana/recommendations/beto_movie603'), rec('beto')));
    await seedFollow('beto', 'ana', 'accepted');
    await assertFails(setDoc(doc(as('beto'), 'users/ana/recommendations/beto_movie603'), rec('beto')));
    await seedFollow('ana', 'beto', 'accepted');
    await assertSucceeds(setDoc(doc(as('beto'), 'users/ana/recommendations/beto_movie603'), rec('beto')));
  });

  it('con el id y la firma de quien la manda, y nada más', async () => {
    await seedFollow('beto', 'ana', 'accepted');
    await seedFollow('ana', 'beto', 'accepted');
    await assertFails(setDoc(doc(as('beto'), 'users/ana/recommendations/caro_movie603'), rec('beto')));
    await assertFails(setDoc(doc(as('beto'), 'users/ana/recommendations/beto_movie603'), { ...rec('beto'), extra: 1 }));
  });

  it('la lee quien la recibe, no un tercero', async () => {
    await seedAccount('caro', 'caro');
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/recommendations/beto_movie603'), rec('beto'));
    });
    await assertSucceeds(getDocs(collection(as('ana'), 'users/ana/recommendations')));
    await assertFails(getDocs(collection(as('caro'), 'users/ana/recommendations')));
  });
});

describe('borrar la cuenta', () => {
  it('quien reaccionó encuentra y borra sus reacciones; quien recomendó, sus recomendaciones', async () => {
    await seedAccount('ana', 'ana');
    await seed(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'activity/ana/reactions/caro_e1'), {
        reactor: 'caro', reactorName: 'Caro', reactorHandle: 'caro', eventId: 'e1', emoji: 'fire', at: NOW,
      });
      await setDoc(doc(db, 'users/ana/recommendations/caro_movie603'), {
        from: 'caro', fromName: 'Caro', fromHandle: 'caro', tmdbId: 603, mediaType: 'movie', title: 'Matrix',
        posterPath: null, releaseYear: '1999', note: '', at: NOW,
      });
    });
    const db = as('caro');
    const reactions = await assertSucceeds(
      getDocs(query(collection(db, 'activity/ana/reactions'), where('reactor', '==', 'caro'))),
    );
    await assertSucceeds(deleteDoc(reactions.docs[0].ref));
    const recs = await assertSucceeds(
      getDocs(query(collection(db, 'users/ana/recommendations'), where('from', '==', 'caro'))),
    );
    await assertSucceeds(deleteDoc(recs.docs[0].ref));
  });
});

describe('public_profiles y cuentas privadas', () => {
  it('una cuenta privada no publica perfil', async () => {
    await seedAccount('ana', 'ana', true);
    await assertFails(setDoc(doc(as('ana'), 'public_profiles/ana'), { slug: 'ana', uid: 'ana' }));
  });

  it('una pública, o sin cuenta social todavía, sí', async () => {
    await seedAccount('ana', 'ana');
    await assertSucceeds(setDoc(doc(as('ana'), 'public_profiles/ana'), { slug: 'ana', uid: 'ana' }));
    await assertSucceeds(setDoc(doc(as('beto'), 'public_profiles/beto'), { slug: 'beto', uid: 'beto' }));
  });

  it('despublicar sigue permitido aunque la cuenta ya sea privada', async () => {
    await seed(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'public_profiles/ana'), { slug: 'ana', uid: 'ana' });
    });
    await seedAccount('ana', 'ana', true);
    await assertSucceeds(deleteDoc(doc(as('ana'), 'public_profiles/ana')));
  });
});

describe('blocks', () => {
  it('son de su dueño y nadie más los lee', async () => {
    await assertSucceeds(setDoc(doc(as('ana'), 'users/ana/blocks/beto'), { at: NOW }));
    await assertFails(getDoc(doc(as('beto'), 'users/ana/blocks/beto')));
    await assertFails(setDoc(doc(as('ana'), 'users/ana/blocks/ana'), { at: NOW }));
  });
});
