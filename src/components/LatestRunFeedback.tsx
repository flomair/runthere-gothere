import { DirectionsRun as RunIcon } from '../icons';
import { Box, Card, CardActionArea, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useRunFeedbackList } from '../lib/api';
import { formatDate } from '../lib/format';
import { t } from '../lib/i18n';
import RunFeedbackDialog, { STATUS_COLOR, worstCheck } from './RunFeedbackCard';

/** The feedback of the journey's latest run, if there is any. */
export default function LatestRunFeedback({ activityIds }: { activityIds: number[] }) {
  const { data } = useRunFeedbackList(activityIds.length > 0);
  const [open, setOpen] = useState<number | null>(null);
  const ids = new Set(activityIds);
  const f = data?.find((x) => ids.has(x.activityId));
  if (!f) return null;
  const o = f.overall;
  const worst = worstCheck(f.checks);
  return (
    <Card>
      <CardActionArea onClick={() => setOpen(f.activityId)} sx={{ p: 1.5 }}>
        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }}>
          <RunIcon color="primary" />
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {f.summary?.headline ?? t('Run feedback')}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              {[f.activityName, formatDate(f.startDateLocal.slice(0, 10)), o.stepsPlanned ? t('{done}/{n} steps', { done: o.stepsCompleted, n: o.stepsPlanned }) : null].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          {o.inZonePct != null && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', lineHeight: 1 }}>{o.inZonePct}%</Typography>
              <Typography variant="caption" color="text.secondary">{t('in zone')}</Typography>
            </Box>
          )}
          <Box title={t('Recording check')} sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: STATUS_COLOR[worst], flexShrink: 0 }} />
        </Stack>
      </CardActionArea>
      <RunFeedbackDialog activityId={open} onClose={() => setOpen(null)} />
    </Card>
  );
}
