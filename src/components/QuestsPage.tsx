import { ArrowBack as ArrowBackIcon } from '../icons';
import { IconButton, Stack, Typography } from '@mui/material';
import { t } from '../lib/i18n';
import { navigate } from '../lib/nav';
import { ROUNDED } from '../theme';
import PlayStrip from './PlayStrip';
import QuestsCard from './QuestsCard';

/** Challenges & gifts hub (also the target of quest notifications). */
export default function QuestsPage() {
  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => navigate('/')} aria-label="back">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1, fontFamily: ROUNDED, fontWeight: 800 }}>
          {t('Challenges & gifts')}
        </Typography>
      </Stack>
      <PlayStrip title={false} />
      <QuestsCard />
    </Stack>
  );
}
