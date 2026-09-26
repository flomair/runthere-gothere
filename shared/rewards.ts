import type { CityUnlocks, Fulfillment, Milestone, Reward } from './types.js';

/** Money put aside so far: every counted kilometre (also beyond a destination) × the amount per km. */
export function savingsTotal(loggedM: number, perKm: number): number {
  if (!(perKm > 0) || !(loggedM > 0)) return 0;
  return Math.round((loggedM / 1000) * perKm * 100) / 100;
}

/** Reward state as the user should see it right now (the server marks unlocks on the next sync). */
export function rewardState(r: Reward, doneM: number): Reward['status'] {
  if (r.status === 'claimed') return 'claimed';
  return r.status === 'unlocked' || r.atM <= doneM ? 'unlocked' : 'locked';
}

/** Pins can be moved (and edited) until they unlock – and only to a point still ahead. */
export const canMoveReward = (r: Reward, doneM: number) => rewardState(r, doneM) === 'locked';
export const validPinPosition = (atM: number, doneM: number, totalM: number) => Number.isFinite(atM) && atM > doneM && atM <= totalM;

export const promise = (): Fulfillment => ({ kind: 'promise', status: 'pending' });

/** Stops and destinations unlock city rewards; distance, halfway and border milestones don't. */
export const isCityMilestone = (m: Pick<Milestone, 'kind'>) => m.kind === 'waypoint' || m.kind === 'finish';

/** Stable colour per city for its passport stamp. */
export function stampHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function stampFor(m: Pick<Milestone, 'place' | 'title' | 'reachedAt' | 'countryCode'>): CityUnlocks['stamp'] {
  const label = m.place?.name ?? m.title.replace(/^(Arrived in|You made it to)\s+/, '').replace(/!$/, '');
  return { label, date: m.reachedAt.slice(0, 10), countryCode: m.countryCode, hue: stampHue(label) };
}

/** Search links for a suggested song on the common music services. */
export function songLinks(song: { title: string; artist: string }) {
  const q = encodeURIComponent(`${song.title} ${song.artist}`);
  return {
    spotify: `https://open.spotify.com/search/${q}`,
    youtube: `https://music.youtube.com/search?q=${q}`,
    apple: `https://music.apple.com/search?term=${q}`,
  };
}
