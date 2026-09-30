import { describe, expect, it } from 'vitest';
import {
  Account,
  Follow,
  MyFollows,
  accountToDocument,
  addedFromText,
  emptySocialSettings,
  followButtonLabel,
  followCounts,
  followedUids,
  handleProblem,
  hasSocialSettings,
  inviteText,
  inviteUrl,
  isImagePath,
  isValidHandle,
  mutualUids,
  newFollow,
  normalizeHandle,
  parseAccount,
  parseFollow,
  parseReaction,
  parseRecommendation,
  parseSocialSettings,
  pendingRequests,
  recommendationId,
  recommendationToDocument,
  relationship,
  suggestHandle,
  whatsappUrl,
} from './social';

const NOW = '2026-09-30T12:00:00.000Z';

function account(overrides: Partial<Account> = {}): Account {
  return {
    uid: 'u-ana',
    handle: 'ana',
    displayName: 'Ana',
    bio: '',
    avatarPath: null,
    top4: [],
    private: false,
    followers: 0,
    following: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function follow(follower: string, followed: string, status: Follow['status'] = 'accepted', extra: Partial<Follow> = {}): Follow {
  return { follower, followed, status, createdAt: NOW, ...extra };
}

describe('usuarios', () => {
  it('acepta la forma de la dirección del perfil y rechaza los reservados', () => {
    expect(isValidHandle('ana-perez')).toBe(true);
    expect(isValidHandle('Ana')).toBe(false);
    expect(isValidHandle('an')).toBe(false);
    expect(isValidHandle('admin')).toBe(false);
  });

  it('explica por qué no sirve', () => {
    expect(handleProblem('an')).toMatch(/al menos 3/);
    expect(handleProblem('-ana')).toMatch(/minúsculas/);
    expect(handleProblem('soporte')).toMatch(/reservado/);
    expect(handleProblem('ana')).toBeNull();
  });

  it('normaliza lo tipeado, con o sin arroba', () => {
    expect(normalizeHandle('@Ana Pérez')).toBe('ana-perez');
  });

  it('propone el perfil público que ya tenía, o el nombre, o el mail', () => {
    expect(suggestHandle({ publicSlug: 'ana-cine', displayName: 'Ana' })).toBe('ana-cine');
    expect(suggestHandle({ displayName: 'Ana Pérez' })).toBe('ana-perez');
    expect(suggestHandle({ displayName: 'Al', email: 'beto.gomez@mail.com' })).toBe('beto-gomez');
    expect(suggestHandle({})).toBe('');
  });
});

describe('parseAccount', () => {
  it('valida y recorta lo que viene de afuera', () => {
    const parsed = parseAccount({
      ...account(),
      displayName: 'x'.repeat(100),
      bio: '  hola  ',
      avatarPath: 'https://evil.example/x.jpg',
      top4: [{ tmdbId: 603, mediaType: 'movie', title: 'Matrix', posterPath: '/m.jpg', releaseYear: '1999' }, 'basura'],
      followers: -3,
    })!;
    expect(parsed.displayName).toHaveLength(60);
    expect(parsed.bio).toBe('hola');
    expect(parsed.avatarPath).toBeNull();
    expect(parsed.top4).toHaveLength(1);
    expect(parsed.followers).toBe(0);
  });

  it('sin uid o con un usuario inválido no hay cuenta', () => {
    expect(parseAccount({ ...account(), uid: '' })).toBeNull();
    expect(parseAccount({ ...account(), handle: 'Ana!' })).toBeNull();
    expect(parseAccount(null)).toBeNull();
  });

  it('el documento lleva exactamente las claves que aceptan las reglas', () => {
    expect(Object.keys(accountToDocument(account())).sort()).toEqual(
      ['avatarPath', 'bio', 'createdAt', 'displayName', 'followers', 'following', 'handle', 'private', 'top4', 'uid', 'updatedAt'].sort(),
    );
  });

  it('una ruta de imagen de TMDB, nada más', () => {
    expect(isImagePath('/abc_123.jpg')).toBe(true);
    expect(isImagePath('//evil.com/a.jpg')).toBe(false);
    expect(isImagePath('/a.svg')).toBe(false);
  });
});

describe('seguir', () => {
  it('a una cuenta privada se le pide; a una pública se la sigue', () => {
    expect(newFollow('u-beto', account({ private: true })).status).toBe('pending');
    expect(newFollow('u-beto', account()).status).toBe('accepted');
  });

  it('parseFollow descarta lo roto y seguirse a uno mismo', () => {
    expect(parseFollow(follow('a', 'a'))).toBeNull();
    expect(parseFollow({ follower: 'a', followed: 'b', status: 'maybe' })).toBeNull();
    expect(parseFollow({ ...follow('a', 'b'), acceptedAt: 'x' })).not.toHaveProperty('acceptedAt');
  });

  it('arma la relación desde las dos consultas', () => {
    const follows: MyFollows = {
      outgoing: [follow('yo', 'ana'), follow('yo', 'beto', 'pending'), follow('yo', 'caro')],
      incoming: [follow('ana', 'yo'), follow('dani', 'yo', 'pending')],
    };
    expect(relationship(follows, 'ana')).toEqual({
      following: true,
      requested: false,
      followsYou: true,
      requestedYou: false,
      mutual: true,
    });
    expect(relationship(follows, 'beto').requested).toBe(true);
    expect(relationship(follows, 'dani').requestedYou).toBe(true);
    expect(followedUids(follows)).toEqual(['ana', 'caro']);
    expect(mutualUids(follows)).toEqual(['ana']);
    expect(followCounts(follows)).toEqual({ followers: 1, following: 2 });
    expect(pendingRequests(follows).map((f) => f.follower)).toEqual(['dani']);
  });

  it('el botón dice lo que pasa', () => {
    const none = { following: false, requested: false, followsYou: false, requestedYou: false, mutual: false };
    expect(followButtonLabel(none, { private: false })).toBe('Seguir');
    expect(followButtonLabel(none, { private: true })).toBe('Solicitar seguir');
    expect(followButtonLabel({ ...none, followsYou: true }, { private: false })).toBe('Seguir también');
    expect(followButtonLabel({ ...none, requested: true }, { private: true })).toBe('Solicitado');
    expect(followButtonLabel({ ...none, following: true }, { private: false })).toBe('Siguiendo');
  });
});

describe('configuración', () => {
  it('lo que no dice nada queda prendido', () => {
    const settings = parseSocialSettings({ sharing: { abandoned: false }, muted: ['a', 'a', 3] });
    expect(settings.sharing.abandoned).toBe(false);
    expect(settings.sharing.completed).toBe(true);
    expect(settings.muted).toEqual(['a']);
  });

  it('lo de fábrica no va al backup', () => {
    expect(hasSocialSettings(emptySocialSettings())).toBe(false);
    expect(hasSocialSettings({ ...emptySocialSettings(), paused: true })).toBe(true);
  });
});

describe('reacciones y recomendaciones', () => {
  it('una reacción desconocida no entra', () => {
    expect(parseReaction({ reactor: 'a', eventId: 'e', emoji: 'fire', at: NOW })?.emoji).toBe('fire');
    expect(parseReaction({ reactor: 'a', eventId: 'e', emoji: '<script>', at: NOW })).toBeNull();
  });

  it('una recomendación por persona y título, con la nota recortada', () => {
    expect(recommendationId('u-ana', 'movie', 603)).toBe('u-ana_movie603');
    const doc = recommendationToDocument({
      from: 'u-ana',
      fromName: 'Ana',
      fromHandle: 'ana',
      tmdbId: 603,
      mediaType: 'movie',
      title: 'Matrix',
      posterPath: null,
      releaseYear: '1999',
      note: 'x'.repeat(400),
      at: NOW,
    });
    expect((doc.note as string).length).toBe(280);
    expect(parseRecommendation('u-ana_movie603', doc)?.title).toBe('Matrix');
    expect(parseRecommendation('x', { title: 'Matrix' })).toBeNull();
  });
});

describe('invitaciones', () => {
  it('el link es el perfil con la marca de invitación, listo para WhatsApp', () => {
    const url = inviteUrl('https://quemiro.app', 'ana');
    expect(url).toBe('https://quemiro.app/u/ana?invitado=1');
    const text = inviteText({ displayName: 'Ana' }, url);
    expect(whatsappUrl(text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  });
});

describe('de dónde vino un título', () => {
  it('lo dice en palabras', () => {
    expect(addedFromText({ uid: 'a', name: 'Ana', via: 'recommendation' })).toBe('Te lo recomendó Ana');
    expect(addedFromText({ uid: 'a', name: 'Ana', via: 'feed' })).toBe('Lo sacaste del feed de Ana');
  });
});
