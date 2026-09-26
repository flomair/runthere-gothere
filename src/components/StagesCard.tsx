import AddIcon from '@mui/icons-material/Add';
import FlagIcon from '@mui/icons-material/SportsScoreOutlined';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Slider,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { waypointPositions } from '../../shared/legs';
import { MIN_BASELINE_M, bonusLeaders, stageDays, stageWins } from '../../shared/stages';
import { useMe } from '../lib/api';
import { formatDate, formatKm, pct, todayIso } from '../lib/format';
import { t } from '../lib/i18n';
import { useStageActions, useStages } from '../lib/stages';
import type { Group, Journey, Stage } from '../lib/types';
import { AnimatedBar } from './motion';

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

/** Cities along the group route with their position (true metres). */
export function groupCities(g: Group) {
  return waypointPositions({ route: g.route, waypoints: g.waypoints } as Journey).map((w) => ({ name: w.name, m: w.m }));
}

function NewStageDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group: Group }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { create } = useStageActions(group.id);
  const cities = useMemo(() => groupCities(group), [group]);
  const total = group.route.totalM;
  const [range, setRange] = useState<[number, number]>([0, total]);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [startDate, setStartDate] = useState(todayIso());
  const [days, setDays] = useState('7');
  const [who, setWho] = useState<string[]>(group.memberUids);
  const [prize, setPrize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRange([0, Math.min(total, cities[1]?.m ?? total)]);
    setNameTouched(false);
    setWho(group.memberUids);
    setPrize('');
    setError(null);
    setStartDate(todayIso());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // name the stage after the nearest cities, until it is typed by hand
  const near = (m: number) => cities.reduce((a, b) => (Math.abs(b.m - m) < Math.abs(a.m - m) ? b : a), cities[0]);
  useEffect(() => {
    if (nameTouched || !cities.length) return;
    const a = near(range[0]).name;
    const b = near(range[1]).name;
    setName(a === b ? `${a} · ${formatKm(range[0], 0)}–${formatKm(range[1], 0)}` : `${a} → ${b}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, nameTouched, cities]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await create({ name, fromM: range[0], toM: range[1], startDate, days: Number(days), participants: who, prize });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>{t('New race stage')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25}>
          <Typography variant="body2" color="text.secondary">
            {t('Turn a stretch of the route into a race. Everyone is measured against their own usual weekly distance, so it is fair for all levels.')}
          </Typography>
          <Box sx={{ px: 1 }}>
            <Typography variant="subtitle2">
              {t('Segment')}: {formatKm(range[0], 0)} – {formatKm(range[1], 0)}
            </Typography>
            <Slider
              value={range}
              min={0}
              max={total}
              step={1000}
              onChange={(_, v) => setRange(v as [number, number])}
              marks={cities.map((c) => ({ value: c.m }))}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatKm(v, 0)}
              disableSwap
            />
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {cities.slice(1).map((c, i) => (
                <Chip key={c.name + i} size="small" label={c.name} onClick={() => setRange([cities[i].m, c.m])} />
              ))}
            </Stack>
          </Box>
          <TextField
            label={t('Stage name')}
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
          />
          <Stack direction="row" spacing={1.5}>
            <TextField label={t('Starts')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            <TextField
              label={t('Duration')}
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 60 }, input: { endAdornment: <InputAdornment position="end">{t('days')}</InputAdornment> } }}
              fullWidth
            />
          </Stack>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {t('Who races')}
            </Typography>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              {group.memberUids.map((u) => {
                const on = who.includes(u);
                return (
                  <Chip
                    key={u}
                    avatar={<Avatar src={group.members[u]?.picture}>{initials(group.members[u]?.name ?? '?')}</Avatar>}
                    label={group.members[u]?.name ?? '?'}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => setWho((w) => (on ? w.filter((x) => x !== u) : [...w, u]))}
                  />
                );
              })}
            </Stack>
          </Box>
          <TextField label={t('Stage prize')} placeholder={t('Winner picks the next café stop…')} value={prize} onChange={(e) => setPrize(e.target.value)} required />
          <Typography variant="caption" color="text.secondary">
            {t('Only tracked Strava runs count. Each baseline (average weekly distance of the 4 weeks before the start) is locked when the stage begins; at least {km} per week.', { km: formatKm(MIN_BASELINE_M, 0) })}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" loading={busy} disabled={who.length < 2 || !prize.trim() || range[1] - range[0] < 1000 || !(Number(days) >= 1)} onClick={submit}>
          {t('Start the stage')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function statusLine(s: Stage): string {
  const today = todayIso();
  const n = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  if (s.status === 'cancelled') return t('Called off');
  if (s.status === 'finished') return t('Finished');
  if (today < s.startDate) return t('Starts in {n} days', { n: n(today, s.startDate) });
  const left = n(today, s.endDate) + 1;
  return left > 0 ? t('{n} days left', { n: left }) : t('Last results coming in');
}

function StageItem({ s, group, colorOf, me }: { s: Stage; group: Group; colorOf: (uid: string) => string; me: string }) {
  const { act } = useStageActions(group.id);
  const [busy, setBusy] = useState(false);
  const name = (uid: string) => group.members[uid]?.name ?? t('Former member');
  const rows = s.results ?? s.participants.map((uid) => ({ uid, distanceM: 0, baselineM: s.baselines?.[uid] ?? 0, effort: 0 }));
  const live = s.status === 'running' || s.status === 'finished';
  const run = async (a: 'cancel' | 'delivered') => {
    setBusy(true);
    try {
      await act(s.id, a);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box sx={{ p: 1.5, borderRadius: '16px', border: 1, borderColor: s.status === 'running' ? 'secondary.main' : 'divider', opacity: s.status === 'cancelled' ? 0.6 : 1 }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800, flexGrow: 1 }}>🚩 {s.name}</Typography>
        <Chip size="small" color={s.status === 'running' ? 'secondary' : 'default'} label={statusLine(s)} />
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div">
        {formatDate(s.startDate)} – {formatDate(s.endDate)} · {t('{n} days', { n: stageDays(s) })} · {formatKm(s.fromM, 0)}–{formatKm(s.toM, 0)}
      </Typography>
      <Chip size="small" sx={{ mt: 0.75 }} label={`🏆 ${s.prize.text}`} color={s.prize.fulfillment.status === 'fulfilled' ? 'success' : 'default'} />
      <Stack spacing={1} sx={{ mt: 1.25 }}>
        {rows.map((r, i) => (
          <Stack key={r.uid} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <Typography sx={{ width: 18, fontWeight: 800, color: 'text.secondary', fontSize: 14 }}>{live ? i + 1 : ''}</Typography>
            <Avatar src={group.members[r.uid]?.picture} sx={{ width: 30, height: 30, bgcolor: colorOf(r.uid), fontSize: 12 }}>
              {initials(name(r.uid))}
            </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                  {s.winnerUid === r.uid ? '🏆 ' : s.status === 'running' && s.leaderUid === r.uid ? '👑 ' : ''}
                  {name(r.uid)}
                  {r.uid === me ? ` (${t('you')})` : ''}
                </Typography>
                {live && <Typography variant="body2" sx={{ fontWeight: 800 }}>{pct(r.effort)}</Typography>}
              </Stack>
              {live && <AnimatedBar value={Math.min(100, (r.effort / 1.5) * 100)} height={6} color={colorOf(r.uid)} />}
              <Typography variant="caption" color="text.secondary">
                {live
                  ? t('{km} · usual {base} / week', { km: formatKm(r.distanceM), base: formatKm(r.baselineM) })
                  : t('Baseline is locked when the stage starts')}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
      {s.createdBy === me && (s.status === 'scheduled' || s.status === 'running') && (
        <Button size="small" sx={{ mt: 1 }} loading={busy} onClick={() => run('cancel')}>
          {t('Call it off')}
        </Button>
      )}
      {s.createdBy === me && s.status === 'finished' && s.winnerUid && s.prize.fulfillment.status !== 'fulfilled' && (
        <Button size="small" variant="outlined" sx={{ mt: 1 }} loading={busy} onClick={() => run('delivered')}>
          {t('Prize delivered')}
        </Button>
      )}
    </Box>
  );
}

/** Race stages of a shared journey: effort vs. each runner's baseline, stage wins and the bonus prize. */
export default function StagesCard({ group, colorOf }: { group: Group; colorOf: (uid: string) => string }) {
  const { data: me } = useMe();
  const q = useStages(group.id);
  const { bonus } = useStageActions(group.id);
  const [open, setOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusText, setBonusText] = useState('');
  const uid = me?.user.uid ?? '';
  const stages = q.data ?? [];
  const wins = stageWins(stages);
  const leaders = bonusLeaders(stages);
  const dest = group.waypoints[group.waypoints.length - 1]?.name ?? t('the finish');
  const order = [...stages].sort((a, b) => {
    const rank = (s: Stage) => ({ running: 0, scheduled: 1, finished: 2, cancelled: 3 })[s.status];
    return rank(a) - rank(b) || b.startDate.localeCompare(a.startDate);
  });
  const nameOf = (u: string) => group.members[u]?.name?.split(' ')[0] ?? '?';

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
          <FlagIcon color="secondary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('Race stages')}
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setOpen(true)} disabled={group.memberUids.length < 2}>
            {t('New stage')}
          </Button>
        </Stack>

        <Box sx={{ p: 1.5, mb: 1.5, borderRadius: '16px', bgcolor: 'action.hover' }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700, flexGrow: 1 }}>
              🏆 {group.bonusPrize ? t('Bonus at {place}: {prize}', { place: dest, prize: group.bonusPrize.text }) : t('Bonus at {place} for the most stage wins', { place: dest })}
            </Typography>
            {group.ownerUid === uid && (
              <Button
                size="small"
                onClick={() => {
                  setBonusText(group.bonusPrize?.text ?? '');
                  setBonusOpen(true);
                }}
              >
                {group.bonusPrize ? t('Edit') : t('Set a bonus prize')}
              </Button>
            )}
            {group.bonusPrize?.setBy === uid && leaders.length > 0 && group.bonusPrize.fulfillment.status !== 'fulfilled' && (
              <Button size="small" variant="outlined" onClick={() => bonus({ action: 'delivered' })}>
                {t('Prize delivered')}
              </Button>
            )}
          </Stack>
          {Object.keys(wins).length > 0 ? (
            <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
              {Object.entries(wins)
                .sort((a, b) => b[1] - a[1])
                .map(([u, n]) => (
                  <Chip
                    key={u}
                    avatar={<Avatar src={group.members[u]?.picture} sx={{ bgcolor: colorOf(u) }}>{initials(group.members[u]?.name ?? '?')}</Avatar>}
                    label={`${nameOf(u)} · ${n === 1 ? t('1 stage win') : t('{n} stage wins', { n })}${leaders.includes(u) ? ' 👑' : ''}`}
                    variant={leaders.includes(u) ? 'filled' : 'outlined'}
                    color={leaders.includes(u) ? 'secondary' : 'default'}
                  />
                ))}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {t('No stage won yet.')}
            </Typography>
          )}
        </Box>

        {q.error && <Alert severity="error">{(q.error as Error).message}</Alert>}
        {!q.isLoading && !stages.length && (
          <Typography variant="body2" color="text.secondary">
            {t('Race any stretch of the route: pick a segment, a time window and a prize. Progress is shown as effort against each runner’s own usual weekly distance.')}
          </Typography>
        )}
        <Stack spacing={1.25}>
          {order.map((s) => (
            <StageItem key={s.id} s={s} group={group} colorOf={colorOf} me={uid} />
          ))}
        </Stack>
      </CardContent>
      <NewStageDialog open={open} onClose={() => setOpen(false)} group={group} />
      <Dialog open={bonusOpen} onClose={() => setBonusOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('Bonus prize')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('Whoever wins the most stages gets it at {place}.', { place: dest })}
          </Typography>
          <TextField fullWidth autoFocus label={t('Bonus prize')} placeholder={t('Dinner in Vienna')} value={bonusText} onChange={(e) => setBonusText(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBonusOpen(false)}>{t('Cancel')}</Button>
          <Button
            variant="contained"
            onClick={async () => {
              await bonus({ text: bonusText });
              setBonusOpen(false);
            }}
          >
            {t('Save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
