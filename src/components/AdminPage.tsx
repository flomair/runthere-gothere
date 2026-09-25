import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, useMe } from '../lib/api';
import { formatDate } from '../lib/format';
import { navigate } from '../lib/nav';
import type { AdminUserRow } from '../lib/types';
import { t } from '../lib/i18n';

interface AllowlistResponse {
  admins: string[];
  allowed: { email: string; addedBy: string; addedAt: string }[];
}
interface WebhookResponse {
  expected: string;
  subscriptions: { id: number; callback_url: string }[];
}

function Allowlist() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['allowlist'], queryFn: () => api<AllowlistResponse>('/api/admin/allowlist') });
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/allowlist', { method: 'POST', json: { email } });
      setEmail('');
      await qc.invalidateQueries({ queryKey: ['allowlist'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{t('Who can use the app')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('Add the Google address a friend signs in with. They bring their own Strava account and their own Anthropic key.')}
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <TextField size="small" fullWidth type="email" placeholder="friend@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="contained" loading={busy} disabled={!email.trim()}>
            {t('Add')}
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
        {q.error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {q.error.message}
          </Alert>
        )}
        <List dense sx={{ mt: 1 }}>
          {q.data?.admins.map((a) => (
            <ListItem key={a} secondaryAction={<Chip size="small" label="admin" />}>
              <ListItemText primary={a} secondary={t('from ADMIN_EMAILS')} />
            </ListItem>
          ))}
          {q.data?.allowed.map((a) => (
            <ListItem
              key={a.email}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label={`remove ${a.email}`}
                  onClick={async () => {
                    if (!confirm(t('Remove {email}? They will lose access (their data stays).', { email: a.email }))) return;
                    await api(`/api/admin/allowlist?email=${encodeURIComponent(a.email)}`, { method: 'DELETE' });
                    await qc.invalidateQueries({ queryKey: ['allowlist'] });
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemText primary={a.email} secondary={t('added {date} by {who}', { date: formatDate(a.addedAt), who: a.addedBy })} />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}

function StravaWebhook() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['webhook'], queryFn: () => api<WebhookResponse>('/api/admin/strava-webhook'), retry: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = q.data?.subscriptions.find((s) => s.callback_url === q.data?.expected);
  const other = q.data?.subscriptions.find((s) => s.callback_url !== q.data?.expected);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{t('Automatic Strava sync')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('Strava notifies the app about new, edited and deleted activities of everyone who connected Strava. One registration covers all users. A daily job catches anything that was missed.')}
        </Typography>
        {q.isLoading ? (
          <Typography color="text.secondary">{t('Checking…')}</Typography>
        ) : q.error ? (
          <Alert severity="error">{q.error.message}</Alert>
        ) : active ? (
          <Alert severity="success">{t('Active: Strava sends updates to {url}', { url: active.callback_url })}</Alert>
        ) : (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api('/api/admin/strava-webhook', { method: 'POST' });
                    await qc.invalidateQueries({ queryKey: ['webhook'] });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {other ? t('Move here') : t('Turn on')}
              </Button>
            }
          >
            {other ? t('Registered for another URL ({url}).', { url: other.callback_url }) : t('Not registered yet.')}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function Usage() {
  const q = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ users: AdminUserRow[] }>('/api/admin/users').then((r) => r.users) });
  const users = q.data ?? [];
  const total = (k: keyof AdminUserRow['stats']) => users.reduce((n, u) => n + (u.stats[k] ?? 0), 0);
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{t('Users & AI usage')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t("Every AI call runs on that user's own key. {users} users · {stories} stories · {postcards} postcards · {coach} coach plans.", { users: users.length, stories: total('stories'), postcards: total('postcards'), coach: total('coachPlans') })}
        </Typography>
        {q.error && <Alert severity="error">{q.error.message}</Alert>}
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('User')}</TableCell>
                <TableCell>{t('Last sign-in')}</TableCell>
                <TableCell>Strava</TableCell>
                <TableCell>{t('AI key')}</TableCell>
                <TableCell align="right">{t('Stories')}</TableCell>
                <TableCell align="right">{t('Postcards')}</TableCell>
                <TableCell align="right">Coach</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {u.name ?? '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {u.email}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {u.strava ? <Chip size="small" color="success" variant="outlined" label={u.strava.lastSyncAt ? t('synced {date}', { date: formatDate(u.strava.lastSyncAt) }) : t('connected')} /> : '—'}
                  </TableCell>
                  <TableCell>{u.hasAiKey ? <Chip size="small" color="success" variant="outlined" label={t('yes')} /> : '—'}</TableCell>
                  <TableCell align="right">{u.stats.stories ?? 0}</TableCell>
                  <TableCell align="right">{u.stats.postcards ?? 0}</TableCell>
                  <TableCell align="right">{u.stats.coachPlans ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { data: me } = useMe();
  if (!me?.user.isAdmin) return <Alert severity="error">{t('Admins only.')}</Alert>;
  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => navigate('/')} aria-label="back">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" component="h1">
          {t('Admin')}
        </Typography>
      </Stack>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
        <Allowlist />
        <StravaWebhook />
      </Box>
      <Usage />
    </Stack>
  );
}
