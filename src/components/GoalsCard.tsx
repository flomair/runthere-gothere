import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import EmojiEventsIcon from '@mui/icons-material/EmojiEventsOutlined';
import FlagIcon from '@mui/icons-material/FlagOutlined';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { AnimatedBar, CountUp, Stagger, StaggerItem } from './motion';
import { formatDate, formatKm, formatPace, todayIso } from '../lib/format';
import type { Progress } from '../lib/progress';
import { journeyStore, newId } from '../lib/storage';
import type { Journey } from '../lib/types';
import { locale, t } from '../lib/i18n';

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <StaggerItem sx={{ p: 1.5, borderRadius: '16px', bgcolor: 'action.hover' }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.15rem' }}>{value}</Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" component="div" noWrap>
          {sub}
        </Typography>
      )}
    </StaggerItem>
  );
}

const endOfMonth = () => {
  const d = new Date();
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
};
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ChallengeDialog({
  open,
  onClose,
  journey,
  progress,
  waypointDist,
}: {
  open: boolean;
  onClose: () => void;
  journey: Journey;
  progress: Progress;
  waypointDist: { name: string; m: number }[];
}) {
  const ahead = waypointDist.filter((w) => w.m > progress.doneM + 500);
  const suggestions = [
    ...ahead.slice(0, 3).map((w) => ({
      title: t('Reach {place} by the end of the month', { place: w.name }),
      final: (d: string) => t('Reach {place} by {date}', { place: w.name, date: formatDate(d) }),
      targetM: w.m,
      deadline: endOfMonth(),
    })),
    { title: t('Run {km} in the next 2 weeks', { km: formatKm(50_000, 0) }), final: (d: string) => t('Run {km} by {date}', { km: formatKm(50_000, 0), date: formatDate(d) }), targetM: progress.doneM + 50_000, deadline: inDays(14) },
    { title: t('Run {km} in the next 30 days', { km: formatKm(100_000, 0) }), final: (d: string) => t('Run {km} by {date}', { km: formatKm(100_000, 0), date: formatDate(d) }), targetM: progress.doneM + 100_000, deadline: inDays(30) },
  ].filter((s) => s.targetM <= progress.totalM);
  const [pick, setPick] = useState(0);
  const [deadline, setDeadline] = useState('');
  const chosen = suggestions[pick];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('New challenge')}</DialogTitle>
      <DialogContent>
        {suggestions.length ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label={t('Challenge')} value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              {suggestions.map((s, i) => (
                <MenuItem key={s.title} value={i}>
                  {s.title}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label={t('Deadline')}
              value={deadline || chosen.deadline}
              onChange={(e) => setDeadline(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={`${formatKm(Math.max(0, chosen.targetM - progress.doneM))} to go`}
            />
          </Stack>
        ) : (
          <Typography color="text.secondary">{t("You're almost at the finish, so there's nothing left to challenge yourself with on this route.")}</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          variant="contained"
          disabled={!chosen}
          onClick={() => {
            const d = deadline || chosen.deadline;
            journeyStore.update(journey.id, (j) => ({
              challenges: [
                ...(j.challenges ?? []),
                { id: newId(), title: chosen.final(d), targetM: chosen.targetM, deadline: d, createdAt: todayIso() },
              ],
            }));
            setDeadline('');
            onClose();
          }}
        >
          {t('Accept challenge')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RaceEditor({ journey }: { journey: Journey }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(journey.event?.name ?? '');
  const [date, setDate] = useState(journey.event?.date ?? '');
  const [url, setUrl] = useState(journey.event?.url ?? '');
  const ev = journey.event;
  const daysTo = ev ? Math.ceil((new Date(`${ev.date}T09:00:00`).getTime() - Date.now()) / 86_400_000) : 0;
  if (!editing) {
    return (
      <Box sx={{ mb: 2 }}>
        {ev ? (
          <Alert
            severity="info"
            icon={<span style={{ fontSize: 22 }}>🏅</span>}
            action={
              <Button color="inherit" size="small" onClick={() => setEditing(true)}>
                {t('Edit')}
              </Button>
            }
          >
            <strong>{ev.url ? <a href={ev.url} target="_blank" rel="noopener" style={{ color: 'inherit' }}>{ev.name}</a> : ev.name}</strong> {t('on {date}', { date: formatDate(ev.date) })}
            {daysTo > 0 ? ` · ${t('{n} days to go', { n: daysTo })}` : daysTo === 0 ? ` · ${t('today!')}` : ` · ${t('done')}`}. {t('The journey is your build-up: arrive before the start line.')}
          </Alert>
        ) : (
          <Button size="small" onClick={() => setEditing(true)}>
            {t('🏅 Finish at a real race')}
          </Button>
        )}
      </Box>
    );
  }
  return (
    <Stack spacing={1.5} sx={{ mb: 2, p: 2, borderRadius: '16px', bgcolor: 'action.hover' }}>
      <Typography variant="subtitle2">{t('A real race at the destination')}</Typography>
      <TextField size="small" label={t('Race')} placeholder="Vienna City Marathon" value={name} onChange={(e) => setName(e.target.value)} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField size="small" type="date" label={t('Race day')} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" fullWidth label={t('Website (optional)')} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          size="small"
          disabled={!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
          onClick={() => {
            journeyStore.update(journey.id, {
              event: { name: name.trim(), date, url: /^https?:\/\//.test(url.trim()) ? url.trim() : undefined },
              goalDate: date,
            });
            setEditing(false);
          }}
        >
          {t('Save (also sets the arrival goal)')}
        </Button>
        {journey.event && (
          <Button
            size="small"
            color="error"
            onClick={() => {
              journeyStore.update(journey.id, { event: undefined });
              setEditing(false);
            }}
          >
            {t('Remove')}
          </Button>
        )}
        <Button size="small" onClick={() => setEditing(false)}>
          {t('Cancel')}
        </Button>
      </Stack>
    </Stack>
  );
}

export default function GoalsCard({ journey, progress, waypointDist }: { journey: Journey; progress: Progress; waypointDist: { name: string; m: number }[] }) {
  const [adding, setAdding] = useState(false);
  const { goal, streaks, records } = progress;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
          <EmojiEventsIcon color="primary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('Goals & records')}
          </Typography>
        </Stack>

        {/* arrival goal */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, mb: 2 }}>
          <TextField
            type="date"
            size="small"
            label={t('Arrive by')}
            value={journey.goalDate ?? ''}
            onChange={(e) => journeyStore.update(journey.id, { goalDate: e.target.value || undefined })}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayIso() } }}
            sx={{ minWidth: 170 }}
          />
          {goal && !progress.finished ? (
            <Alert
              severity={goal.onTrack ? 'success' : 'warning'}
              icon={<FlagIcon />}
              sx={{ flexGrow: 1, py: 0 }}
            >
              {goal.daysLeft === 0
                ? t('The goal date has passed. Pick a new one.')
                : t('{km} per week needed for the next {n} days. You average {avg}: {verdict}.', { km: formatKm(goal.requiredWeeklyM), n: goal.daysLeft, avg: formatKm(progress.weeklyAvgM), verdict: goal.onTrack ? t('on track 👍') : t('time to add a run or two') })}
            </Alert>
          ) : (
            !progress.finished && (
              <Typography variant="body2" color="text.secondary">
                {t('Set a date and see the weekly distance you need.')}
              </Typography>
            )
          )}
        </Stack>

        {/* real race at the finish */}
        <RaceEditor journey={journey} />

        {/* challenges */}
        <Stack spacing={1.25} sx={{ mb: 2 }}>
          {progress.challenges.map((c) => {
            const frac = c.achieved ? 1 : Math.min(1, progress.doneM / Math.max(1, c.targetM));
            return (
              <Box key={c.id}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
                    {c.title}
                  </Typography>
                  {c.achieved ? (
                    <Chip size="small" color="success" label={`${t('done')}${c.achievedOn ? ` ${formatDate(c.achievedOn)}` : ''}`} />
                  ) : c.expired ? (
                    <Chip size="small" label={t('missed')} />
                  ) : (
                    <Chip size="small" variant="outlined" label={`${formatKm(c.remainingM)} · ${t('{n} d left', { n: c.daysLeft })}`} />
                  )}
                  <IconButton
                    size="small"
                    aria-label="remove challenge"
                    onClick={() => journeyStore.update(journey.id, (j) => ({ challenges: (j.challenges ?? []).filter((x) => x.id !== c.id) }))}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <AnimatedBar value={frac * 100} height={8} color={c.achieved ? 'linear-gradient(90deg, #4caf50, #2e7d32)' : undefined} />
              </Box>
            );
          })}
          {!progress.finished && (
            <Box>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
                {t('Add a challenge')}
              </Button>
            </Box>
          )}
        </Stack>

        {/* streaks & records */}
        <Stagger sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
          <Tile
            label={t('Streak')}
            value={<CountUp value={streaks.weeks} format={(n) => (Math.round(n) === 1 ? t('1 week') : t('{n} weeks', { n: Math.round(n) }))} />}
            sub={streaks.days > 1 ? `🔥 ${t('{n} days in a row', { n: streaks.days })}` : (streaks.bestWeeks === 1 ? t('best: 1 week') : t('best: {n} weeks', { n: streaks.bestWeeks }))}
          />
          <Tile label={t('Longest run')} value={records.longest ? formatKm(records.longest.distanceM) : '—'} sub={records.longest ? formatDate(records.longest.date) : undefined} />
          <Tile
            label={t('Fastest pace')}
            value={records.fastestPace ? formatPace(records.fastestPace.secPerKm) : '—'}
            sub={records.fastestPace ? `${records.fastestPace.label.slice(0, 22)}` : t('runs ≥ 3 km with time')}
          />
          <Tile label={t('Best week')} value={records.bestWeek ? formatKm(records.bestWeek.distanceM) : '—'} sub={records.bestWeek ? t('from {date}', { date: formatDate(records.bestWeek.weekStart) }) : undefined} />
          <Tile
            label={t('Climbed')}
            value={<CountUp value={records.climbedM} format={(n) => `${Math.round(n).toLocaleString(locale())} m`} />}
            sub={journey.countElevation ? t('+{km} effort', { km: formatKm(records.climbedM * 10, 0) }) : t('{pct}% of Everest', { pct: ((records.climbedM / 8849) * 100).toFixed(0) })}
          />
        </Stagger>
        {streaks.weeks >= 4 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
            <LocalFireDepartmentIcon fontSize="inherit" color="warning" /> {t('{n} weeks in a row. Keep it going!', { n: streaks.weeks })}
          </Typography>
        )}
      </CardContent>
      <ChallengeDialog open={adding} onClose={() => setAdding(false)} journey={journey} progress={progress} waypointDist={waypointDist} />
    </Card>
  );
}
