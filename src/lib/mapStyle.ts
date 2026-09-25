import { useColorScheme } from '@mui/material/styles';
import { INDIGO, VIOLET } from '../theme';

/**
 * Base map in the app's colours: CARTO's calm Positron (light) / Dark Matter (dark) tiles, tinted
 * towards indigo with a CSS filter (see .rtgt-tiles in styles.css). {r} becomes "@2x" on retina screens.
 */
export const BASEMAP = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  subdomains: 'abcd',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
export function tileUrl(dark: boolean, z: number, x: number, y: number, retina: boolean): string {
  return (dark ? BASEMAP.dark : BASEMAP.light)
    .replace('{s}', BASEMAP.subdomains[(x + y) % 4])
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', retina ? '@2x' : '');
}
