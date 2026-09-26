import { Alert, Box, CircularProgress, Container, Snackbar } from '@mui/material';
import { Suspense, lazy, useEffect, useState } from 'react';
import AdminPage from './components/AdminPage';
import AppHeader from './components/AppHeader';
import AuthGate from './components/AuthGate';
import { PageTransition } from './components/motion';
import JourneyList from './components/JourneyList';
import { t, useLang } from './lib/i18n';
import { journeyStore, useJourneyState } from './lib/storage';

const JourneyView = lazy(() => import('./components/JourneyView'));
const DiaryPage = lazy(() => import('./components/DiaryPage'));
const TripPage = lazy(() => import('./components/TripPage'));
const GroupView = lazy(() => import('./components/GroupView'));
const QuestsPage = lazy(() => import('./components/QuestsPage'));
const CollectionPage = lazy(() => import('./components/CollectionPage'));
const PublicView = lazy(() => import('./components/PublicView'));

/** Tiny hash router: #/ (list), #/j/<id>, #/j/<id>/diary, #/j/<id>/trip, #/g/<id> (shared journey), #/s/<token> (public), #/collection, #/quests, #/admin. */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const m = /^#\/j\/([^/]+)(?:\/(diary|trip))?/.exec(hash);
  const g = /^#\/g\/([^/?]+)/.exec(hash);
  const s = /^#\/s\/([^/?]+)/.exec(hash);
  return {
    journeyId: m ? decodeURIComponent(m[1]) : null,
    sub: (m?.[2] ?? null) as 'diary' | 'trip' | null,
    groupId: g ? decodeURIComponent(g[1]) : null,
    shareToken: s ? decodeURIComponent(s[1]) : null,
    admin: hash.startsWith('#/admin'),
    collection: hash.startsWith('#/collection'),
    quests: hash.startsWith('#/quests'),
  };
}

function useStravaFlash() {
  const [msg, setMsg] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('strava') === 'connected') setMsg({ severity: 'success', text: t('Strava connected. Your runs now move you forward, and new ones arrive automatically.') });
    else if (p.get('strava_error'))
      setMsg({ severity: 'error', text: t('Strava connection failed: {error}', { error: p.get('strava_error') ?? '' }) });
    if (p.has('strava') || p.has('strava_error')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);
  return [msg, () => setMsg(null)] as const;
}

function Main() {
  const { journeyId, sub, groupId, admin, collection, quests } = useHashRoute();
  const { journeys, status, error } = useJourneyState();
  const journey = journeyId ? journeys.find((j) => j.id === journeyId) : undefined;
  const [flash, clearFlash] = useStravaFlash();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ pt: { xs: 1.5, sm: 3 }, px: { xs: 1.5, sm: 3 } }}>
        {error && (
          <Alert severity="error" onClose={() => journeyStore.clearError()} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <PageTransition routeKey={admin ? 'admin' : collection ? 'collection' : quests ? 'quests' : groupId ? `g/${groupId}` : journey ? `${journey.id}${sub ? `/${sub}` : ''}` : status === 'ready' || status === 'error' ? 'list' : 'loading'}>
        {admin ? (
            <AdminPage />
          ) : quests ? (
            <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />}>
              <QuestsPage />
            </Suspense>
          ) : collection ? (
            <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />}>
              <CollectionPage />
            </Suspense>
          ) : groupId ? (
            <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />}>
              <GroupView key={groupId} id={groupId} />
            </Suspense>
          ) : status !== 'ready' && status !== 'error' ? (
            <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />
          ) : journey ? (
            <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />}>
              {sub === 'diary' ? (
                <DiaryPage key={`d-${journey.id}`} journey={journey} />
              ) : sub === 'trip' ? (
                <TripPage key={`t-${journey.id}`} journey={journey} />
              ) : (
                <JourneyView key={journey.id} journey={journey} />
              )}
            </Suspense>
          ) : (
            <JourneyList />
          )}
        </PageTransition>
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
  const { shareToken } = useHashRoute();
  const lang = useLang();
  // public share links work without signing in
  if (shareToken) {
    return (
      <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />}>
        <PublicView key={lang} token={shareToken} />
      </Suspense>
    );
  }
  // switching the language re-renders the whole app with the new strings
  return (
    <AuthGate>
      <Main key={lang} />
    </AuthGate>
  );
}
