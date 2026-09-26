import type { Draw, Prize, PrizeTier } from './types.js';

export const TIERS: PrizeTier[] = ['small', 'medium', 'rare'];
/** Base weights; a draw's boost raises medium (√boost) and rare (×boost). */
export const TIER_BASE: Record<PrizeTier, number> = { small: 60, medium: 30, rare: 10 };
export const MAX_BOOST = 3;
/** Chance per member and week (with at least one run) of a random drop. */
export const DROP_CHANCE = 0.25;

/** Stable pseudo-random number in [0, 1) from a string (FNV-1a). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

/** "?" pins along the group route: roughly one per 80 km (2–12), spread out with a little jitter. */
export function mysteryPins(groupId: string, totalM: number): { key: string; m: number }[] {
  const n = Math.max(2, Math.min(12, Math.round(totalM / 80_000)));
  const gap = totalM / n;
  return Array.from({ length: n }, (_, i) => ({ key: `q${i + 1}`, m: Math.round(gap * (i + 0.5) + (hash01(`${groupId}:${i}`) - 0.5) * gap * 0.5) }));
}

/** Monday of the ISO week of a date (YYYY-MM-DD), as the key of that week. */
export function weekKey(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Whether a member gets a random drop for a week they ran in (stable for the same inputs). */
export const dropFor = (groupId: string, uid: string, week: string) => hash01(`drop:${groupId}:${uid}:${week}`) < DROP_CHANCE;

export const clampBoost = (b: number) => Math.max(1, Math.min(MAX_BOOST, Number.isFinite(b) ? b : 1));
/** A stage win counts more the harder it was won (effort 1.0 = usual volume). */
export const stageBoost = (effort: number) => clampBoost(1 + effort);

/** Tier odds for a draw, over the tiers that still have something to draw. */
export function tierOdds(boost: number, available: Record<PrizeTier, number>): Record<PrizeTier, number> {
  const b = clampBoost(boost);
  const w: Record<PrizeTier, number> = {
    small: available.small > 0 ? TIER_BASE.small : 0,
    medium: available.medium > 0 ? TIER_BASE.medium * Math.sqrt(b) : 0,
    rare: available.rare > 0 ? TIER_BASE.rare * b : 0,
  };
  const sum = w.small + w.medium + w.rare;
  return sum ? { small: w.small / sum, medium: w.medium / sum, rare: w.rare / sum } : { small: 0, medium: 0, rare: 0 };
}

export const countByTier = (prizes: Prize[]): Record<PrizeTier, number> => ({
  small: prizes.filter((p) => p.tier === 'small').length,
  medium: prizes.filter((p) => p.tier === 'medium').length,
  rare: prizes.filter((p) => p.tier === 'rare').length,
});

/** Prizes a member may draw: still in the bucket and never their own. */
export const eligiblePrizes = (prizes: Prize[], uid: string) => prizes.filter((p) => p.status === 'available' && p.addedBy !== uid);

/** Pick a prize for a draw: first the tier (boosted odds), then one prize of that tier. */
export function pickPrize(prizes: Prize[], draw: Pick<Draw, 'uid' | 'boost'>, rng: () => number = Math.random): { prize: Prize; tier: PrizeTier; odds: Record<PrizeTier, number> } | null {
  const pool = eligiblePrizes(prizes, draw.uid);
  if (!pool.length) return null;
  const odds = tierOdds(draw.boost, countByTier(pool));
  let r = rng();
  let tier: PrizeTier = TIERS.find((t) => odds[t] > 0)!;
  for (const t of TIERS) {
    if (odds[t] <= 0) continue;
    tier = t;
    if (r < odds[t]) break;
    r -= odds[t];
  }
  const inTier = pool.filter((p) => p.tier === tier).sort((a, b) => a.id.localeCompare(b.id));
  const prize = inTier[Math.min(inTier.length - 1, Math.floor(rng() * inTier.length))];
  return { prize, tier, odds };
}

/** The bucket is low when fewer prizes are left than members (at least 3). */
export const lowThreshold = (members: number) => Math.max(3, members);
