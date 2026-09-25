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
    ...ahead.slice(0, 3).map((w) => ({ title: `Reach ${w.name} by the end of the month`, targetM: w.m, deadline: endOfMonth() })),
    { title: `Run ${formatKm(50_000, 0)} in the next 2 weeks`, targetM: progress.doneM + 50_000, deadline: inDays(14) },
    { title: `Run ${formatKm(100_000, 0)} in the next 30 days`, targetM: progress.doneM + 100_000, deadline: inDays(30) },
  ].filter((s) => s.targetM <= progress.totalM);
  const [pick, setPick] = useState(0);
  const [deadline, setDeadline] = useState('');
  const chosen = suggestions[pick];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New challenge</DialogTitle>
      <DialogContent>
        {suggestions.length ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select label="Challenge" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              {suggestions.map((s, i) => (
                <MenuItem key={s.title} value={i}>
                  {s.title}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Deadline"
              value={deadline || chosen.deadline}
              onChange={(e) => setDeadline(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={`${formatKm(Math.max(0, chosen.targetM - progress.doneM))} to go`}
            />
          </Stack>
        ) : (
          <Typography color="text.secondary">You're almost at the finish, so there's nothing left to challenge yourself with on this route.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!chosen}
          onClick={() => {
            const d = deadline || chosen.deadline;
            journeyStore.update(journey.id, (j) => ({
              challenges: [
                ...(j.challenges ?? []),
                { id: newId(), title: chosen.title.replace(/by the end of the month|in the next \d+ (weeks|days)/, `by ${formatDate(d)}`), targetM: chosen.targetM, deadline: d, createdAt: todayIso() },
              ],
            }));
            setDeadline('');
            onClose();
          }}
        >
          Accept challenge
        </Button>
      </DialogActions>
    </Dialog>
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
            Goals &amp; records
          </Typography>
        </Stack>

        {/* arrival goal */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, mb: 2 }}>
          <TextField
            type="date"
            size="small"
            label="Arrive by"
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
                ? 'The goal date has passed. Pick a new one.'
                : `${formatKm(goal.requiredWeeklyM)} per week needed for the next ${goal.daysLeft} days. You average ${formatKm(progress.weeklyAvgM)}: ${goal.onTrack ? 'on track 👍' : 'time to add a run or two'}.`}
            </Alert>
          ) : (
            !progress.finished && (
              <Typography variant="body2" color="text.secondary">
                Set a date and see the weekly distance you need.
              </Typography>
            )
          )}
        </Stack>

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
                    <Chip size="small" color="success" label={`done${c.achievedOn ? ` ${formatDate(c.achievedOn)}` : ''}`} />
                  ) : c.expired ? (
                    <Chip size="small" label="missed" />
                  ) : (
                    <Chip size="small" variant="outlined" label={`${formatKm(c.remainingM)} · ${c.daysLeft} d left`} />
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
                Add a challenge
              </Button>
            </Box>
          )}
        </Stack>

        {/* streaks & records */}
        <Stagger sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
          <Tile
            label="Streak"
            value={<CountUp value={streaks.weeks} format={(n) => `${Math.round(n)} week${Math.round(n) === 1 ? '' : 's'}`} />}
            sub={streaks.days > 1 ? `🔥 ${streaks.days} days in a row` : `best: ${streaks.bestWeeks} weeks`}
          />
          <Tile label="Longest run" value={records.longest ? formatKm(records.longest.distanceM) : '—'} sub={records.longest ? formatDate(records.longest.date) : undefined} />
          <Tile
            label="Fastest pace"
            value={records.fastestPace ? formatPace(records.fastestPace.secPerKm) : '—'}
            sub={records.fastestPace ? `${records.fastestPace.label.slice(0, 22)}` : 'runs ≥ 3 km with time'}
          />
          <Tile label="Best week" value={records.bestWeek ? formatKm(records.bestWeek.distanceM) : '—'} sub={records.bestWeek ? `from ${formatDate(records.bestWeek.weekStart)}` : undefined} />
          <Tile
            label="Climbed"
            value={<CountUp value={records.climbedM} format={(n) => `${Math.round(n).toLocaleString()} m`} />}
            sub={journey.countElevation ? `+${formatKm(records.climbedM * 10, 0)} effort` : `${((records.climbedM / 8849) * 100).toFixed(0)}% of Everest`}
          />
        </Stagger>
        {streaks.weeks >= 4 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
            <LocalFireDepartmentIcon fontSize="inherit" color="warning" /> {streaks.weeks} weeks in a row. Keep it going!
          </Typography>
        )}
      </CardContent>
      <ChallengeDialog open={adding} onClose={() => setAdding(false)} journey={journey} progress={progress} waypointDist={waypointDist} />
    </Card>
  );
}
