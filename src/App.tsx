import { Alert, Box, CircularProgress, Container, Snackbar } from '@mui/material';
import { Suspense, lazy, useEffect, useState } from 'react';
import AdminPage from './components/AdminPage';
import AppHeader from './components/AppHeader';
import AuthGate from './components/AuthGate';
import JourneyList from './components/JourneyList';
import { journeyStore, useJourneyState } from './lib/storage';

const JourneyView = lazy(() => import('./components/JourneyView'));
const DiaryPage = lazy(() => import('./components/DiaryPage'));

/** Tiny hash router: #/ (list), #/j/<id> (journey), #/j/<id>/diary, #/admin. */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const m = /^#\/j\/([^/]+)(\/diary)?/.exec(hash);
  return { journeyId: m ? decodeURIComponent(m[1]) : null, diary: !!m?.[2], admin: hash.startsWith('#/admin') };
}

function useStravaFlash() {
  const [msg, setMsg] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('strava') === 'connected') setMsg({ severity: 'success', text: 'Strava connected. Your runs now move you forward, and new ones arrive automatically.' });
    else if (p.get('strava_error'))
      setMsg({ severity: 'error', text: `Strava connection failed: ${p.get('strava_error')}` });
    if (p.has('strava') || p.has('strava_error')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);
  return [msg, () => setMsg(null)] as const;
}

function Main() {
  const { journeyId, diary, admin } = useHashRoute();
  const { journeys, status, error } = useJourneyState();
  const journey = journeyId ? journeys.find((j) => j.id === journeyId) : undefined;
  const [flash, clearFlash] = useStravaFlash();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ pt: { xs: 2, sm: 4 } }}>
        {error && (
          <Alert severity="error" onClose={() => journeyStore.clearError()} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {admin ? (
          <AdminPage />
        ) : status !== 'ready' && status !== 'error' ? (
          <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />
        ) : journey ? (
          <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />}>
            {diary ? <DiaryPage key={`d-${journey.id}`} journey={journey} /> : <JourneyView key={journey.id} journey={journey} />}
          </Suspense>
        ) : (
          <JourneyList />
        )}
      </Container>
      <Snackbar open={!!flash} autoHideDuration={6000} onClose={clearFlash}>
        {flash ? (
          <Alert severity={flash.severity} onClose={clearFlash} variant="filled">
            {flash.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

export default function App() {
  return (
    <AuthGate>
      <Main />
    </AuthGate>
  );
}
