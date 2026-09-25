import MyLocationIcon from '@mui/icons-material/MyLocation';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  Chip,
  Menu,
  MenuItem,
  Slider,
  Stack,
  type Theme,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { cumulativeDistances, haversine, positionAt, samplePoints } from '../../shared/geo';
import { navigate } from '../lib/nav';
import { api, useActivities, useMe, useMilestoneActions, useMilestones, useStravaActions } from '../lib/api';
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
const Flyover3D = lazy(() => import('./Flyover3D'));
const StreetSlideshow = lazy(() => import('./StreetSlideshow'));
import RouteMap from './RouteMap';
import CoachCard from './CoachCard';
import InviteDialog from './InviteDialog';
import JourneyHero from './JourneyHero';
import ShareDialog from './ShareDialog';
import { PageTransition, Reveal } from './motion';
import SectionNav, { type Section } from './SectionNav';
import StravaButton from './StravaButton';
import { getLang, locale, t } from '../lib/i18n';
import { milestoneTitle } from '../../shared/milestoneTitle';
import { HIGHLIGHT } from '../theme';

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
  const [section, setSection] = useState<Section>('overview');
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down('sm'));
  const [peekM, setPeekM] = useState<number>(() => Math.min(progress.totalM, progress.doneM + 10_000));
  const [fly, setFly] = useState<{ token: number; target: [number, number] | null }>({ token: 0, target: null });
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [flyover, setFlyover] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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

  // milestones: check once the runs are loaded (also covers manually added runs)
  const milestones = useMilestones(journey.id);
  const milestoneActions = useMilestoneActions();
  const checked = useRef(false);
  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    void milestoneActions.check(journey.id).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, journey.id]);
  const unseen = (milestones.data?.milestones ?? []).filter((m) => !m.seen);
  const countries = milestones.data?.countries ?? [];
  const reachedCountries = new Set([countries[0], ...(milestones.data?.milestones ?? []).filter((m) => m.kind === 'border').map((m) => m.countryCode)]);

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


  const menuEl = (
    <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
      <MenuItem onClick={() => { setMenu(null); setShareOpen(true); }}>{t('📤 Share card & public link')}</MenuItem>
      <MenuItem onClick={() => { setMenu(null); setInviteOpen(true); }}>{t('👥 Invite friends (race or relay)')}</MenuItem>
      <MenuItem onClick={() => { setMenu(null); navigate(`/j/${journey.id}/trip`); }}>{t('🧳 Plan the real trip')}</MenuItem>
      <MenuItem onClick={() => { setMenu(null); setSettingsOpen(true); }}>{t('Settings')}</MenuItem>
      <MenuItem onClick={() => { setMenu(null); downloadGpx(journey); }}>{t('Download route as GPX')}</MenuItem>
      {journey.trail && (
        <MenuItem component="a" href={`https://hiking.waymarkedtrails.org/#route?id=${journey.trail.osmId}`} target="_blank" onClick={() => setMenu(null)}>
          {t('Trail info (Waymarked Trails)')}
        </MenuItem>
      )}
      <MenuItem
        sx={{ color: 'error.main' }}
        onClick={() => {
          setMenu(null);
          if (confirm(t('Delete "{name}"? This can\'t be undone.', { name: journey.name }))) {
            journeyStore.remove(journey.id);
            navigate('/');
          }
        }}
      >
        {t('Delete journey')}
      </MenuItem>
    </Menu>
  );

  const banners = (
    <AnimatePresence initial={false}>
      {journey.useStrava && me?.features.strava && !connected && (
        <Pop key="connect">
          <Alert severity="info" action={<StravaButton size="small" />}>
            {t('Connect Strava so your runs move you along this route.')}
          </Alert>
        </Pop>
      )}
      {syncError && (
        <Pop key="syncerr">
          <Alert severity="error" onClose={() => setSyncError(null)}>
            {t('Strava sync failed: {error}', { error: syncError })}
          </Alert>
        </Pop>
      )}
      {activitiesQ.error && (
        <Pop key="acterr">
          <Alert severity="error">{t('Could not load activities: {error}', { error: activitiesQ.error.message })}</Alert>
        </Pop>
      )}
      {progress.finished && (
        <Pop key="finished">
          <Alert severity="success" icon={<span style={{ fontSize: 28 }}>🏁</span>}>
            <AlertTitle>{t("You've arrived in {place}!", { place: journey.waypoints[journey.waypoints.length - 1]?.name ?? t('your destination') })}</AlertTitle>
            {progress.finishedOn ? t('{km} done on {date}.', { km: formatKm(progress.totalM, 0), date: formatDate(progress.finishedOn) }) : t('{km} done.', { km: formatKm(progress.totalM, 0) })}{' '}
            {t('Time to go there for real?')}{' '}
            <Button size="small" color="inherit" variant="outlined" onClick={() => navigate(`/j/${journey.id}/trip`)} sx={{ ml: 0.5 }}>
              {t('Plan the real trip')}
            </Button>
          </Alert>
        </Pop>
      )}
      {sinceLast && !progress.finished && (
        <Pop key="since">
          <Alert severity="success" icon={<span style={{ fontSize: 22 }}>🏃</span>} onClose={() => setSinceLast(null)}>
            {t('Since your last visit ({date}) you have moved', { date: formatDate(sinceLast.at) })} <strong>{formatKm(sinceLast.m)}</strong> {t('further along the route.')}
          </Alert>
        </Pop>
      )}
      {unseen.length > 0 && (
        <Pop key="postcards">
          <Alert
            severity="info"
            icon={
              <motion.span
                style={{ fontSize: 24, display: 'inline-block' }}
                animate={{ rotate: [0, -12, 10, -6, 0], y: [0, -3, 0] }}
                transition={{ duration: 1.2, repeat: 2, repeatDelay: 1.5 }}
              >
                📮
              </motion.span>
            }
            action={
              <Button color="inherit" onClick={() => navigate(`/j/${journey.id}/diary`)}>
                {t('Open diary')}
              </Button>
            }
          >
            {unseen.length === 1 ? t('New postcard: {title}', { title: milestoneTitle(unseen[0], getLang()) }) : t('{n} new postcards, latest: {title}', { n: unseen.length, title: milestoneTitle(unseen[unseen.length - 1], getLang()) })}
          </Alert>
        </Pop>
      )}
    </AnimatePresence>
  );

  const mapCard = (
    <Card ref={mapRef} sx={{ overflow: 'hidden', position: 'relative', scrollMarginTop: 120, p: 0 }}>
      <RouteMap
        points={points}
        cum={cum}
        doneM={progress.doneM * scale}
        waypoints={journey.waypoints}
        peekM={section === 'explore' && tab === 'ahead' ? peekM * scale : null}
        onPeek={(m) => {
          setPeekM(Math.max(0, Math.min(progress.totalM, m / scale)));
          setTab('ahead');
          setSection('explore');
        }}
        flyToken={fly.token}
        flyTarget={fly.target}
        highlight={selected ? { fromM: selected.startM * scale, toM: selected.cumulativeM * scale } : null}
        height={isMobile ? 360 : 480}
      />
      <Button
        variant="contained"
        size="small"
        color="secondary"
        startIcon={<MyLocationIcon />}
        onClick={() => setFly((f) => ({ token: f.token + 1, target: here }))}
        sx={{ position: 'absolute', zIndex: 1000, left: { xs: '50%', sm: 12 }, top: { xs: 12, sm: 'auto' }, bottom: { sm: 12 }, transform: { xs: 'translateX(-50%)', sm: 'none' } }}
      >
        {t('Where am I?')}
      </Button>
      <Button
        variant="contained"
        size="small"
        color="inherit"
        startIcon={<ThreeDRotationIcon />}
        onClick={() => setFlyover(true)}
        sx={{ position: 'absolute', zIndex: 1000, left: { xs: 12, sm: 148 }, bottom: { xs: 22, sm: 12 }, bgcolor: 'background.paper', color: 'text.primary', boxShadow: 2, '&:hover': { bgcolor: 'background.paper' } }}
      >
        3D
      </Button>
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 1000, maxWidth: '62%' }}
          >
            <Chip
              label={`${selected.label} · ${formatDate(selected.date)} · ${formatKm(selected.countedM)}`}
              onDelete={() => setSelected(null)}
              sx={{ bgcolor: HIGHLIGHT, color: '#14171C', maxWidth: '100%', boxShadow: 3 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );

  const explore = (
    <Stack spacing={2}>
      <ToggleButtonGroup exclusive value={tab} onChange={(_, v) => v && setTab(v)} fullWidth sx={{ bgcolor: 'background.paper', borderRadius: 999, '& .MuiToggleButton-root': { border: 0, borderRadius: '999px !important', py: 1 }, '& .Mui-selected': { bgcolor: 'action.selected' } }}>
        <ToggleButton value="here">{t('📍 Where I am')}</ToggleButton>
        <ToggleButton value="ahead" disabled={progress.finished}>
          {t('👀 Look ahead')}
        </ToggleButton>
      </ToggleButtonGroup>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, x: tab === 'ahead' ? 24 : -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: tab === 'ahead' ? -24 : 24 }} transition={{ duration: 0.25 }}>
          <Stack spacing={2}>
            {tab === 'ahead' && (
              <Card sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('Preview any point on the route: drag the slider, tap a chip, or tap the line on the map.')}
                </Typography>
                <Slider
                  value={peekM}
                  min={0}
                  max={progress.totalM}
                  step={500}
                  onChange={(_, v) => setPeekM(v as number)}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => formatKm(v, 0)}
                  marks={[{ value: progress.doneM, label: t('you') }]}
                />
                <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  {quickPeeks.map((m) => (
                    <Chip key={m} label={`+${formatKm(m - progress.doneM, 0)}`} onClick={() => setPeekM(m)} variant={Math.abs(m - peekM) < 1 ? 'filled' : 'outlined'} />
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
                eyebrow={progress.finished ? t('You have arrived') : `${t('You are here')} · ${getUnit()} ${toUnit(progress.doneM).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`}
                narrate={narrateBase(progress.doneM)}
                onSlideshow={() => setSlideshow(true)}
              />
            ) : (
              <LocationExplorer
                key="ahead"
                journeyId={journey.id}
                point={peekPoint}
                eyebrow={
                  peekM > progress.doneM
                    ? `${t('In {km}', { km: formatKm(peekM - progress.doneM, 0) })} · ${getUnit()} ${toUnit(peekM).toLocaleString(locale(), { maximumFractionDigits: 0 })}`
                    : `${t('Behind you')} · ${getUnit()} ${toUnit(peekM).toLocaleString(locale(), { maximumFractionDigits: 0 })}`
                }
                narrate={{ ...narrateBase(peekM), peek: { aheadM: peekM - progress.doneM } }}
              />
            )}
          </Stack>
        </motion.div>
      </AnimatePresence>
    </Stack>
  );

  return (
    <Stack spacing={2.5} sx={{ pb: { xs: 10, sm: 0 } }}>
      <JourneyHero
        journey={journey}
        progress={progress}
        countries={countries}
        reachedCountries={reachedCountries}
        unseen={unseen.length}
        syncing={syncing}
        onSync={connected && journey.useStrava ? syncNow : undefined}
        onMenu={setMenu}
      />
      {menuEl}
      <Stack spacing={1.5}>{banners}</Stack>
      <SectionNav value={section} onChange={setSection} onDiary={() => navigate(`/j/${journey.id}/diary`)} unseen={unseen.length} />
      <PageTransition routeKey={section}>
        {section === 'overview' && (
          <Stack spacing={2.5}>
            {mapCard}
            <Reveal>
              <ElevationProfile
                profile={journey.profile}
                loading={profileState.loading && !journey.profile}
                error={profileState.error}
                doneM={progress.doneM}
                highlight={selected ? { fromM: selected.startM, toM: selected.cumulativeM } : null}
                peekM={null}
              />
            </Reveal>
          </Stack>
        )}
        {section === 'explore' && explore}
        {section === 'goals' && (
          <Stack spacing={2.5}>
            <GoalsCard journey={journey} progress={progress} waypointDist={waypointDist} />
            <CoachCard journeyId={journey.id} />
          </Stack>
        )}
        {section === 'log' && (
          <ActivityLog
            journey={journey}
            progress={progress}
            selectedKey={selected?.key}
            onSelect={(e) => {
              setSelected(e);
              if (e) {
                setSection('overview');
                setTimeout(() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
              }
            }}
          />
        )}
      </PageTransition>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t('Route: {provider}. Map data © OpenStreetMap contributors. Photos: Wikimedia Commons{mly}. Weather: Open-Meteo.', { provider: journey.route.provider, mly: me?.features.mapillary ? ', Mapillary' : '' })}
      </Typography>
      {slideshow && (
        <Suspense fallback={null}>
          <StreetSlideshow open onClose={() => setSlideshow(false)} points={points} cum={cum} doneM={progress.doneM * scale} journeyM={progress.totalM} title={journey.name} />
        </Suspense>
      )}
      {flyover && (
        <Suspense fallback={null}>
          <Flyover3D open onClose={() => setFlyover(false)} points={points} cum={cum} doneM={progress.doneM * scale} title={journey.name} journeyM={progress.totalM} />
        </Suspense>
      )}
      <JourneySettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} journey={journey} />
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} journey={journey} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} journey={journey} doneM={progress.doneM} />
    </Stack>
  );
}

function Pop({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      {children}
    </motion.div>
  );
}
