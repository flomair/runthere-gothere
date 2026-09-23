import { Box, Card, LinearProgress, Typography } from '@mui/material';
import { formatDate, formatKm, pct } from '../lib/format';
import type { Progress } from '../lib/progress';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h5" component="div" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="body2" color="text.secondary">
          {sub}
        </Typography>
      )}
    </Card>
  );
}

export default function StatsRow({ p }: { p: Progress }) {
  return (
    <Box>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <Stat label="Covered" value={formatKm(p.doneM)} sub={`${pct(p.fraction)} of ${formatKm(p.totalM, 0)}`} />
        <Stat label="To go" value={formatKm(p.remainingM)} sub={p.finished ? 'You made it!' : `${p.entries.filter((e) => !e.excluded).length} activities so far`} />
        <Stat label="Weekly pace" value={formatKm(p.weeklyAvgM)} sub="avg. over the last 4 weeks" />
        <Stat
          label={p.finished ? 'Arrived' : 'Estimated arrival'}
          value={p.finished ? (p.finishedOn ? formatDate(p.finishedOn) : '🎉') : p.eta ? formatDate(p.eta) : '—'}
          sub={p.finished ? undefined : p.eta ? 'at your current pace' : 'log a run to see an estimate'}
        />
      </Box>
      <LinearProgress variant="determinate" value={p.fraction * 100} sx={{ mt: 2, height: 10, borderRadius: 5 }} />
    </Box>
  );
}
