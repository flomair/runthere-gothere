import { TileLayer } from 'react-leaflet';
import { BASEMAP, useDarkMap } from '../lib/mapStyle';

/** The app's tinted base map for Leaflet maps; switches with light/dark mode. */
export default function BaseTiles() {
  const dark = useDarkMap();
  return (
    <TileLayer
      key={dark ? 'dark' : 'light'}
      url={dark ? BASEMAP.dark : BASEMAP.light}
      subdomains={BASEMAP.subdomains}
      attribution={BASEMAP.attribution}
      className="rtgt-tiles"
      maxZoom={19}
    />
  );
}
