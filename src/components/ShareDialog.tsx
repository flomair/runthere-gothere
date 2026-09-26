import { ContentCopy as ContentCopyIcon } from '../icons';
import { Download as DownloadIcon } from '../icons';
import { IosShare as IosShareIcon } from '../icons';
import { LinkOff as LinkOffIcon } from '../icons';
import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useState } from 'react';
import { createShare, getShare, revokeShare, shareUrl } from '../lib/groups';
import { renderShareCard } from '../lib/shareCard';
import type { Journey } from '../lib/types';
import { t } from '../lib/i18n';

export default function ShareDialog({ open, onClose, journey, doneM, place }: { open: boolean; onClose: () => void; journey: Journey; doneM: number; place?: string }) {
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    setCopied(false);
    setError(null);
    setCardError(null);
    renderShareCard({
      name: journey.name,
      from: journey.waypoints[0]?.name ?? t('Start'),
      to: journey.waypoints[journey.waypoints.length - 1]?.name ?? t('Finish'),
      points: journey.route.points,
      totalM: journey.route.totalM,
      doneM,
      place,
    })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setCard({ blob, url });
      })
      .catch((e) => setCardError(t('Could not draw the share card: {error}', { error: e instanceof Error ? e.message : String(e) })));
    getShare(journey.id).then(setToken).catch(() => setToken(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, journey, doneM, place]);

  const file = card ? new File([card.blob], `${journey.name.replace(/[^\w-]+/g, '_')}.png`, { type: 'image/png' }) : null;
  const canShareFile = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>{t('Share your journey')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Box sx={{ display: 'grid', placeItems: 'center', bgcolor: 'action.hover', borderRadius: '16px', p: 2, minHeight: 280 }}>
            {card ? (
              <Box component="img" src={card.url} alt="Share card" sx={{ width: '100%', maxWidth: 320, borderRadius: '14px', boxShadow: 6 }} />
            ) : cardError ? (
              <Alert severity="error">{cardError}</Alert>
            ) : (
              <CircularProgress />
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            {canShareFile && (
              <Button variant="contained" startIcon={<IosShareIcon />} fullWidth onClick={() => navigator.share({ files: [file!], title: journey.name }).catch(() => undefined)}>
                {t('Share image')}
              </Button>
            )}
            <Button
              variant={canShareFile ? 'outlined' : 'contained'}
              startIcon={<DownloadIcon />}
              fullWidth
              disabled={!card}
              onClick={() => {
                const a = Object.assign(document.createElement('a'), { href: card!.url, download: file!.name });
                a.click();
              }}
            >
              {t('Download')}
            </Button>
          </Stack>

          <Divider />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t('Public link')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t('Anyone with the link can follow your progress live: route, position and distance. No sign-in needed, and no runs or personal details are shown.')}
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {error}
              </Alert>
            )}
            {token === undefined ? (
              <CircularProgress size={20} />
            ) : token ? (
              <Stack spacing={1}>
                <TextField size="small" value={shareUrl(token)} slotProps={{ htmlInput: { readOnly: true } }} onFocus={(e) => e.target.select()} />
                <Stack direction="row" spacing={1}>
                  <Button
                    startIcon={<ContentCopyIcon />}
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareUrl(token));
                      setCopied(true);
                    }}
                  >
                    {copied ? t('Copied!') : t('Copy link')}
                  </Button>
                  <Button
                    color="error"
                    startIcon={<LinkOffIcon />}
                    onClick={async () => {
                      await revokeShare(journey.id);
                      setToken(null);
                    }}
                  >
                    {t('Turn off link')}
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Button
                variant="outlined"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setToken(await createShare(journey.id));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('Create public link')}
              </Button>
            )}
          </Box>
          <Button onClick={onClose}>{t('Done')}</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
