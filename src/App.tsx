import { Alert, Box, CircularProgress, Container, Snackbar } from '@mui/material';
import { Suspense, lazy, useEffect, useState } from 'react';
import AppHeader from './components/AppHeader';
import JourneyList from './components/JourneyList';
import { useJourneys } from './lib/storage';

const JourneyView = lazy(() => import('./components/JourneyView'));

/** Tiny hash router: #/ (list) and #/j/<id> (journey). */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const m = /^#\/j\/([^/]+)/.exec(hash);
  return m ? { journeyId: decodeURIComponent(m[1]) } : { journeyId: null };
}

function useStravaFlash() {
  const [msg, setMsg] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('strava') === 'connected') setMsg({ severity: 'success', text: 'Strava connected – your runs now move you forward!' });
    else if (p.get('strava_error'))
      setMsg({ severity: 'error', text: `Strava connection failed: ${p.get('strava_error')}` });
    if (p.has('strava') || p.has('strava_error')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);
  return [msg, () => setMsg(null)] as const;
}

export default function App() {
  const { journeyId } = useHashRoute();
  const journeys = useJourneys();
  const journey = journeyId ? journeys.find((j) => j.id === journeyId) : undefined;
  const [flash, clearFlash] = useStravaFlash();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ pt: { xs: 2, sm: 4 } }}>
        {journey ? (
          <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />}>
            <JourneyView key={journey.id} journey={journey} />
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
