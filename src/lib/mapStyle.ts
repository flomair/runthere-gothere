import { useColorScheme } from '@mui/material/styles';
import { INDIGO, VIOLET } from '../theme';

/**
 * Base map in the app's colours: the standard OpenStreetMap tiles (no key needed), recoloured with a
 * CSS filter – a pale indigo map in light mode, an inverted deep navy one in dark mode
 * (see .rtgt-tiles in styles.css).
 */
export const BASEMAP = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

export function useDarkMap(): boolean {
  const { mode, systemMode } = useColorScheme();
  return (mode === 'system' ? systemMode : mode) === 'dark';
}

/** Route line colours that read well on the light and the dark base map. */
export function routeColors(dark: boolean) {
  return dark
    ? { ahead: '#C5C8F0', done: '#9A8CFF', casing: '#0A0B14', start: '#E7E9FF' }
    : { ahead: INDIGO, done: VIOLET, casing: '#ffffff', start: INDIGO };
}

/** URL of one base map tile. */
export const tileUrl = (z: number, x: number, y: number): string =>
  BASEMAP.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
