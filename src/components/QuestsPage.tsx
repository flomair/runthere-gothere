import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { IconButton, Stack, Typography } from '@mui/material';
import { t } from '../lib/i18n';
import { navigate } from '../lib/nav';
import { ROUNDED } from '../theme';
import QuestsCard from './QuestsCard';

/** All side quests (the target of quest notifications). */
export default function QuestsPage() {
  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => navigate('/')} aria-label="back">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1, fontFamily: ROUNDED, fontWeight: 800 }}>
          {t('Side quests')}
        </Typography>
      </Stack>
      <QuestsCard />
    </Stack>
  );
}
