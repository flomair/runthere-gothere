import { Button, type ButtonProps } from '@mui/material';
import { useState } from 'react';
import { connectStrava } from '../lib/api';
import { t } from '../lib/i18n';

export default function StravaButton(props: ButtonProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="contained"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await connectStrava();
        } catch (e) {
          alert(t('Could not start the Strava connection: {error}', { error: e instanceof Error ? e.message : String(e) }));
          setBusy(false);
        }
      }}
      sx={{ bgcolor: '#fc4c02', '&:hover': { bgcolor: '#e34402' }, color: '#fff', whiteSpace: 'nowrap' }}
      startIcon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
      }
      {...props}
    >
      {props.children ?? t('Connect with Strava')}
    </Button>
  );
}
