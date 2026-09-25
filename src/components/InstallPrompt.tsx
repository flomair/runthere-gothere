import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import CloseIcon from '@mui/icons-material/Close';
import IosShareIcon from '@mui/icons-material/IosShare';
import { Box, Button, Card, CardContent, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography, useMediaQuery } from '@mui/material';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useT } from '../lib/i18n';
import { useInstall } from '../lib/pwa';

const DISMISSED = 'rtgt.installDismissed';

function IosSteps({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const steps = [
    { icon: <IosShareIcon />, text: t('Tap the Share button in the browser toolbar.') },
    { icon: <AddBoxOutlinedIcon />, text: t('Scroll down and choose “Add to Home Screen”.') },
    { icon: <Box component="img" src="/icons/icon-192.png" alt="" sx={{ width: 24, height: 24, borderRadius: '6px' }} />, text: t('Tap “Add”. Run There now opens full screen from your home screen.') },
  ];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('Add to your home screen')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {steps.map((s, i) => (
            <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: 'action.hover', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'primary.main' }}>{s.icon}</Box>
              <Typography variant="body2">
                <b>{i + 1}.</b> {s.text}
              </Typography>
            </Stack>
          ))}
          <Button variant="contained" onClick={onClose}>
            {t('Got it')}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

/** Install action for menus: returns null when there is nothing to offer. */
export function useInstallAction() {
  const { state, install } = useInstall();
  const [iosOpen, setIosOpen] = useState(false);
  return {
    available: state === 'prompt' || state === 'ios',
    run: () => (state === 'ios' ? setIosOpen(true) : void install()),
    dialog: <IosSteps open={iosOpen} onClose={() => setIosOpen(false)} />,
  };
}

/** Friendly one-time card on phones inviting to install the app. */
export function InstallBanner() {
  const t = useT();
  const phone = useMediaQuery('(pointer: coarse) and (max-width: 900px)');
  const action = useInstallAction();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) === '1';
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      /* ignore */
    }
  };
  const show = phone && action.available && !dismissed;
  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <Card sx={{ position: 'relative', background: 'linear-gradient(135deg, color-mix(in srgb, var(--mui-palette-primary-main) 14%, var(--mui-palette-background-paper)), var(--mui-palette-background-paper))' }}>
              <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'center', '&:last-child': { pb: 2 } }}>
                <Box component="img" src="/icons/icon-192.png" alt="" sx={{ width: 52, height: 52, borderRadius: '14px', boxShadow: 2, flexShrink: 0 }} />
                <Box sx={{ flexGrow: 1, minWidth: 0, pr: 3 }}>
                  <Typography sx={{ fontWeight: 700 }}>{t('Get the app')}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('Full screen, one tap from your home screen, and it keeps working on a patchy connection.')}
                  </Typography>
                  <Button size="small" variant="contained" onClick={action.run} sx={{ mt: 1 }}>
                    {t('Install')}
                  </Button>
                </Box>
                <IconButton size="small" onClick={dismiss} aria-label={t('Not now')} sx={{ position: 'absolute', top: 6, right: 6 }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      {action.dialog}
    </>
  );
}
