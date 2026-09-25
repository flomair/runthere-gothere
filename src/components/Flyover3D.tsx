import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import { Alert, Box, Dialog, IconButton, Slider, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type LatLon, positionAt, sliceRoute } from '../../shared/geo';
import { formatKm } from '../lib/format';
import { useT } from '../lib/i18n';

export type FlyoverRange = 'last' | 'next' | 'all';

interface Props {
  open: boolean;
  onClose: () => void;
  points: LatLon[];
  cum: number[];
  /** Distance covered, in route metres. */
  doneM: number;
  title: string;
  /** Journey length as shown elsewhere in the app (the route geometry can differ slightly). */
  journeyM: number;
}

const STRETCH_M = 20_000;

/** Degrees clockwise from north, from a to b. */
export function bearing(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a[0] * toRad, a[1] * toRad, b[0] * toRad, b[1] * toRad];
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Turn `from` toward `to` by fraction `f`, the short way round. */
function lerpAngle(from: number, to: number, f: number) {
  const d = ((to - from + 540) % 360) - 180;
  return (from + d * f + 360) % 360;
}

/** Start/end metres of the stretch to fly for a range. */
export function flyoverSpan(range: FlyoverRange, doneM: number, totalM: number, stretchM = STRETCH_M): [number, number] {
  if (range === 'all') return [0, totalM];
  if (range === 'next') return [Math.min(doneM, totalM), Math.min(totalM, doneM + stretchM)];
  return [Math.max(0, doneM - stretchM), Math.max(doneM, Math.min(totalM, stretchM))];
}

const lngLat = (p: LatLon): [number, number] => [p[1], p[0]];

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 15,
      encoding: 'terrarium',
      attribution: 'Terrain: Mapzen / AWS Terrain Tiles',
    },
    shade: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 15, encoding: 'terrarium' },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite' },
    { id: 'hillshade', type: 'hillshade', source: 'shade', paint: { 'hillshade-exaggeration': 0.25, 'hillshade-shadow-color': '#1d2b36' } },
  ],
  terrain: { source: 'dem', exaggeration: 1.4 },
  sky: {
    'sky-color': '#7fb8f0',
    'horizon-color': '#e8f1fb',
    'fog-color': '#e8f1fb',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.3,
  },
};

export default function Flyover3D({ open, onClose, points, cum, doneM, title, journeyM }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const t = useT();
  const totalM = cum[cum.length - 1] ?? 0;
  const [range, setRange] = useState<FlyoverRange>(doneM > 0 ? 'last' : 'next');
  const [playing, setPlaying] = useState(true);
  const [t01, setT01] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const state = useRef({ t: 0, bearing: 0, last: 0 });

  const [fromM, toM] = useMemo(() => flyoverSpan(range, doneM, totalM, (STRETCH_M * totalM) / Math.max(1, journeyM)), [range, doneM, totalM, journeyM]);
  const spanM = Math.max(1, toM - fromM);
  // ~2 s per km close up, capped for long spans; the whole journey flies higher and faster
  const durationMs = range === 'all' ? 60_000 : Math.min(60_000, Math.max(15_000, spanM * 2));
  const zoom = range === 'all' ? Math.max(8, 12.5 - Math.log2(Math.max(1, totalM / 50_000))) : 14;
  const lookAheadM = range === 'all' ? Math.max(3000, totalM / 40) : 700;

  // create the map once the dialog content is mounted
  useEffect(() => {
    if (!open || !container) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE,
        center: lngLat(positionAt(points, cum, fromM).point),
        zoom,
        pitch: 65,
        maxPitch: 80,
        attributionControl: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
    // style.load, not load: 'load' waits for the first tiles, which can take a while on mobile
    map.once('style.load', () => {
      map.addSource('done', { type: 'geojson', data: line(sliceRoute(points, cum, 0, doneM)) });
      map.addSource('ahead', { type: 'geojson', data: line(sliceRoute(points, cum, doneM, totalM)) });
      map.addLayer({ id: 'ahead', type: 'line', source: 'ahead', paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'done-casing', type: 'line', source: 'done', paint: { 'line-color': '#7a2400', 'line-width': 8, 'line-opacity': 0.5 } });
      map.addLayer({ id: 'done', type: 'line', source: 'done', paint: { 'line-color': '#fc4c02', 'line-width': 5 } });
      const el = document.createElement('div');
      el.className = 'rtgt-marker me';
      el.textContent = '🏃';
      markerRef.current = new maplibregl.Marker({ element: el }).setLngLat(lngLat(positionAt(points, cum, doneM).point)).addTo(map);
      setReady(true);
    });
    map.on('error', (e) => {
      // tile hiccups are normal while flying; only report style-level failures
      if (!('tile' in e) && e.error?.message && !/tile|Failed to fetch/i.test(e.error.message)) setError(e.error.message);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      setReady(false);
    };
    // the map is rebuilt only when the dialog opens; range changes just move the camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, container]);

  // restart when the range changes
  useEffect(() => {
    state.current.t = 0;
    state.current.bearing = bearing(positionAt(points, cum, fromM).point, positionAt(points, cum, fromM + lookAheadM).point);
    setT01(0);
    setPlaying(true);
  }, [range, fromM, points, cum, lookAheadM]);

  // animation loop
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const place = (tt: number, smooth: number) => {
      const d = fromM + spanM * tt;
      const here = positionAt(points, cum, d).point;
      const ahead = positionAt(points, cum, Math.min(totalM, d + lookAheadM)).point;
      const target = d + 1 < totalM ? bearing(here, ahead) : state.current.bearing;
      state.current.bearing = lerpAngle(state.current.bearing, target, smooth);
      map.jumpTo({ center: lngLat(here), bearing: state.current.bearing, pitch: 65, zoom });
      if (range !== 'all' || tt > 0) markerRef.current?.setLngLat(lngLat(d <= doneM ? here : positionAt(points, cum, doneM).point));
    };
    if (!playing) {
      place(state.current.t, 1);
      return;
    }
    let raf = 0;
    state.current.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - state.current.last);
      state.current.last = now;
      state.current.t = Math.min(1, state.current.t + dt / durationMs);
      place(state.current.t, Math.min(1, dt / 600));
      setT01(state.current.t);
      if (state.current.t >= 1) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ready, playing, fromM, spanM, durationMs, zoom, lookAheadM, points, cum, totalM, doneM, range]);

  const atM = fromM + spanM * t01;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="lg" slotProps={{ paper: { sx: { overflow: 'hidden', height: fullScreen ? '100%' : '85vh', bgcolor: '#0b1620' } } }}>
      <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* inline style: maplibre's stylesheet sets .maplibregl-map { position: relative } */}
        <div ref={setContainer} style={{ position: 'absolute', inset: 0 }} />
        <Stack direction="row" sx={{ position: 'absolute', top: 10, left: 10, right: 60, alignItems: 'flex-start', gap: 1, pointerEvents: 'none' }}>
          <Box sx={{ px: 1.5, py: 0.75, borderRadius: '14px', bgcolor: 'rgb(0 0 0 / 55%)', color: '#fff', backdropFilter: 'blur(6px)', minWidth: 0 }}>
            <Typography variant="overline" sx={{ lineHeight: 1.4, opacity: 0.8, display: 'block' }}>
              {t('3D flyover')}
            </Typography>
            <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
              {title}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {formatKm((atM / totalM) * journeyM)} / {formatKm(journeyM, 0)}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} aria-label={t('Close')} sx={{ position: 'absolute', top: 8, right: 52, color: '#fff', bgcolor: 'rgb(0 0 0 / 45%)', '&:hover': { bgcolor: 'rgb(0 0 0 / 65%)' } }}>
          <CloseIcon />
        </IconButton>
        {error && (
          <Alert severity="error" sx={{ position: 'absolute', top: 90, left: 10, right: 10 }}>
            {t('3D view failed')}: {error}
          </Alert>
        )}
        <Box
          sx={{
            position: 'absolute',
            left: { xs: 8, sm: 16 },
            right: { xs: 8, sm: 16 },
            bottom: { xs: 8, sm: 16 },
            p: 1.25,
            borderRadius: '18px',
            bgcolor: 'rgb(10 18 26 / 72%)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
          }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
            <IconButton
              aria-label={playing ? t('Pause') : t('Play')}
              onClick={() => {
                if (t01 >= 1) {
                  state.current.t = 0;
                  setT01(0);
                }
                setPlaying((p) => !p);
              }}
              sx={{ color: '#fff', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
            >
              {playing ? <PauseIcon /> : t01 >= 1 ? <ReplayIcon /> : <PlayArrowIcon />}
            </IconButton>
            <Slider
              size="small"
              value={t01}
              min={0}
              max={1}
              step={0.001}
              aria-label={t('Position')}
              onChange={(_, v) => {
                state.current.t = v as number;
                setT01(v as number);
                setPlaying(false);
              }}
              sx={{ color: 'primary.light' }}
            />
          </Stack>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={range}
            onChange={(_, v) => v && setRange(v)}
            sx={{ mt: 0.5, flexWrap: 'wrap', '& .MuiToggleButton-root': { color: 'rgb(255 255 255 / 75%)', borderColor: 'rgb(255 255 255 / 25%)', py: 0.25 }, '& .Mui-selected': { color: '#fff !important', bgcolor: 'rgb(252 76 2 / 55%) !important' } }}
          >
            <ToggleButton value="last" disabled={doneM <= 0}>
              {t('Last 20 km')}
            </ToggleButton>
            <ToggleButton value="next" disabled={doneM >= totalM}>
              {t('Next 20 km')}
            </ToggleButton>
            <ToggleButton value="all">{t('Whole journey')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
    </Dialog>
  );
}

function line(pts: LatLon[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.map(lngLat) } };
}
