import { describe, expect, it } from 'vitest';
import { buildDemoSocial } from './demoSocial';
import { buildDemoLibrary } from './demo';
import { activityToDocument, parseActivity } from './activity';
import { affinity } from './affinity';
import { isSpoilerRisk } from './socialFeed';
import { parseAccount } from './social';

describe('el demo social', () => {
  const social = buildDemoSocial(new Date('2026-09-30T12:00:00.000Z'));
  const known = new Set([social.me.uid, ...social.people.map((person) => person.account.uid)]);

  it('toda relación apunta a alguien que existe', () => {
    for (const follow of [...social.follows.outgoing, ...social.follows.incoming]) {
      expect(known.has(follow.follower)).toBe(true);
      expect(known.has(follow.followed)).toBe(true);
    }
    for (const rec of social.recommendations) expect(known.has(rec.from)).toBe(true);
  });

  it('cada cuenta y cada actividad se leen como si vinieran de Firestore', () => {
    for (const { account, activity } of social.people) {
      expect(parseAccount(account)).not.toBeNull();
      const read = parseActivity(activityToDocument(activity))!;
      expect(read.events).toHaveLength(activity.events.length);
    }
  });

  it('Ana tiene suficientes títulos en común con la biblioteca del demo para "En común"', () => {
    const ana = social.people.find((person) => person.account.handle === 'ana-demo')!;
    expect(affinity(buildDemoLibrary(), ana.activity.library)).not.toBeNull();
  });

  it('su reseña de Severance sale tapada: el demo la está viendo', () => {
    const ana = social.people.find((person) => person.account.handle === 'ana-demo')!;
    const review = ana.activity.events.find((event) => event.title?.title === 'Severance')!;
    expect(isSpoilerRisk(review, buildDemoLibrary())).toBe(true);
  });
});
