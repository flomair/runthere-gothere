import { Close as CloseIcon, DirectionsRun as RunIcon } from '../icons';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Dialog, DialogContent, IconButton, Stack, Typography, useMediaQuery, type Theme } from '@mui/material';
import { useState } from 'react';
import { useRunFeedback } from '../lib/api';
import { formatDate, formatDuration } from '../lib/format';
import { t } from '../lib/i18n';
import type { RunFeedback, RunFeedbackCheck, RunFeedbackStep } from '../lib/types';
import { CountUp } from './motion';

export const STATUS_COLOR: Record<RunFeedbackCheck['status'], string> = { ok: '#149A80', warning: '#C98F12', problem: '#C2477A' };
const STATUS_ICON: Record<RunFeedbackCheck['status'], string> = { ok: '✓', warning: '!', problem: '✕' };
const ZONE_COLOR = (z: string) => (z === 'Z1' ? '#3D6FA8' : z === 'Z2' ? '#149A80' : z.startsWith('>') ? '#C2477A' : '#C98F12');

const CHECK_TITLE: Record<RunFeedbackCheck['id'], string> = {
  streams: 'Sensors',
  stopSave: 'Stop & save',
  gaps: 'Gaps',
  duplicates: 'Duplicates',
  totals: 'Totals',
  laps: 'Laps',
  cadenceLock: 'Cadence lock',
  syncLatency: 'Sync',
};

const pace = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km` : '–');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Worst status among the checks. */
export const worstCheck = (checks: RunFeedbackCheck[]): RunFeedbackCheck['status'] =>
  checks.some((c) => c.status === 'problem') ? 'problem' : checks.some((c) => c.status === 'warning') ? 'warning' : 'ok';

function stepColor(s: RunFeedbackStep): string {
  if (!s.completed) return STATUS_COLOR.problem;
  if (s.inZonePct == null) return '#8A94A3';
  return s.inZonePct >= 80 ? STATUS_COLOR.ok : s.inZonePct >= 50 ? STATUS_COLOR.warning : STATUS_COLOR.problem;
}

function plannedText(s: RunFeedbackStep): string {
  const amount = s.planned.durationS != null ? clock(s.planned.durationS) : s.planned.distanceM != null ? `${(s.planned.distanceM / 1000).toLocaleString()} km` : '';
  const zone = s.planned.hrZones ? ` · ${s.planned.hrZones.join('–')} ${s.planned.hrMin}–${s.planned.hrMax}` : '';
  return amount + zone;
}

/** Stacked bar of seconds per HR zone. */
function ZoneBar({ zoneS }: { zoneS: Record<string, number> }) {
  const total = Object.values(zoneS).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const order = Object.keys(zoneS).sort();
  return (
    <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', mt: 0.5 }}>
      {order.map((z) => (
        <Box key={z} title={`${z}: ${clock(zoneS[z])}`} sx={{ width: `${(100 * zoneS[z]) / total}%`, bgcolor: ZONE_COLOR(z) }} />
      ))}
    </Box>
  );
}

/** HR over elapsed time with each step's target band behind it. */
function HrStrip({ f }: { f: RunFeedback }) {
  const { t: ts, bpm } = f.hr;
  if (ts.length < 2) return null;
  const W = 600;
  const H = 120;
  const end = ts[ts.length - 1];
  const bands = f.steps.filter((s) => s.planned.hrMin != null);
  const lo = Math.min(...bpm, ...bands.map((b) => Math.max(b.planned.hrMin!, 90))) - 5;
  const hi = Math.max(...bpm, ...bands.map((b) => b.planned.hrMax!)) + 5;
  const x = (s: number) => (s / end) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = ts.map((s, i) => `${x(s).toFixed(1)},${y(bpm[i]).toFixed(1)}`).join(' ');
  return (
    <Box sx={{ mt: 1.5 }}>
      <Box component="svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" sx={{ width: '100%', height: 120, display: 'block', borderRadius: '10px', bgcolor: 'action.hover' }} role="img" aria-label={t('Heart rate over time with target zones')}>
        {bands.map((b, i) => (
          <rect key={i} x={x(b.startS)} width={Math.max(1, x(b.endS) - x(b.startS))} y={y(Math.max(b.planned.hrMax!, lo))} height={Math.max(1, y(Math.max(b.planned.hrMin!, lo)) - y(b.planned.hrMax!))} fill={ZONE_COLOR(b.planned.hrZones![b.planned.hrZones!.length - 1])} opacity={0.18} />
        ))}
        {f.pauses.map((p, i) => (
          <line key={`p${i}`} x1={x(p.atS)} x2={x(p.atS)} y1={0} y2={H} stroke="currentColor" strokeDasharray="3 3" opacity={0.5} vectorEffect="non-scaling-stroke" />
        ))}
        <polyline points={line} fill="none" stroke="#C2477A" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">0:00</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('HR {lo}–{hi} bpm · bands = target zone · dashed = pause', { lo: Math.min(...bpm), hi: Math.max(...bpm) })}
        </Typography>
        <Typography variant="caption" color="text.secondary">{formatDuration(end)}</Typography>
      </Stack>
    </Box>
  );
}

function StepRow({ s }: { s: RunFeedbackStep }) {
  const color = stepColor(s);
  return (
    <Box sx={{ p: 1.25, borderRadius: '14px', bgcolor: 'action.hover', position: 'relative', overflow: 'hidden', '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: color } }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'baseline' }}>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {s.label || s.block}
            {s.rep ? ` ${s.rep}` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {t('Plan')}: {plannedText(s)}
          </Typography>
          <Typography variant="caption" component="div">
            {[clock(s.actual.movingS), s.actual.distanceM != null && `${(s.actual.distanceM / 1000).toFixed(2)} km`, pace(s.actual.paceSPerKm), s.actual.avgHr && `Ø ${s.actual.avgHr} bpm`].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <Chip size="small" label={s.inZonePct != null ? `${s.inZonePct}%` : s.completed ? '✓' : '✕'} sx={{ bgcolor: color, color: '#fff', height: 22, fontWeight: 700 }} />
      </Stack>
      <ZoneBar zoneS={s.actual.zoneS} />
    </Box>
  );
}

export function RunFeedbackCard({ f }: { f: RunFeedback }) {
  const worst = worstCheck(f.checks);
  const [checksOpen, setChecksOpen] = useState(worst !== 'ok');
  const o = f.overall;
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
          <RunIcon color="primary" />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {f.summary?.headline ?? t('Run feedback')}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              {[f.activityName, formatDate(f.startDateLocal.slice(0, 10)), f.deviceName].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'baseline', mb: 1 }}>
          {o.inZonePct != null && (
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.8rem', lineHeight: 1.1, color: o.zoneVerdictReliable ? undefined : 'text.disabled' }}>
                <CountUp value={o.inZonePct} format={(n) => `${n.toFixed(0)}%`} />
              </Typography>
              <Typography variant="caption" color="text.secondary">{t('in target zone')}</Typography>
            </Box>
          )}
          {o.stepsPlanned > 0 && (
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.8rem', lineHeight: 1.1 }}>
                {o.stepsCompleted}/{o.stepsPlanned}
              </Typography>
              <Typography variant="caption" color="text.secondary">{t('steps done')}</Typography>
            </Box>
          )}
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.8rem', lineHeight: 1.1 }}>{(o.distanceM / 1000).toFixed(1)} km</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDuration(o.movingS)}
              {o.plannedTimeS ? ` / ${t('plan')} ≈${formatDuration(o.plannedTimeS)}` : ''}
            </Typography>
          </Box>
        </Stack>

        {f.summary && (
          <Box sx={{ mb: 1.5 }}>
            <Typography sx={{ mb: 1 }}>{f.summary.text}</Typography>
            <Typography variant="body2">👍 {f.summary.keep}</Typography>
            <Typography variant="body2">🎯 {f.summary.change}</Typography>
          </Box>
        )}
        {!o.zoneVerdictReliable && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {f.summary?.dataNote ?? t('The heart-rate data looks unreliable, so take the zone verdict with a grain of salt.')}
          </Alert>
        )}
        {f.plan.source === 'none' && <Alert severity="info" sx={{ mb: 1.5 }}>{t('No planned workout for this day, so there are no zone targets to compare. The recording check still applies.')}</Alert>}
        {f.plan.source === 'coach' && <Alert severity="info" sx={{ mb: 1.5 }}>{t("Compared with your coach plan's type and distance only: it has no heart-rate targets.")}</Alert>}

        {f.steps.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              {f.plan.name || t('Steps')}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
              {f.alignment.method === 'laps' ? t('Matched by laps') : t('Matched by moving time')} · {f.alignment.note}
            </Typography>
            <Stack spacing={0.75}>
              {f.steps.map((s, i) => (
                <StepRow key={i} s={s} />
              ))}
            </Stack>
            <Stack direction="row" sx={{ gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
              {f.zones.map((z) => (
                <Typography key={z.name} variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: ZONE_COLOR(z.name) }} /> {z.name} {z.minBpm ? `${z.minBpm}–` : '≤'}
                  {z.maxBpm}
                </Typography>
              ))}
              <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: ZONE_COLOR('>') }} /> {t('above')}
              </Typography>
            </Stack>
          </>
        )}
        <HrStrip f={f} />

        <Button onClick={() => setChecksOpen((v) => !v)} sx={{ mt: 1.5, px: 0 }} color="inherit">
          <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: STATUS_COLOR[worst], mr: 1 }} />
          {t('Recording check')} {checksOpen ? '▴' : '▾'}
        </Button>
        <Collapse in={checksOpen}>
          <Stack spacing={0.75}>
            {f.checks.map((c) => (
              <Stack key={c.id} direction="row" sx={{ gap: 1, alignItems: 'flex-start' }}>
                <Box sx={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: STATUS_COLOR[c.status], color: '#fff', fontSize: 12, fontWeight: 800 }}>{STATUS_ICON[c.status]}</Box>
                <Typography variant="body2">
                  <b>{t(CHECK_TITLE[c.id])}</b>: {c.reason}
                </Typography>
              </Stack>
            ))}
            {f.pauses.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {t('Pauses')}: {f.pauses.map((p) => `${clock(p.atS)} (${Math.round(p.durationS)} s)`).join(', ')}
              </Typography>
            )}
          </Stack>
        </Collapse>
      </CardContent>
    </Card>
  );
}

/** Full-screen on phones: the feedback of one activity. */
export default function RunFeedbackDialog({ activityId, onClose }: { activityId: number | null; onClose: () => void }) {
  const { data, isLoading, error } = useRunFeedback(activityId);
  const fullScreen = useMediaQuery((th: Theme) => th.breakpoints.down('sm'));
  return (
    <Dialog open={activityId != null} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <IconButton aria-label={t('Close')} onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}>
        <CloseIcon />
      </IconButton>
      <DialogContent sx={{ p: { xs: 1, sm: 2 }, pt: { xs: 6, sm: 6 } }}>
        {isLoading ? (
          <CircularProgress sx={{ display: 'block', mx: 'auto', my: 6 }} />
        ) : error ? (
          <Alert severity="error">{error instanceof Error ? error.message : String(error)}</Alert>
        ) : data ? (
          <RunFeedbackCard f={data} />
        ) : (
          <Alert severity="info">{t('No feedback for this run yet. It appears here a few minutes after the run reaches Strava.')}</Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
