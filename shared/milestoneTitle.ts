import type { Milestone } from './types.js';

type Lang = 'en' | 'de';

const regionName = (code: string, lang: Lang) => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * Milestone titles are stored in English ("Arrived in Dresden"); this renders them in the reader's
 * language from the milestone's kind and the stored title.
 */
export function milestoneTitle(m: Pick<Milestone, 'kind' | 'title' | 'countryCode'>, lang: string): string {
  const l: Lang = lang === 'de' ? 'de' : 'en';
  if (l === 'en') return m.title;
  switch (m.kind) {
    case 'waypoint': {
      const place = /^Arrived in (.+)$/.exec(m.title)?.[1];
      return place ? `Angekommen in ${place}` : m.title;
    }
    case 'distance': {
      const km = /^(\d+) km on the road$/.exec(m.title)?.[1];
      return km ? `${Number(km).toLocaleString('de-DE')} km unterwegs` : m.title;
    }
    case 'halfway':
      return 'Halbzeit';
    case 'border':
      return m.countryCode ? `Willkommen in ${regionName(m.countryCode, 'de')}` : m.title;
    case 'finish': {
      const place = /^You made it to (.+)!$/.exec(m.title)?.[1];
      return place ? `Geschafft: ${place}!` : 'Ziel erreicht!';
    }
    default:
      return m.title;
  }
}
