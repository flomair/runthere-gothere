import { Add as AddIcon } from '../icons';
import { DirectionsBike as BikeIcon } from '../icons';
import { Hiking as HikingIcon } from '../icons';
import { DirectionsRun as RunIcon } from '../icons';
import { Close as CloseIcon } from '../icons';
import { Straighten as StraightIcon } from '../icons';
import { UploadFileOutlined as UploadIcon } from '../icons';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { navigate } from '../lib/nav';
import { finalizeClientRoute } from '../lib/gpx';
import { planRoute } from '../lib/api';
import { formatKm, todayIso } from '../lib/format';
import { journeyStore, newId } from '../lib/storage';
import { type GeoResult, type GroupMode, type Journey, type PlannedRoute, type RouteMode, SPORT_TYPES, type TrailRoute } from '../lib/types';
import PlaceField from './PlaceField';
import MiniMap from './MiniMap';
import TrailPicker from './TrailPicker';
import { t } from '../lib/i18n';
import { useGroupActions } from '../lib/groups';
import { Emoji } from './Emoji';
import { FriendEmails, withTyped } from './InviteDialog';

export interface JourneyPreset {
  name: string;
  from: string;
  to: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  preset?: JourneyPreset;
  stravaConnected: boolean;
  /** Open with "together with friends" preselected. */
  together?: boolean;
}

export default function NewJourneyDialog({ open, onClose, preset, stravaConnected, together = false }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState<'plan' | 'trail' | 'gpx'>('plan');
  const [name, setName] = useState('');
  const [from, setFrom] = useState<GeoResult | null>(null);
  const [to, setTo] = useState<GeoResult | null>(null);
  const [vias, setVias] = useState<{ key: string; place: GeoResult | null }[]>([]);
  const [mode, setMode] = useState<RouteMode>('foot');
  const [startDate, setStartDate] = useState(todayIso());
  const [sportTypes, setSportTypes] = useState<string[]>(['Run', 'TrailRun']);
  const [useStrava, setUseStrava] = useState(true);
  const [route, setRoute] = useState<(PlannedRoute & { mode: Journey['mode']; trail?: TrailRoute }) | null>(null);
  const [gpxName, setGpxName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<'solo' | GroupMode>('solo');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [shared, setShared] = useState<{ id: string; notAllowed: string[] } | null>(null);
  const groups = useGroupActions();

  // reset when (re)opened
  useEffect(() => {
    if (!open) return;
    setTab('plan');
    setName(preset?.name ?? '');
    setFrom(null);
    setTo(null);
    setVias([]);
    setMode('foot');
    setStartDate(todayIso());
    setRoute(null);
    setGpxName(null);
    setError(null);
    setUseStrava(true);
    setWho(together ? 'race' : 'solo');
    setEmails([]);
    setEmailInput('');
    setShared(null);
  }, [open, preset, together]);

  // any change to the inputs invalidates the calculated route
  useEffect(() => {
    if (tab === 'plan') setRoute(null);
  }, [from, to, vias, mode, tab]);

  const waypoints = [from, ...vias.map((v) => v.place), to].filter((p): p is GeoResult => !!p);
  const canPlan = !!from && !!to && vias.every((v) => v.place);

  const calculate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await planRoute(
        waypoints.map((w) => [w.lat, w.lon]),
        mode,
      );
      setRoute({ ...r, mode });
      if (!name && from && to) setName(`${from.name} → ${to.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadGpx = async (f: File) => {
    setError(null);
    try {
      const r = finalizeClientRoute(await f.text());
      setRoute({ ...r, mode: 'gpx' });
      setGpxName(f.name);
      if (!name) setName(f.name.replace(/\.gpx$/i, ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const create = async () => {
    if (!route) return;
    const pts = route.points;
    const endpoints = (a: string, b: string) => [
      { name: a, lat: pts[0][0], lon: pts[0][1] },
      { name: b, lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] },
    ];
    const wps =
      route.mode === 'gpx'
        ? endpoints(t('Start'), t('Finish'))
        : route.mode === 'trail' && route.trail
          ? endpoints(route.trail.startName, route.trail.endName)
          : waypoints.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon }));
    const j: Journey = {
      id: newId(),
      name: name.trim() || t('My journey'),
      createdAt: new Date().toISOString(),
      startDate,
      sportTypes,
      useStrava,
      manualEntries: [],
      excludedActivityIds: [],
      waypoints: wps,
      mode: route.mode,
      trail: route.trail
        ? {
            osmId: route.trail.trail.osmId,
            name: route.trail.trail.name,
            ref: route.trail.trail.ref,
            website: route.trail.trail.website,
            wikipedia: route.trail.trail.wikipedia,
          }
        : undefined,
      route: { points: route.points, totalM: route.totalM, provider: route.provider },
    };
    try {
      await journeyStore.add(j);
    } catch {
      return; // the error is shown by the app shell
    }
    if (who !== 'solo') {
      // the same target for the whole group: a shared journey on this route, friends invited
      setBusy(true);
      try {
        const r = await groups.create(j.id, j.name, who, withTyped(emails, emailInput));
        if (r.notAllowed.length) {
          setShared(r);
          return;
        }
        onClose();
        navigate(`/g/${r.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    onClose();
    navigate(`/j/${j.id}`);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pr: 6 }}>
        {who === 'solo' ? t('Plan a new journey') : t('Plan a destination together')}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Tabs value={tab} onChange={(_, v) => { setTab(v); setRoute(null); }} variant="fullWidth">
            <Tab value="plan" label={t('From A to B')} />
            <Tab value="trail" label={t('Classic trail')} />
            <Tab value="gpx" label={t('Upload GPX')} />
          </Tabs>

          {tab === 'plan' ? (
            <Stack spacing={2}>
              <PlaceField key={`from-${preset?.from}`} label={t('Start')} value={from} onChange={setFrom} initialQuery={preset?.from} autoFocus={!preset} />
              {vias.map((v, i) => (
                <Stack key={v.key} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <PlaceField
                      label={t('Via {n}', { n: i + 1 })}
                      value={v.place}
                      onChange={(place) => setVias((vs) => vs.map((x) => (x.key === v.key ? { ...x, place } : x)))}
                    />
                  </Box>
                  <IconButton onClick={() => setVias((vs) => vs.filter((x) => x.key !== v.key))} sx={{ mt: 1 }} aria-label="remove stop">
                    <CloseIcon />
                  </IconButton>
                </Stack>
              ))}
              <PlaceField key={`to-${preset?.to}`} label={t('Destination')} value={to} onChange={setTo} initialQuery={preset?.to} />
              <Box>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setVias((vs) => [...vs, { key: newId(), place: null }])} disabled={vias.length >= 10}>
                  {t('Add a stop on the way')}
                </Button>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t('Route along')}
                </Typography>
                <ToggleButtonGroup exclusive value={mode} onChange={(_, v) => v && setMode(v)} size="small" fullWidth>
                  <ToggleButton value="foot">
                    <RunIcon fontSize="small" sx={{ mr: { sm: 1 } }} /> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('Footpaths')}</Box>
                  </ToggleButton>
                  <ToggleButton value="hike">
                    <HikingIcon fontSize="small" sx={{ mr: { sm: 1 } }} /> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('Hiking trails')}</Box>
                  </ToggleButton>
                  <ToggleButton value="bike">
                    <BikeIcon fontSize="small" sx={{ mr: { sm: 1 } }} /> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('Bike routes')}</Box>
                  </ToggleButton>
                  <ToggleButton value="direct">
                    <StraightIcon fontSize="small" sx={{ mr: { sm: 1 } }} /> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('Straight')}</Box>
                  </ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  {t(
                    {
                      foot: 'Shortest walkable way on paths, tracks and quiet roads.',
                      hike: 'Prefers waymarked hiking routes and paths. Slower to plan, long routes are planned in sections.',
                      bike: 'Follows cycle routes; good for very long journeys.',
                      direct: 'As the crow flies.',
                    }[mode],
                  )}
                </Typography>
              </Box>
            </Stack>
          ) : tab === 'trail' ? (
            <TrailPicker
              onRoute={(r) => setRoute(r ? { ...r, mode: 'trail', trail: r } : null)}
              onName={(n) => setName((cur) => cur || n)}
            />
          ) : (
            <Box>
              <Button component="label" variant="outlined" startIcon={<UploadIcon />} fullWidth sx={{ py: 2, borderStyle: 'dashed' }}>
                {gpxName ?? t('Choose a .gpx file (e.g. exported from Komoot, Strava routes, Garmin)')}
                <input
                  hidden
                  type="file"
                  accept=".gpx,application/gpx+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void loadGpx(f);
                    e.target.value = '';
                  }}
                />
              </Button>
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {route && (
            <Box sx={{ p: 2, borderRadius: '16px', bgcolor: 'action.hover' }}>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 140, flexShrink: 0, borderRadius: '12px', overflow: 'hidden' }}>
                  <MiniMap points={route.points} doneM={0} height={100} />
                </Box>
                <Box>
                  <Typography variant="h4" component="div">
                    {formatKm(route.totalM, 0)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('via {provider}', { provider: route.provider })}
                  </Typography>
                </Box>
              </Stack>
              {route.notice && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  {route.notice}
                </Alert>
              )}
            </Box>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t("Who's coming?")}
            </Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={who} onChange={(_, v) => v && setWho(v)}>
              <ToggleButton value="solo" sx={{ flexDirection: 'column', textTransform: 'none', py: 1 }}>
                <Emoji name="runner" size={18} color="inherit" />
                <Box sx={{ fontWeight: 700 }}>{t('Just me')}</Box>
              </ToggleButton>
              <ToggleButton value="race" sx={{ flexDirection: 'column', textTransform: 'none', py: 1 }}>
                <Emoji name="finish" size={18} color="inherit" />
                <Box sx={{ fontWeight: 700 }}>{t('Race with friends')}</Box>
              </ToggleButton>
              <ToggleButton value="relay" sx={{ flexDirection: 'column', textTransform: 'none', py: 1 }}>
                <Emoji name="handshake" size={18} color="inherit" />
                <Box sx={{ fontWeight: 700 }}>{t('Relay as a team')}</Box>
              </ToggleButton>
            </ToggleButtonGroup>
            {who !== 'solo' && (
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {who === 'race' ? t('Everyone runs the whole route. Who arrives first?') : t('All kilometres add up. Get there as a team.')}{' '}
                  {t('You share the target, the map, a feed, race stages and a surprise bucket.')}
                </Typography>
                <FriendEmails emails={emails} setEmails={setEmails} input={emailInput} setInput={setEmailInput} />
              </Stack>
            )}
          </Box>
          {shared && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  onClick={() => {
                    onClose();
                    navigate(`/g/${shared.id}`);
                  }}
                >
                  {t('Open')}
                </Button>
              }
            >
              {t("{emails}: not on the app's guest list yet. Ask the owner to add them on the Admin page.", { emails: shared.notAllowed.join(', ') })}
            </Alert>
          )}
          <TextField label={t('Journey name')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Berlin → Vienna" />
          <TextField
            label={t('Count activities from')}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={t("Your Strava activities from this day on move you forward. Pick a past date to count runs you've already done.")}
          />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('Activities that count')}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {SPORT_TYPES.map((s) => {
                const on = sportTypes.includes(s.value);
                return (
                  <Chip
                    key={s.value}
                    label={t(s.label)}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => setSportTypes((cur) => (on ? cur.filter((x) => x !== s.value) : [...cur, s.value]))}
                  />
                );
              })}
            </Stack>
          </Box>
          <FormControlLabel
            control={<Switch checked={useStrava} onChange={(e) => setUseStrava(e.target.checked)} />}
            label={stravaConnected ? t('Use my Strava activities') : t('Use Strava activities (connect Strava to sync)')}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        {tab === 'plan' && !route ? (
          <Button variant="contained" onClick={calculate} disabled={!canPlan || busy} loading={busy}>
            {t('Calculate route')}
          </Button>
        ) : (
          <Button variant="contained" onClick={create} loading={busy} disabled={!route || !sportTypes.length || !!shared || (who !== 'solo' && !withTyped(emails, emailInput).length)}>
            {who === 'solo' ? t('Start journey') : t('Start together')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
