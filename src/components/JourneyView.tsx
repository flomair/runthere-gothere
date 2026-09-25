import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MoreIcon from '@mui/icons-material/MoreVert';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Slider,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cumulativeDistances, haversine, positionAt, samplePoints } from '../../shared/geo';
import { navigate } from '../lib/nav';
import { api, useActivities, useMe, useStravaActions } from '../lib/api';
import { formatDate, formatKm } from '../lib/format';
import { fromUnit, getUnit, toUnit } from '../lib/units';
import { type ProgressEntry, computeProgress } from '../lib/progress';
import { journeyStore } from '../lib/storage';
import type { Journey } from '../lib/types';
import ActivityLog from './ActivityLog';
import ElevationProfile from './ElevationProfile';
import GoalsCard from './GoalsCard';
import JourneySettingsDialog from './JourneySettingsDialog';
import LocationExplorer from './LocationExplorer';
import RouteMap from './RouteMap';
import StatsRow from './StatsRow';
import StravaButton from './StravaButton';

function downloadGpx(j: Journey) {
  const pts = j.route.points.map(([la, lo]) => `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"/>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Run There Go There" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${j.name.replace(/[<&>]/g, '')}</name><trkseg>${pts}</trkseg></trk></gpx>`;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml' })),
    download: `${j.name.replace(/[^\w-]+/g, '_')}.gpx`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function JourneyView({ journey }: { journey: Journey }) {
  const { data: me } = useMe();
  const connected = !!me?.strava;
  const strava = useStravaActions();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const activitiesQ = useActivities(journey.startDate, connected && journey.useStrava);
  const syncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await strava.sync(journey.startDate);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };
  // journeys can start before the earliest synced run: fetch the older runs once
  const needsBackfill =
    connected &&
    journey.useStrava &&
    me?.strava?.syncedFrom !== undefined &&
    Date.parse(`${journey.startDate}T00:00:00Z`) / 1000 - 86_400 < me.strava.syncedFrom;
  const backfillStarted = useRef(false);
  useEffect(() => {
    if (needsBackfill && !backfillStarted.current) {
      backfillStarted.current = true;
      void syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsBackfill]);
  const progress = useMemo(() => computeProgress(journey, activitiesQ.data), [journey, activitiesQ.data]);
  const { points } = journey.route;
  const cum = useMemo(() => cumulativeDistances(points), [points]);
  // stored points are simplified – scale positions so the true route length maps onto the line
  const scale = cum[cum.length - 1] > 0 ? cum[cum.length - 1] / journey.route.totalM : 1;
  const here = positionAt(points, cum, progress.doneM * scale).point;

  const [tab, setTab] = useState<'here' | 'ahead'>('here');
  const [peekM, setPeekM] = useState<number>(() => Math.min(progress.totalM, progress.doneM + 10_000));
  const [fly, setFly] = useState<{ token: number; target: [number, number] | null }>({ token: 0, target: null });
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<ProgressEntry | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // elevation profile: fetched once per journey and stored with it
  const [profileState, setProfileState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  useEffect(() => {
    if (journey.profile || points.length < 2) return;
    let cancelled = false;
    setProfileState({ loading: true, error: null });
    const n = Math.min(300, Math.max(60, Math.round(journey.route.totalM / 2000)));
    const sample = samplePoints(points, cum, journey.route.totalM, n);
    api<{ elevations: number[] }>('/api/elevation', { method: 'POST', json: { points: sample.points } })
      .then((r) => {
        if (!cancelled) journeyStore.update(journey.id, { profile: { stepM: sample.stepM, elevations: r.elevations } });
      })
      .catch((e) => !cancelled && setProfileState({ loading: false, error: e instanceof Error ? e.message : String(e) }))
      .finally(() => !cancelled && setProfileState((st) => ({ ...st, loading: false })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey.id, !!journey.profile]);
  const peekPoint = positionAt(points, cum, peekM * scale).point;

  // "since your last visit" – computed once when the data is ready, then remembered
  const [sinceLast, setSinceLast] = useState<{ m: number; at: string } | null>(null);
  const recorded = useRef(false);
  const ready = !journey.useStrava || !connected || activitiesQ.isSuccess;
  useEffect(() => {
    if (!ready || recorded.current) return;
    recorded.current = true;
    const prev = journey.lastSeen;
    if (prev && progress.doneM - prev.doneM > 50) setSinceLast({ m: progress.doneM - prev.doneM, at: prev.at });
    if (!prev || Math.abs(prev.doneM - progress.doneM) > 1) {
      journeyStore.update(journey.id, { lastSeen: { doneM: progress.doneM, at: new Date().toISOString() } });
    }
  }, [ready, journey.id, journey.lastSeen, progress.doneM]);

  // distance of each waypoint along the route, for the narrator's "coming up" list
  const waypointDist = useMemo(
    () =>
      journey.waypoints.map((w) => {
        let best = 0;
        let bestD = Infinity;
        points.forEach((p, i) => {
          const d = haversine(p, [w.lat, w.lon]);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        return { name: w.name, m: cum[best] / scale };
      }),
    [journey.waypoints, points, cum, scale],
  );

  const narrateBase = (fromM: number) => {
    const last = [...progress.entries].reverse().find((e) => !e.excluded);
    return {
      journey: {
        name: journey.name,
        from: journey.waypoints[0]?.name ?? 'Start',
        to: journey.waypoints[journey.waypoints.length - 1]?.name ?? 'Finish',
        totalM: progress.totalM,
        doneM: progress.doneM,
        sinceLastM: sinceLast?.m,
        lastActivity: last ? { name: last.label, distanceM: last.distanceM, date: last.date.slice(0, 10) } : undefined,
        upcoming: waypointDist.filter((w) => w.m > fromM + 500).map((w) => ({ name: w.name, inM: w.m - fromM })),
      },
    };
  };

  const quickPeeks = [5, 10, 25, 50, 100, 250]
    .map((k) => progress.doneM + fromUnit(k))
    .filter((m) => m < progress.totalM);


  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
        <IconButton onClick={() => navigate('/')} aria-label="back to journeys">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' }, overflowWrap: 'anywhere' }}>
            {journey.name}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {journey.waypoints.map((w) => w.name).join(' → ')} · {formatKm(journey.route.totalM, 0)} · counting since {formatDate(journey.startDate)}
            {journey.trail && (
              <>
                {' · '}
                <a href={`https://hiking.waymarkedtrails.org/#route?id=${journey.trail.osmId}`} target="_blank" rel="noopener" style={{ color: 'inherit' }}>
                  {journey.trail.ref ? `${journey.trail.ref} · ` : ''}trail info
                </a>
              </>
            )}
          </Typography>
        </Box>
        {connected && journey.useStrava && (
          <Tooltip title="Sync Strava">
            <IconButton onClick={syncNow} disabled={syncing} aria-label="sync strava">
              <RefreshIcon sx={{ animation: syncing ? 'spin 1s linear infinite' : undefined, '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
            </IconButton>
          </Tooltip>
        )}
        <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label="journey menu">
          <MoreIcon />
        </IconButton>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { setMenu(null); setSettingsOpen(true); }}>Settings</MenuItem>
          <MenuItem onClick={() => { setMenu(null); downloadGpx(journey); }}>Download route as GPX</MenuItem>
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              setMenu(null);
              if (confirm(`Delete "${journey.name}"? This can't be undone.`)) {
                journeyStore.remove(journey.id);
                navigate('/');
              }
            }}
          >
            Delete journey
          </MenuItem>
        </Menu>
      </Stack>

      {journey.useStrava && me?.features.strava && !connected && (
        <Alert severity="info" action={<StravaButton size="small" />}>
          Connect Strava so your runs move you along this route.
        </Alert>
      )}
      {syncError && (
        <Alert severity="error" onClose={() => setSyncError(null)}>
          Strava sync failed: {syncError}
        </Alert>
      )}
      {activitiesQ.error && <Alert severity="error">Could not load activities: {activitiesQ.error.message}</Alert>}

      {progress.finished && (
        <Alert severity="success" icon={<span style={{ fontSize: 28 }}>🏁</span>}>
          <AlertTitle>You've arrived in {journey.waypoints[journey.waypoints.length - 1]?.name ?? 'your destination'}!</AlertTitle>
          {formatKm(progress.totalM, 0)} done{progress.finishedOn ? ` on ${formatDate(progress.finishedOn)}` : ''}. Time to go there for real?{' '}
          <a href={`https://www.google.com/travel/flights?q=flights+to+${encodeURIComponent(journey.waypoints[journey.waypoints.length - 1]?.name ?? '')}`} target="_blank" rel="noopener">
            Plan the trip
          </a>
        </Alert>
      )}
      {sinceLast && !progress.finished && (
        <Alert severity="success" onClose={() => setSinceLast(null)}>
          Since your last visit ({formatDate(sinceLast.at)}) you've moved <strong>{formatKm(sinceLast.m)}</strong> further along the route.
        </Alert>
      )}

      <StatsRow p={progress} />

      <Card ref={mapRef} sx={{ overflow: 'hidden', position: 'relative', scrollMarginTop: 80 }}>
        <RouteMap
          points={points}
          cum={cum}
          doneM={progress.doneM * scale}
          waypoints={journey.waypoints}
          peekM={tab === 'ahead' ? peekM * scale : null}
          onPeek={(m) => {
            setPeekM(Math.max(0, Math.min(progress.totalM, m / scale)));
            setTab('ahead');
          }}
          flyToken={fly.token}
          flyTarget={fly.target}
          highlight={selected ? { fromM: selected.startM * scale, toM: selected.cumulativeM * scale } : null}
        />
        <Button
          variant="contained"
          size="small"
          startIcon={<MyLocationIcon />}
          onClick={() => setFly((f) => ({ token: f.token + 1, target: here }))}
          sx={{ position: 'absolute', left: 12, bottom: 12, zIndex: 1000 }}
        >
          Where am I?
        </Button>
        {selected && (
          <Chip
            label={`${selected.label} · ${formatDate(selected.date)} · ${formatKm(selected.countedM)}`}
            onDelete={() => setSelected(null)}
            sx={{ position: 'absolute', right: 12, bottom: 12, zIndex: 1000, bgcolor: '#f4b400', color: '#1d1d1d', maxWidth: '60%' }}
          />
        )}
      </Card>

      <ElevationProfile
        profile={journey.profile}
        loading={profileState.loading && !journey.profile}
        error={profileState.error}
        doneM={progress.doneM}
        highlight={selected ? { fromM: selected.startM, toM: selected.cumulativeM } : null}
        peekM={tab === 'ahead' ? peekM : null}
      />

      <GoalsCard journey={journey} progress={progress} waypointDist={waypointDist} />

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab value="here" label="Where I am" />
          <Tab value="ahead" label="Look ahead" disabled={progress.finished} />
        </Tabs>

        {tab === 'ahead' && (
          <Card sx={{ p: 2, mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Preview any point on the route: drag the slider, tap a chip, or click the line on the map.
            </Typography>
            <Slider
              value={peekM}
              min={0}
              max={progress.totalM}
              step={500}
              onChange={(_, v) => setPeekM(v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatKm(v, 0)}
              marks={[{ value: progress.doneM, label: 'you' }]}
            />
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              {quickPeeks.map((m) => (
                <Chip key={m} label={`+${formatKm(m - progress.doneM, 0)}`} onClick={() => setPeekM(m)} variant={Math.abs(m - peekM) < 1 ? 'filled' : 'outlined'} color="secondary" />
              ))}
              {waypointDist.slice(1).filter((w) => w.m > progress.doneM).map((w) => (
                <Chip key={w.name} label={w.name} onClick={() => setPeekM(w.m)} variant={Math.abs(w.m - peekM) < 1 ? 'filled' : 'outlined'} />
              ))}
            </Stack>
          </Card>
        )}

        {tab === 'here' ? (
          <LocationExplorer
            key="here"
            journeyId={journey.id}
            point={here}
            eyebrow={progress.finished ? 'You have arrived' : `You are here · ${getUnit()} ${toUnit(progress.doneM).toFixed(1)}`}
            narrate={narrateBase(progress.doneM)}
          />
        ) : (
          <LocationExplorer
            key="ahead"
            journeyId={journey.id}
            point={peekPoint}
            eyebrow={
              peekM > progress.doneM
                ? `In ${formatKm(peekM - progress.doneM, 0)} · ${getUnit()} ${toUnit(peekM).toFixed(0)}`
                : `Behind you · ${getUnit()} ${toUnit(peekM).toFixed(0)}`
            }
            narrate={{ ...narrateBase(peekM), peek: { aheadM: peekM - progress.doneM } }}
          />
        )}
      </Box>

      <ActivityLog journey={journey} progress={progress} selectedKey={selected?.key} onSelect={(e) => {
        setSelected(e);
        if (e) mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }} />
      <Typography variant="caption" color="text.secondary">
        Route: {journey.route.provider}. Map data © OpenStreetMap contributors. Photos: Wikimedia Commons{me?.features.mapillary ? ', Mapillary' : ''}. Weather: Open-Meteo.
      </Typography>
      <JourneySettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} journey={journey} />
    </Stack>
  );
}
