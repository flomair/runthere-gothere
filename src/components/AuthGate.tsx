import GoogleIcon from '@mui/icons-material/Google';
import { Alert, Box, Button, Card, CircularProgress, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { ApiError, useMe } from '../lib/api';
import { firebaseConfigured, signInWithGoogle, signOutUser, useAuthUser } from '../lib/firebase';
import { journeyStore } from '../lib/storage';
import { t } from '../lib/i18n';

function Screen({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ p: { xs: 3, sm: 5 }, maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <Box
          component="img"
          src="/logo.svg"
          alt=""
          sx={(theme) => ({
            width: 104,
            height: 104,
            mb: 2,
            ...theme.applyStyles('dark', { bgcolor: '#fff', borderRadius: '22px', p: '8px' }),
          })}
        />
        <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
          Run There
          <Box component="span" sx={{ color: 'primary.main', mx: 0.75 }}>
            ·
          </Box>
          Go There
        </Typography>
        {children}
      </Card>
    </Box>
  );
}

function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('Turn your Strava runs into a journey between real places. Sign in to continue.')}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
          {error}
        </Alert>
      )}
      <Button
        size="large"
        variant="contained"
        startIcon={<GoogleIcon />}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithGoogle();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('Sign in with Google')}
      </Button>
    </Screen>
  );
}

function NotAllowed({ email }: { email: string }) {
  return (
    <Screen>
      <Typography sx={{ mb: 1 }}>
        <strong>{email}</strong> {t("isn't on the guest list yet.")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('This app is invite-only. Ask the owner to add your Google address, then reload this page.')}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
        <Button variant="contained" onClick={() => window.location.reload()}>
          {t('Try again')}
        </Button>
        <Button onClick={() => signOutUser()}>{t('Use another account')}</Button>
      </Stack>
    </Screen>
  );
}

function NotConfigured() {
  return (
    <Screen>
      <Alert severity="warning" sx={{ textAlign: 'left' }}>
        Sign-in isn't configured yet. Set <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>,{' '}
        <code>VITE_FIREBASE_PROJECT_ID</code> and <code>VITE_FIREBASE_APP_ID</code> (see README → Setup).
      </Alert>
    </Screen>
  );
}

/** Renders the app only for signed-in, allowlisted users. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const user = useAuthUser();
  const qc = useQueryClient();
  const me = useMe(!!user);

  // (re)load data whenever the signed-in account changes
  useEffect(() => {
    qc.removeQueries();
    journeyStore.reset();
    if (user) void me.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (me.data) void journeyStore.load();
  }, [me.data?.user.uid]);

  if (!firebaseConfigured) return <NotConfigured />;
  if (user === undefined || (user && me.isLoading)) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user) return <Login />;
  if (me.error instanceof ApiError && me.error.status === 403) return <NotAllowed email={user.email ?? t('This account')} />;
  if (me.error) {
    return (
      <Screen>
        <Alert severity="error" sx={{ textAlign: 'left', mb: 2, wordBreak: 'break-word' }}>
          {me.error.message}
          <br />
          <a href="/api/health" target="_blank" rel="noopener">
            {t('Open the configuration check')}
          </a>
        </Alert>
        <Button onClick={() => me.refetch()}>{t('Retry')}</Button> <Button onClick={() => signOutUser()}>{t('Sign out')}</Button>
      </Screen>
    );
  }
  return <>{children}</>;
}
