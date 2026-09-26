import AddAPhotoIcon from '@mui/icons-material/AddAPhotoOutlined';
import AddIcon from '@mui/icons-material/Add';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcardOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import LinkIcon from '@mui/icons-material/Link';
import LockIcon from '@mui/icons-material/LockOutlined';
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
  Link,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { rewardState, savingsTotal } from '../../shared/rewards';
import { formatKm } from '../lib/format';
import { locale, t } from '../lib/i18n';
import { navigate } from '../lib/nav';
import type { Progress } from '../lib/progress';
import { type RewardDraft, useRewardActions, useRewards } from '../lib/rewards';
import type { Journey, Reward } from '../lib/types';
import { uploadPhoto } from '../lib/uploads';
import PhotoImg from './PhotoImg';

const money = (v: number, currency: string) => new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(v);

/** Pick a photo, upload it, report the storage path. */
function PhotoPicker({ value, onChange, label }: { value: string | null; onChange: (p: string | null) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Stack spacing={1}>
      {value && (
        <Box sx={{ position: 'relative', borderRadius: '14px', overflow: 'hidden' }}>
          <PhotoImg path={value} height={140} />
          <IconButton size="small" onClick={() => onChange(null)} aria-label={t('Remove photo')} sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'background.paper', '&:hover': { bgcolor: 'background.paper' } }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
      <Button component="label" variant="outlined" startIcon={<AddAPhotoIcon />} loading={busy} sx={{ alignSelf: 'flex-start' }}>
        {value ? t('Change photo') : label}
        <input
          hidden
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            setError(null);
            try {
              onChange(await uploadPhoto(f));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

function RewardDialog({
  open,
  onClose,
  journey,
  progress,
  cities,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  journey: Journey;
  progress: Progress;
  cities: { name: string; m: number }[];
  editing: Reward | null;
}) {
  const actions = useRewardActions();
  const minM = Math.min(progress.totalM, Math.ceil((progress.doneM + 500) / 500) * 500);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [atM, setAtM] = useState(minM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setLink(editing?.link ?? '');
    setPhoto(editing?.photo ?? null);
    setAtM(editing?.atM ?? Math.min(progress.totalM, Math.max(minM, progress.doneM + Math.min(50_000, (progress.totalM - progress.doneM) / 3))));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);
  const ahead = cities.filter((c) => c.m > progress.doneM + 500);
  const save = async () => {
    setBusy(true);
    setError(null);
    const draft: RewardDraft = { title: title.trim(), atM, link: link.trim() || null, photo };
    try {
      if (editing) await actions.update(editing.id, draft);
      else await actions.create(journey.id, draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{editing ? t('Edit reward') : t('New reward on the route')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Treat')} placeholder={t('New running shoes, a massage, cake…')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Box>
            <Typography variant="body2" gutterBottom>
              {t('Unlocks at {km}', { km: formatKm(atM) })} · {t('{km} from where you are', { km: formatKm(atM - progress.doneM) })}
            </Typography>
            <Slider min={minM} max={progress.totalM} step={500} value={atM} onChange={(_, v) => setAtM(v as number)} valueLabelDisplay="auto" valueLabelFormat={(v) => formatKm(v, 0)} />
            {ahead.length > 0 && (
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                {ahead.slice(0, 8).map((c) => (
                  <Chip key={`${c.name}-${c.m}`} size="small" label={c.name} variant={Math.abs(c.m - atM) < 1 ? 'filled' : 'outlined'} onClick={() => setAtM(Math.round(c.m))} />
                ))}
              </Stack>
            )}
          </Box>
          <TextField label={t('Shop link (optional)')} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} slotProps={{ input: { startAdornment: <LinkIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }} />
          <PhotoPicker value={photo} onChange={setPhoto} label={t('Add a photo (optional)')} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save} loading={busy} disabled={!title.trim() || atM <= progress.doneM}>
          {editing ? t('Save') : t('Pin it')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ClaimDialog({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const actions = useRewardActions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPhoto(null);
    setNote('');
    setError(null);
  }, [reward?.id]);
  return (
    <Dialog open={!!reward} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>🎉 {reward?.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">{t('You earned it. Add a photo of your treat for the gallery, if you like.')}</Typography>
          <PhotoPicker value={photo} onChange={setPhoto} label={t('Add a photo')} />
          <TextField label={t('Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Later')}</Button>
        <Button
          variant="contained"
          loading={busy}
          onClick={async () => {
            if (!reward) return;
            setBusy(true);
            try {
              await actions.claim(reward.id, { photo: photo ?? undefined, note: note.trim() || undefined });
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('Claimed!')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Personal rewards pinned along the route, plus the savings jar. */
export default function RewardsCard({ journey, progress, cities }: { journey: Journey; progress: Progress; cities: { name: string; m: number }[] }) {
  const { data: rewards = [], error } = useRewards(journey.id);
  const actions = useRewardActions();
  const [dialog, setDialog] = useState<{ open: boolean; editing: Reward | null }>({ open: false, editing: null });
  const [claiming, setClaiming] = useState<Reward | null>(null);
  const saved = journey.savings ? savingsTotal(progress.loggedM, journey.savings.perKm) : 0;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
          <CardGiftcardIcon color="secondary" />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('Rewards on the route')}
          </Typography>
          <Button size="small" onClick={() => navigate('/collection')}>
            {t('Gallery')}
          </Button>
        </Stack>
        {journey.savings && (
          <Box sx={{ mb: 2, p: 1.5, borderRadius: '16px', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ fontSize: 30 }} aria-hidden>
              🫙
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'ui-rounded, "SF Pro Rounded", Nunito, sans-serif' }}>{money(saved, journey.savings.currency)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('Savings jar · {rate} per km', { rate: money(journey.savings.perKm, journey.savings.currency) })}
              </Typography>
            </Box>
          </Box>
        )}
        {error && <Alert severity="error">{error.message}</Alert>}
        {rewards.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('Pin a real-life treat somewhere ahead on your route. It unlocks only when you run there.')}
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mb: 1.5 }}>
            <AnimatePresence initial={false}>
              {rewards.map((r) => {
                const state = rewardState(r, progress.doneM);
                return (
                  <motion.div key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Stack
                      direction="row"
                      sx={{
                        alignItems: 'center',
                        gap: 1.5,
                        p: 1.25,
                        borderRadius: '14px',
                        border: 1,
                        borderColor: state === 'unlocked' ? 'secondary.main' : 'divider',
                        bgcolor: state === 'unlocked' ? 'rgb(91 91 240 / 8%)' : 'transparent',
                      }}
                    >
                      <Box sx={{ width: 44, height: 44, borderRadius: '12px', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', fontSize: 22 }}>
                        {r.photo ? <PhotoImg path={r.photo} height={44} /> : state === 'locked' ? '🎁' : state === 'unlocked' ? '✨' : '✅'}
                      </Box>
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography sx={{ fontWeight: 650 }} noWrap>
                          {r.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="div" noWrap>
                          {state === 'locked'
                            ? t('at {km} · {left} to go', { km: formatKm(r.atM, 0), left: formatKm(r.atM - progress.doneM) })
                            : state === 'unlocked'
                              ? t('Unlocked at {km}!', { km: formatKm(r.atM, 0) })
                              : t('Claimed')}
                          {r.link && (
                            <>
                              {' · '}
                              <Link href={r.link} target="_blank" rel="noopener">
                                {t('shop')}
                              </Link>
                            </>
                          )}
                        </Typography>
                      </Box>
                      {state === 'locked' && (
                        <>
                          <LockIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                          <IconButton size="small" aria-label={t('Edit reward')} onClick={() => setDialog({ open: true, editing: r })}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </>
                      )}
                      {state === 'unlocked' && (
                        <Button size="small" variant="contained" onClick={() => setClaiming(r)}>
                          {t('Claimed')}
                        </Button>
                      )}
                      <IconButton size="small" aria-label={t('Delete reward')} onClick={() => confirm(t('Remove "{title}"?', { title: r.title })) && actions.remove(r.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </Stack>
        )}
        {!progress.finished && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, editing: null })}>
            {t('Add a reward')}
          </Button>
        )}
      </CardContent>
      <RewardDialog open={dialog.open} editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} journey={journey} progress={progress} cities={cities} />
      <ClaimDialog reward={claiming} onClose={() => setClaiming(null)} />
    </Card>
  );
}
