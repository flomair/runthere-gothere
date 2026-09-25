import { TileLayer } from 'react-leaflet';
import { BASEMAP } from '../lib/mapStyle';

/** The app's recoloured base map for Leaflet maps (the colours follow light/dark mode via CSS). */
export default function BaseTiles() {
  return <TileLayer url={BASEMAP.url} attribution={BASEMAP.attribution} className="rtgt-tiles" maxZoom={BASEMAP.maxZoom} />;
}
