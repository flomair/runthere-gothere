import GroupsIcon from '@mui/icons-material/Groups';
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useGroupActions } from '../lib/groups';
import { navigate } from '../lib/nav';
import type { GroupMode, Journey } from '../lib/types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteDialog({ open, onClose, journey }: { open: boolean; onClose: () => void; journey: Journey }) {
  const { create } = useGroupActions();
  const [name, setName] = useState(journey.name);
  const [mode, setMode] = useState<GroupMode>('race');
  const [emails, setEmails] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; notAllowed: string[] } | null>(null);

  useEffect(() => {
    if (open) {
      setName(journey.name);
      setEmails([]);
      setInput('');
      setError(null);
      setDone(null);
    }
  }, [open, journey.name]);

  const all = [...emails, ...(EMAIL.test(input.trim()) ? [input.trim()] : [])];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <GroupsIcon color="primary" /> Run this route with friends
      </DialogTitle>
      <DialogContent>
        {done ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="success">Invitations sent. Your friends see them when they open the app.</Alert>
            {done.notAllowed.length > 0 && (
              <Alert severity="warning">
                {done.notAllowed.join(', ')} {done.notAllowed.length === 1 ? "isn't" : "aren't"} on the app's guest list yet. Ask the owner to add{' '}
                {done.notAllowed.length === 1 ? 'them' : 'these addresses'} on the Admin page.
              </Alert>
            )}
          </Stack>
        ) : (
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <ToggleButtonGroup exclusive fullWidth value={mode} onChange={(_, v) => v && setMode(v)}>
              <ToggleButton value="race" sx={{ flexDirection: 'column', py: 1.5 }}>
                <Typography sx={{ fontWeight: 700 }}>🏁 Race</Typography>
                <Typography variant="caption" color="text.secondary">
                  Everyone runs the whole route. Who arrives first?
                </Typography>
              </ToggleButton>
              <ToggleButton value="relay" sx={{ flexDirection: 'column', py: 1.5 }}>
                <Typography sx={{ fontWeight: 700 }}>🤝 Relay</Typography>
                <Typography variant="caption" color="text.secondary">
                  All kilometres add up. Get there as a team.
                </Typography>
              </ToggleButton>
            </ToggleButtonGroup>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={emails}
              inputValue={input}
              onInputChange={(_, v) => {
                if (/[,;\s]$/.test(v) && EMAIL.test(v.trim().replace(/[,;]$/, ''))) {
                  setEmails((e) => [...new Set([...e, v.trim().replace(/[,;]$/, '').toLowerCase()])]);
                  setInput('');
                } else setInput(v);
              }}
              onChange={(_, v) => setEmails((v as string[]).filter((e) => EMAIL.test(e)).map((e) => e.toLowerCase()))}
              renderValue={(value, getItemProps) => value.map((e, i) => <Chip label={e} size="small" {...getItemProps({ index: i })} key={e} />)}
              renderInput={(params) => <TextField {...params} label="Friends' Google addresses" placeholder="friend@gmail.com, then Enter" helperText="They sign in with this Google account." />}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Typography variant="caption" color="text.secondary">
                The route, start date ({journey.startDate}) and counted sports are copied from this journey. Everyone's runs from Strava count automatically.
              </Typography>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {done ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="contained"
              onClick={() => {
                onClose();
                navigate(`/g/${done.id}`);
              }}
            >
              Open shared journey
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="contained"
              loading={busy}
              disabled={!all.length}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  setDone(await create(journey.id, name, mode, all));
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Invite {all.length || ''}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
