import { Add as AddIcon } from '../icons';
import { SportsKabaddiOutlined as SwordsIcon } from '../icons';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { clock, isFinished, questFraction, questTitle, validateQuest } from '../../shared/quests';
import { useMe } from '../lib/api';
import { formatDate, formatKm } from '../lib/format';
import { getLang, t } from '../lib/i18n';
import { type QuestDraft, useFriends, useQuestActions, useQuests } from '../lib/quests';
import { useJourneys } from '../lib/storage';
import type { Quest, QuestType } from '../lib/types';
import { fromUnit, getUnit } from '../lib/units';
import { Emoji, EmojiText, type EmojiName } from './Emoji';

/** 3D icon per quest type. */
export const QUEST_ICON: Record<QuestType, EmojiName> = { distance: 'medal', habit: 'repeat', race: 'finish', speed: 'zap' };

const TYPES: { value: QuestType; label: string; hint: string }[] = [
  { value: 'distance', label: 'Distance', hint: 'X km within Y days' },
  { value: 'habit', label: 'Habit', hint: 'N runs every week' },
  { value: 'race', label: 'Race', hint: 'First to X km wins' },
  { value: 'speed', label: 'Speed', hint: 'A distance under a time' },
];

/** "49:10" or "1:05:00" → seconds. */
function parseClock(s: string): number | null {
  const parts = s.trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Challenge a friend to a side quest. */
export function QuestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const friends = useFriends(open);
  const { create } = useQuestActions();
  const [to, setTo] = useState('');
  const [type, setType] = useState<QuestType>('distance');
  const [dist, setDist] = useState('50');
  const [days, setDays] = useState('14');
  const [runs, setRuns] = useState('3');
  const [weeks, setWeeks] = useState('3');
  const [time, setTime] = useState('50:00');
  const [gift, setGift] = useState('');
  const [penalty, setPenalty] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setGift('');
    setPenalty('');
    setMessage('');
  }, [open]);
  useEffect(() => {
    setDist(type === 'speed' ? '10' : type === 'race' ? '30' : '50');
  }, [type]);

  const draft: QuestDraft = {
    toEmail: to.trim(),
    type,
    days: type === 'habit' ? Number(weeks) * 7 : Number(days),
    params: type === 'habit' ? { runsPerWeek: Number(runs) } : type === 'speed' ? { distanceM: fromUnit(Number(dist)), timeS: parseClock(time) ?? 0 } : { distanceM: fromUnit(Number(dist)) },
    gift: gift.trim(),
    penalty: penalty.trim() || undefined,
    message: message.trim() || undefined,
  };
  const invalid = validateQuest(draft.type, draft.params, draft.days);
  const ready = !invalid && draft.toEmail.includes('@') && !!draft.gift;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await create(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>{t('Challenge a friend')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25}>
          <Autocomplete
            freeSolo
            options={friends.data ?? []}
            getOptionLabel={(o) => (typeof o === 'string' ? o : o.email)}
            renderOption={({ key, ...props }, o) => (
              <Box component="li" key={key} {...props} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <Avatar src={o.picture} sx={{ width: 28, height: 28 }}>
                  {o.name[0]}
                </Avatar>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {o.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {o.email}
                  </Typography>
                </Box>
              </Box>
            )}
            inputValue={to}
            onInputChange={(_, v) => setTo(v)}
            renderInput={(params) => (
              <TextField {...params} label={t('Friend')} placeholder="name@example.com" helperText={t('People you share a journey with, or anyone who can use the app')} />
            )}
          />
          <ToggleButtonGroup exclusive value={type} onChange={(_, v) => v && setType(v)} fullWidth sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' } }}>
            {TYPES.map((x) => (
              <ToggleButton key={x.value} value={x.value} sx={{ flexDirection: 'column', py: 1, textTransform: 'none', lineHeight: 1.2 }}>
                <Emoji name={QUEST_ICON[x.value]} size={26} color="inherit" />
                <Box sx={{ fontWeight: 700 }}>{t(x.label)}</Box>
                <Box sx={{ fontSize: 11, opacity: 0.75 }}>{t(x.hint)}</Box>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Stack direction={{ xs: type === 'speed' ? 'column' : 'row', sm: 'row' }} spacing={1.5}>
            {type === 'habit' ? (
              <>
                <TextField label={t('Runs per week')} type="number" value={runs} onChange={(e) => setRuns(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 14 } }} fullWidth />
                <TextField label={t('Weeks')} type="number" value={weeks} onChange={(e) => setWeeks(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 17 } }} fullWidth />
              </>
            ) : (
              <>
                <TextField
                  label={t('Distance')}
                  type="number"
                  value={dist}
                  onChange={(e) => setDist(e.target.value)}
                  slotProps={{ htmlInput: { min: 0.4, step: 0.1 }, input: { endAdornment: <InputAdornment position="end">{getUnit()}</InputAdornment> } }}
                  fullWidth
                />
                {type === 'speed' && <TextField label={t('Under (m:ss)')} value={time} onChange={(e) => setTime(e.target.value)} placeholder="50:00" fullWidth />}
                <TextField
                  label={type === 'race' ? t('Time limit') : t('Within')}
                  type="number"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  slotProps={{ htmlInput: { min: 1, max: 120 }, input: { endAdornment: <InputAdornment position="end">{t('days')}</InputAdornment> } }}
                  fullWidth
                />
              </>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {type === 'race'
              ? t('You race too: whoever runs the distance first after the challenge is accepted wins.')
              : t('Counts from the moment it is accepted. Quest kilometres keep counting toward the journey too.')}
          </Typography>
          <TextField label={t('Gift for the winner')} placeholder={t('Dinner on me, a new running shirt…')} value={gift} onChange={(e) => setGift(e.target.value)} required />
          <TextField label={t('Fun penalty (optional)')} placeholder={t('Sing in the rain, bake a cake…')} value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          <TextField label={t('Message (optional)')} value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={2} />
          {!invalid && (
            <Alert severity="info" icon={<Emoji name={QUEST_ICON[type]} size={22} />}>
              {questTitle(draft, getLang())}
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!ready} loading={busy} onClick={submit}>
          {t('Send challenge')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const STATUS_LABEL: Record<Quest['status'], string> = {
  offered: 'Waiting for an answer',
  accepted: 'Running',
  declined: 'Declined',
  cancelled: 'Called off',
  won: 'Completed',
  lost: 'Missed',
  expired: 'Expired',
};

function daysLeft(q: Quest) {
  if (!q.endsAt) return null;
  return Math.max(0, Math.ceil((Date.parse(q.endsAt) - Date.now()) / 86_400_000));
}

/** What the progress means, from the viewer's side. */
function progressText(q: Quest, me: string): string {
  const p = q.progress;
  if (!p) return t('No runs yet');
  switch (q.type) {
    case 'distance':
      return t('{done} of {target}', { done: formatKm(p.value), target: formatKm(p.target, 0) });
    case 'habit':
      return `${t('{n} of {total} weeks done', { n: p.value, total: p.target })}${p.weekRuns != null && q.status === 'accepted' ? ` · ${t('{n} of {need} runs this week', { n: p.weekRuns, need: q.params.runsPerWeek! })}` : ''}`;
    case 'race': {
      const mine = q.from.uid === me ? (p.rival ?? 0) : p.value;
      const theirs = q.from.uid === me ? p.value : (p.rival ?? 0);
      const other = q.from.uid === me ? q.to.name : q.from.name;
      return `${t('You')} ${formatKm(mine)} · ${other} ${formatKm(theirs)} / ${formatKm(p.target, 0)}`;
    }
    case 'speed':
      return p.bestS ? t('Best so far: {time} (goal {goal})', { time: clock(p.bestS), goal: clock(q.params.timeS!) }) : t('No run that long yet');
  }
}

function QuestItem({ q, me, journeyId }: { q: Quest; me: string; journeyId?: string }) {
  const { respond } = useQuestActions();
  const journeys = useJourneys();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(journeyId ?? journeys[0]?.id ?? '');
  const iAmFrom = q.from.uid === me;
  const other = iAmFrom ? q.to : q.from;
  const act = async (action: 'accept' | 'decline' | 'cancel' | 'delivered') => {
    setBusy(action);
    setError(null);
    try {
      await respond(q.id, action, action === 'accept' ? pick || undefined : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const left = daysLeft(q);
  const iWon = q.winnerUid === me;
  const incoming = q.status === 'offered' && !iAmFrom;

  return (
    <Box sx={{ p: 1.5, borderRadius: '16px', border: 1, borderColor: incoming ? 'secondary.main' : 'divider', bgcolor: incoming ? 'action.hover' : undefined }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <Avatar src={other.picture} sx={{ width: 40, height: 40 }}>
            {other.name[0]}
          </Avatar>
          <Box sx={{ position: 'absolute', right: -6, bottom: -6, bgcolor: 'background.paper', borderRadius: '50%', p: '3px', lineHeight: 0, boxShadow: 1 }}><Emoji name={QUEST_ICON[q.type]} size={14} draw={false} /></Box>
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{questTitle(q, getLang())}</Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {iAmFrom ? t('You challenged {name}', { name: other.name }) : t('{name} challenged you', { name: other.name })} · {t(STATUS_LABEL[q.status])}
            {q.status === 'accepted' && left != null ? ` · ${t('{n} days left', { n: left })}` : ''}
          </Typography>
          {q.message && (
            <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
              “{q.message}”
            </Typography>
          )}
          <Stack direction="row" sx={{ gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
            <Chip size="small" label={<EmojiText text={`🎁 ${q.gift.text}`} />} color={q.gift.fulfillment.status === 'fulfilled' ? 'success' : 'default'} />
            {q.penalty && <Chip size="small" variant="outlined" label={<EmojiText text={`😈 ${q.penalty}`} />} />}
          </Stack>
          {(q.status === 'accepted' || q.status === 'won' || q.status === 'lost') && (
            <Box sx={{ mt: 1 }}>
              <LinearProgress variant="determinate" value={questFraction(q) * 100} sx={{ height: 8, borderRadius: 4 }} color={q.status === 'lost' ? 'inherit' : 'secondary'} />
              <Typography variant="caption" color="text.secondary">
                {progressText(q, me)}
              </Typography>
            </Box>
          )}
          {q.badge && q.winnerUid && (
            <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 700 }}>
              {iWon ? t('{emoji} Badge earned!', { emoji: q.badge.emoji }) : t('{name} earned the badge', { name: q.winnerUid === q.from.uid ? q.from.name : q.to.name })}
            </Typography>
          )}
          {q.status === 'lost' && !iAmFrom && q.penalty && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {t('Penalty time: {penalty}', { penalty: q.penalty })}
            </Typography>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
          {incoming && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.25, alignItems: { sm: 'center' } }}>
              {!journeyId && journeys.length > 1 && (
                <TextField select size="small" label={t('Show on journey')} value={pick} onChange={(e) => setPick(e.target.value)} sx={{ minWidth: 180 }}>
                  {journeys.map((j) => (
                    <MenuItem key={j.id} value={j.id}>
                      {j.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="small" loading={busy === 'accept'} disabled={!!busy} onClick={() => act('accept')}>
                  {t('Accept')}
                </Button>
                <Button size="small" loading={busy === 'decline'} disabled={!!busy} onClick={() => act('decline')}>
                  {t('Decline')}
                </Button>
              </Stack>
            </Stack>
          )}
          {iAmFrom && (q.status === 'offered' || q.status === 'accepted') && (
            <Button size="small" sx={{ mt: 0.75 }} loading={busy === 'cancel'} onClick={() => act('cancel')}>
              {t('Call it off')}
            </Button>
          )}
          {iAmFrom && q.status === 'won' && q.gift.fulfillment.status !== 'fulfilled' && (
            <Button size="small" variant="outlined" sx={{ mt: 0.75 }} loading={busy === 'delivered'} onClick={() => act('delivered')}>
              {t('Gift delivered')}
            </Button>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

/** Challenges waiting for your answer (shown on top of a journey). */
export function QuestInvites({ journeyId }: { journeyId?: string }) {
  const { data: me } = useMe();
  const quests = useQuests();
  const uid = me?.user.uid ?? '';
  const incoming = (quests.data ?? []).filter((q) => q.status === 'offered' && q.from.uid !== uid);
  if (!uid || !incoming.length) return null;
  return (
    <Card sx={{ p: 1.5 }}>
      <Typography variant="overline" color="secondary" sx={{ fontWeight: 800, px: 0.5 }}>
        <Emoji name="swords" /> {t('Challenges for you')}
      </Typography>
      <Stack spacing={1}>
        {incoming.map((q) => (
          <QuestItem key={q.id} q={q} me={uid} journeyId={journeyId} />
        ))}
      </Stack>
    </Card>
  );
}

/** Side quests: invitations, running quests, sent offers and a few finished ones. */
export default function QuestsCard({ journeyId }: { journeyId?: string }) {
  const { data: me } = useMe();
  const quests = useQuests();
  const [dialog, setDialog] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const uid = me?.user.uid ?? '';
  const all = quests.data ?? [];
  const incoming = all.filter((q) => q.status === 'offered' && q.from.uid !== uid);
  const running = all.filter((q) => q.status === 'accepted');
  const sent = all.filter((q) => q.status === 'offered' && q.from.uid === uid);
  const done = all.filter((q) => isFinished(q.status)).sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt));

  const section = (title: string, list: Quest[]) =>
    list.length > 0 && (
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Stack spacing={1}>
          {list.map((q) => (
            <QuestItem key={q.id} q={q} me={uid} journeyId={journeyId} />
          ))}
        </Stack>
      </Box>
    );

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
          <SwordsIcon color="secondary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('Side quests')}
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setDialog(true)}>
            {t('Challenge a friend')}
          </Button>
        </Stack>
        {quests.error && <Alert severity="error">{String((quests.error as Error).message)}</Alert>}
        {!quests.isLoading && !all.length && (
          <Typography variant="body2" color="text.secondary">
            {t('Dare a friend: run a distance, keep a habit, race to a distance or beat a time. The winner gets the gift you promise.')}
          </Typography>
        )}
        <Stack spacing={1.5}>
          {section(t('Challenges for you'), incoming)}
          {section(t('Running'), running)}
          {section(t('Sent'), sent)}
          {done.length > 0 && (
            <Box>
              <Button size="small" onClick={() => setShowDone((v) => !v)}>
                {showDone ? t('Hide finished quests') : t('Finished quests ({n})', { n: done.length })}
              </Button>
              <Collapse in={showDone}>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {done.slice(0, 20).map((q) => (
                    <QuestItem key={q.id} q={q} me={uid} />
                  ))}
                </Stack>
              </Collapse>
            </Box>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
          {t('Only tracked runs count. Quest updates arrive with your Strava sync.')} {running[0]?.endsAt ? t('Next deadline: {date}', { date: formatDate(running.map((q) => q.endsAt!).sort()[0]) }) : ''}
        </Typography>
      </CardContent>
      <QuestDialog open={dialog} onClose={() => setDialog(false)} />
    </Card>
  );
}
