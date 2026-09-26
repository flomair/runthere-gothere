import { Add as AddIcon } from '../icons';
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
  FormControlLabel,
  Skeleton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { TIERS, tierOdds } from '../../shared/bucket';
import { useMe } from '../lib/api';
import { useBucket, useBucketActions, usePrizePhoto } from '../lib/bucket';
import { formatDate, formatKm } from '../lib/format';
import { milestoneTitle } from '../../shared/milestoneTitle';
import { getLang, t } from '../lib/i18n';
import type { BucketView, Draw, Group, Milestone, Prize, PrizeTier } from '../lib/types';
import { ROUNDED } from '../theme';
import { PhotoPicker } from './RewardsCard';
import { Emoji, EmojiText, type EmojiName } from './Emoji';

export const TIER_STYLE: Record<PrizeTier, { label: string; emoji: EmojiName; color: string; bg: string }> = {
  small: { label: 'Small', emoji: 'candy', color: '#149A80', bg: 'linear-gradient(135deg, #1FB597, #149A80)' },
  medium: { label: 'Medium', emoji: 'ribbon', color: '#5B5BF0', bg: 'linear-gradient(135deg, #3F7CF6, #6A67F0 55%, #A259E8)' },
  rare: { label: 'Rare', emoji: 'gem', color: '#C98A12', bg: 'linear-gradient(135deg, #F5C451, #E8B03A 45%, #D9772B)' },
};

/** Draw labels are stored in English; show them in the reader's language. */
function drawLabel(d: Draw): string {
  switch (d.source) {
    case 'pin':
      return t('Mystery pin at {km}', { km: /at (\d+) km/.exec(d.label)?.[1] ? formatKm(Number(/at (\d+) km/.exec(d.label)![1]) * 1000, 0) : '' });
    case 'stage':
      return t('Stage win: {name}', { name: d.label.replace(/^Stage win: /, '') });
    case 'drop':
      return t('Lucky week of {date}', { date: formatDate(d.label.replace(/^Lucky week of /, '')) });
    case 'milestone': {
      const kind = (/^ms_.+?_(waypoint|finish|halfway)_/.exec(d.id)?.[1] ?? 'waypoint') as Milestone['kind'];
      return milestoneTitle({ kind, title: d.label }, getLang());
    }
  }
}

const SOURCE_EMOJI: Record<Draw['source'], EmojiName> = { pin: 'question', stage: 'trophy', drop: 'clover', milestone: 'pin' };

function AddPrizeDialog({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId: string }) {
  const { add } = useBucketActions(groupId);
  const [title, setTitle] = useState('');
  const [tier, setTier] = useState<PrizeTier>('small');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTitle('');
      setError(null);
    }
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Add a surprise')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('It stays hidden until someone draws it. You never draw your own surprises.')}
          </Typography>
          <TextField label={t('Surprise')} placeholder={t('Homemade cake, a book you loved, a massage…')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <ToggleButtonGroup exclusive fullWidth value={tier} onChange={(_, v) => v && setTier(v)}>
            {TIERS.map((x) => (
              <ToggleButton key={x} value={x} sx={{ flexDirection: 'column', textTransform: 'none', py: 1 }}>
                <Emoji name={TIER_STYLE[x].emoji} size={26} color="inherit" />
                <Box sx={{ fontWeight: 700 }}>{t(TIER_STYLE[x].label)}</Box>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormControlLabel control={<Switch checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />} label={t('Give anonymously')} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          variant="contained"
          disabled={!title.trim()}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await add(title, tier, anonymous);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('Into the bucket')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const sparks = Array.from({ length: 18 }, (_, i) => ({ a: (i / 18) * Math.PI * 2, d: 90 + (i % 3) * 30, e: (['sparkles', 'party', 'star'] as const)[i % 3] }));

/** Shake the box, burst, reveal. The server has already picked the prize when the box opens. */
function RevealDialog({ open, onClose, groupId, draw }: { open: boolean; onClose: () => void; groupId: string; draw: Draw | null }) {
  const actions = useBucketActions(groupId);
  const [phase, setPhase] = useState<'shake' | 'open' | 'error'>('shake');
  const [prize, setPrize] = useState<Prize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !draw) return;
    setPhase('shake');
    setPrize(null);
    setError(null);
    setPhoto(null);
    setDelivering(false);
    let alive = true;
    const minWait = new Promise((r) => setTimeout(r, 1600));
    actions
      .draw(draw.id)
      .then(async (r) => {
        await minWait;
        if (!alive) return;
        setPrize(r.prize);
        setPhase('open');
      })
      .catch(async (e) => {
        await minWait;
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draw?.id]);

  const close = () => {
    void actions.refresh();
    onClose();
  };
  const style = prize ? TIER_STYLE[prize.tier] : null;

  return (
    <Dialog open={open} onClose={phase === 'shake' ? undefined : close} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { overflow: 'hidden' } } }}>
      <Box sx={{ position: 'relative', height: 260, display: 'grid', placeItems: 'center', background: style ? style.bg : 'linear-gradient(135deg, #3F7CF6, #6A67F0 55%, #A259E8)', color: '#fff', transition: 'background .6s' }}>
        <AnimatePresence mode="wait">
          {phase !== 'open' ? (
            <motion.div
              key="box"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={phase === 'shake' ? { scale: [1, 1.05, 1, 1.08, 1], rotate: [0, -12, 12, -16, 16, -8, 8, 0], opacity: 1 } : { scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 1.8, opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.9, repeat: phase === 'shake' ? Infinity : 0 }}
              style={{ fontSize: 96, lineHeight: 1 }}
            >
              <Emoji name={phase === 'error' ? 'bucket' : 'gift'} size={104} color="#fff" strokeWidth={1.3} />
            </motion.div>
          ) : (
            <motion.div key="prize" initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} style={{ textAlign: 'center', padding: 16 }}>
              <Emoji name={style!.emoji} size={72} color="#fff" strokeWidth={1.4} />
              <Typography sx={{ fontFamily: ROUNDED, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', fontSize: 13, opacity: 0.95, mt: 1 }}>
                {t(`${style!.label} surprise`)}
              </Typography>
              <Typography sx={{ fontFamily: ROUNDED, fontWeight: 800, fontSize: '1.6rem', lineHeight: 1.2, mt: 0.5 }}>{prize!.title}</Typography>
            </motion.div>
          )}
        </AnimatePresence>
        {phase === 'open' &&
          sparks.map((s, i) => (
            <motion.div
              key={i}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
              animate={{ x: Math.cos(s.a) * s.d, y: Math.sin(s.a) * s.d, opacity: 0, scale: 1.2 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' }}
            >
              <Emoji name={s.e} size={20} color="#fff" draw={false} />
            </motion.div>
          ))}
      </Box>
      <DialogContent>
        {phase === 'shake' && <Typography sx={{ textAlign: 'center' }}>{t('Reaching into the bucket…')}</Typography>}
        {phase === 'error' && <Alert severity="info">{error}</Alert>}
        {phase === 'open' && prize && !delivering && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {t('The giver has been told. Tap "Delivered" once you have it.')}
          </Typography>
        )}
        {delivering && prize && (
          <Stack spacing={1.5}>
            <Typography variant="body2">{t('Add a photo of it, if you like – the group will see it.')}</Typography>
            <PhotoPicker value={photo} onChange={setPhoto} label={t('Add a photo')} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {phase !== 'shake' && <Button onClick={close}>{phase === 'open' ? t('Later') : t('Close')}</Button>}
        {phase === 'open' && prize && !delivering && (
          <Button variant="contained" onClick={() => setDelivering(true)}>
            {t('Delivered')}
          </Button>
        )}
        {delivering && prize && (
          <Button
            variant="contained"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await actions.deliver(prize.id, photo);
                close();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Delivered!')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function DeliveredPhoto({ groupId, prizeId }: { groupId: string; prizeId: string }) {
  const q = usePrizePhoto(groupId, prizeId, true);
  if (!q.data) return <Skeleton variant="rounded" height={120} />;
  return <Box component="img" src={q.data} alt="" loading="lazy" sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: '12px', display: 'block' }} />;
}

function RevealedItem({ p, groupId, me }: { p: BucketView['revealed'][number]; groupId: string; me: string }) {
  const { deliver } = useBucketActions(groupId);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const st = TIER_STYLE[p.tier];
  const canDeliver = p.status === 'drawn' && (p.drawnBy === me || p.addedBy === me);
  return (
    <Box sx={{ p: 1.25, borderRadius: '14px', border: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', background: st.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Emoji name={st.emoji} size={22} color="#fff" /></Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {p.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {t('{who} drew it', { who: p.drawnBy === me ? t('You') : (p.drawnByName ?? '?') })} · {p.giverName ? t('from {name}', { name: p.addedBy === me ? t('you') : p.giverName }) : t('from someone')} · {p.drawnAt ? formatDate(p.drawnAt) : ''}
          </Typography>
        </Box>
        {p.status === 'delivered' ? <Chip size="small" color="success" label={t('Delivered')} /> : canDeliver ? <Button size="small" onClick={() => setOpen((o) => !o)}>{t('Delivered')}</Button> : <Chip size="small" variant="outlined" label={t('On its way')} />}
      </Stack>
      {p.deliveredPhoto && (
        <Box sx={{ mt: 1 }}>
          <DeliveredPhoto groupId={groupId} prizeId={p.id} />
        </Box>
      )}
      {p.deliveredNote && (
        <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
          “{p.deliveredNote}”
        </Typography>
      )}
      {open && canDeliver && (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <PhotoPicker value={photo} onChange={setPhoto} label={t('Add a photo (optional)')} />
          <Button
            variant="contained"
            size="small"
            loading={busy}
            sx={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              setBusy(true);
              try {
                await deliver(p.id, photo);
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Delivered!')}
          </Button>
        </Stack>
      )}
    </Box>
  );
}

/** The group's surprise bucket: hidden prizes, your earned draws, the reveal and the delivered gallery. */
export default function BucketCard({ group }: { group: Group }) {
  const { data: me } = useMe();
  const q = useBucket(group.id);
  const { remove } = useBucketActions(group.id);
  const [adding, setAdding] = useState(false);
  const [drawing, setDrawing] = useState<Draw | null>(null);
  const uid = me?.user.uid ?? '';
  const b = q.data;
  const unused = (b?.draws ?? []).filter((d) => !d.usedAt);
  const total = b ? b.counts.small + b.counts.medium + b.counts.rare : 0;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Emoji name="bucket" size={20} badge />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('Surprise bucket')}
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            {t('Add a surprise')}
          </Button>
        </Stack>
        {q.error && <Alert severity="error">{(q.error as Error).message}</Alert>}
        {b && (
          <Stack spacing={2}>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {TIERS.map((x) => (
                <Chip key={x} icon={<Emoji name={TIER_STYLE[x].emoji} size={20} sx={{ ml: '6px !important' }} />} label={`${b.counts[x]} ${t(TIER_STYLE[x].label).toLowerCase()}`} variant="outlined" />
              ))}
              <Typography variant="caption" color="text.secondary">
                {t('{n} hidden in the bucket', { n: total })}
              </Typography>
            </Stack>
            {b.low && (
              <Alert severity="warning" icon={<Emoji name="bucket" size={22} />}>
                {t('The bucket is running low. Add a surprise or two so everyone keeps drawing.')}
              </Alert>
            )}

            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                {t('Your draws')}
              </Typography>
              {unused.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('Earn draws by passing the "?" pins on the map, reaching cities, winning stages – and sometimes a lucky week drops one.')}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {unused.map((d) => {
                    const odds = tierOdds(d.boost, b.counts);
                    return (
                      <Stack key={d.id} direction="row" spacing={1.25} sx={{ alignItems: 'center', p: 1, pl: 1.5, borderRadius: '14px', bgcolor: 'action.hover' }}>
                        <Emoji name={SOURCE_EMOJI[d.source]} size={20} badge />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                            {drawLabel(d)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t('Rare chance {pct}%', { pct: Math.round(odds.rare * 100) })}
                            {d.boost > 1 ? ` · ${t('boosted ×{n}', { n: d.boost.toFixed(1) })}` : ''}
                          </Typography>
                        </Box>
                        <Button variant="contained" size="small" disabled={b.drawable === 0} onClick={() => setDrawing(d)} component={motion.button} whileTap={{ scale: 0.92 }}>
                          {t('Draw!')}
                        </Button>
                      </Stack>
                    );
                  })}
                  {b.drawable === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {t('Nothing in the bucket you could draw yet – your draws stay saved.')}
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>

            {b.mine.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                  {t('Your surprises in the bucket')}
                </Typography>
                <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  {b.mine
                    .filter((p) => p.status === 'available')
                    .map((p) => (
                      <Chip
                        key={p.id}
                        icon={<Emoji name={TIER_STYLE[p.tier].emoji} size={20} sx={{ ml: '6px !important' }} />} label={<EmojiText text={`${p.title}${p.anonymous ? ' · 🕶️' : ''}`} />}
                        onDelete={() => {
                          if (confirm(t('Take "{title}" out of the bucket?', { title: p.title }))) void remove(p.id);
                        }}
                      />
                    ))}
                </Stack>
              </Box>
            )}

            {b.revealed.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                  {t('Drawn so far')}
                </Typography>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  {b.revealed.map((p) => (
                    <RevealedItem key={p.id} p={p} groupId={group.id} me={uid} />
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        )}
      </CardContent>
      <AddPrizeDialog open={adding} onClose={() => setAdding(false)} groupId={group.id} />
      <RevealDialog open={!!drawing} onClose={() => setDrawing(null)} groupId={group.id} draw={drawing} />
    </Card>
  );
}
