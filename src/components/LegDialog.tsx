import AddIcon from '@mui/icons-material/Add';
import BikeIcon from '@mui/icons-material/DirectionsBike';
import CloseIcon from '@mui/icons-material/Close';
import RunIcon from '@mui/icons-material/DirectionsRun';
import FlagIcon from '@mui/icons-material/OutlinedFlag';
import HikingIcon from '@mui/icons-material/Hiking';
import StraightIcon from '@mui/icons-material/Straighten';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { type LegPlan, appendLeg, currentLeg, legWaypoints, legsOf, replaceCurrentLeg } from '../../shared/legs';
import { planRoute } from '../lib/api';
import { formatKm } from '../lib/format';
import { t } from '../lib/i18n';
import { journeyStore, newId } from '../lib/storage';
import type { GeoResult, Journey, PlannedRoute, RouteMode, Waypoint } from '../lib/types';
import MiniMap from './MiniMap';
import PlaceField from './PlaceField';

const toGeo = (w: Waypoint): GeoResult => ({ name: w.name, displayName: w.name, lat: w.lat, lon: w.lon });
const toWaypoint = (g: GeoResult): Waypoint => ({ name: g.name, lat: g.lat, lon: g.lon });

interface Props {
  open: boolean;
  onClose: () => void;
  journey: Journey;
  /** 'next': continue from the current destination; 'edit': change the current leg's destination and stops. */
  kind: 'next' | 'edit';
  /** Kilometres logged in total (true metres), to show what carries over to the next leg. */
  loggedM: number;
}

/** Pick the next destination after arriving, or change the destination and stops of the current leg. */
export default function LegDialog({ open, onClose, journey, kind, loggedM }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const legs = legsOf(journey);
  const cur = currentLeg(journey);
  const curWps = legWaypoints(journey, legs.length - 1);
  // a new leg starts at the current destination; an edited leg keeps its start
  const start = kind === 'next' ? journey.waypoints[journey.waypoints.length - 1] : curWps[0];

  const [vias, setVias] = useState<{ key: string; place: GeoResult | null }[]>([]);
  const [dest, setDest] = useState<GeoResult | null>(null);
  const [mode, setMode] = useState<RouteMode>('foot');
  const [route, setRoute] = useState<PlannedRoute | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRoute(null);
    setError(null);
    setMode(cur.mode === 'hike' || cur.mode === 'bike' || cur.mode === 'direct' ? cur.mode : 'foot');
    if (kind === 'edit') {
      setVias(curWps.slice(1, -1).map((w) => ({ key: newId(), place: toGeo(w) })));
      setDest(toGeo(curWps[curWps.length - 1]));
    } else {
      setVias([]);
      setDest(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const waypoints: Waypoint[] | null = dest && vias.every((v) => v.place) ? [start, ...vias.map((v) => toWaypoint(v.place!)), toWaypoint(dest)] : null;
  const carryM = Math.max(0, loggedM - journey.route.totalM);

  const calculate = async () => {
    if (!waypoints) return;
    setBusy(true);
    setError(null);
    try {
      setRoute(await planRoute(waypoints.map((w) => [w.lat, w.lon]), mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!route || !waypoints) return;
    const plan: LegPlan = { route, waypoints, mode };
    journeyStore.update(journey.id, (j) => (kind === 'next' ? appendLeg(j, plan) : replaceCurrentLeg(j, plan)));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pr: 6 }}>
        {kind === 'next' ? t('Where to next?') : t('Change destination & stops')}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {kind === 'next'
              ? t('Your journey continues from {place} as one continuous line. Every kilometre keeps counting.', { place: start.name })
              : t('The current leg is planned again from {place}. Your kilometres stay; your position on the map may shift a little.', { place: start.name })}
          </Typography>
          <Chip icon={<FlagIcon />} label={t('From {place}', { place: start.name })} sx={{ alignSelf: 'flex-start' }} />
          {vias.map((v, i) => (
            <Stack key={v.key} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ flexGrow: 1 }}>
                <PlaceField
                  label={t('Via {n}', { n: i + 1 })}
                  value={v.place}
                  onChange={(place) => {
                    setRoute(null);
                    setVias((vs) => vs.map((x) => (x.key === v.key ? { ...x, place } : x)));
                  }}
                />
              </Box>
              <IconButton
                onClick={() => {
                  setRoute(null);
                  setVias((vs) => vs.filter((x) => x.key !== v.key));
                }}
                sx={{ mt: 1 }}
                aria-label="remove stop"
              >
                <CloseIcon />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setVias((vs) => [...vs, { key: newId(), place: null }])} disabled={vias.length >= 10}>
              {t('Add a stop on the way')}
            </Button>
          </Box>
          <PlaceField
            key={`dest-${open}`}
            label={t('New destination')}
            value={dest}
            onChange={(g) => {
              setRoute(null);
              setDest(g);
            }}
            autoFocus={kind === 'next'}
          />
          <ToggleButtonGroup
            exclusive
            value={mode}
            onChange={(_, v) => {
              if (!v) return;
              setMode(v);
              setRoute(null);
            }}
            size="small"
            fullWidth
          >
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
                    {kind === 'next'
                      ? t('Journey total: {km}', { km: formatKm(journey.route.totalM + route.totalM, 0) })
                      : t('Journey total: {km}', { km: formatKm(cur.startM + route.totalM, 0) })}
                  </Typography>
                </Box>
              </Stack>
              {kind === 'next' && carryM >= 100 && (
                <Alert severity="success" sx={{ mt: 1.5 }}>
                  {t('{km} you already ran past {place} count on this leg.', { km: formatKm(carryM), place: start.name })}
                </Alert>
              )}
              {route.notice && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  {route.notice}
                </Alert>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        {route ? (
          <Button variant="contained" onClick={save}>
            {kind === 'next' ? t('Continue the journey') : t('Save the new route')}
          </Button>
        ) : (
          <Button variant="contained" onClick={calculate} disabled={!waypoints || busy} loading={busy}>
            {t('Calculate route')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
