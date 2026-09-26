import { Groups as GroupsIcon } from '../icons';
import { Alert, AvatarGroup, Avatar, Box, Button, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { formatKm } from '../lib/format';
import { useGroupActions, useGroups } from '../lib/groups';
import { navigate } from '../lib/nav';
import { Stagger, StaggerItem } from './motion';
import { t } from '../lib/i18n';
import { Emoji, EmojiText } from './Emoji';

/** Invitations and shared journeys on the start page. */
export default function SharedJourneys() {
  const { data } = useGroups();
  const actions = useGroupActions();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || (!data.groups.length && !data.invitations.length)) return null;

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
        <GroupsIcon color="primary" />
        <Typography variant="h5">{t('With friends')}</Typography>
      </Stack>
      <Stack spacing={1.5} sx={{ mb: data.groups.length ? 2 : 0 }}>
        {data.invitations.map((inv) => (
          <Alert
            key={inv.id}
            severity="info"
            icon={<Emoji name={inv.mode === 'race' ? 'finish' : 'handshake'} size={26} />}
            action={
              <Stack direction="row" spacing={1}>
                <Button color="inherit" onClick={() => actions.leave(inv.id)} disabled={busy === inv.id}>
                  {t('Decline')}
                </Button>
                <Button
                  variant="contained"
                  loading={busy === inv.id}
                  onClick={async () => {
                    setBusy(inv.id);
                    try {
                      await actions.join(inv.id);
                      navigate(`/g/${inv.id}`);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {t('Join')}
                </Button>
              </Stack>
            }
          >
            <strong>{inv.from}</strong> {inv.mode === 'race' ? t('invited you to a race:') : t('invited you to a relay:')} <strong>{inv.name}</strong> ({formatKm(inv.totalM, 0)})
          </Alert>
        ))}
      </Stack>
      {data.groups.length > 0 && (
        <Stagger sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
          {data.groups.map((g) => (
            <StaggerItem key={g.id}>
              <Card sx={{ '&:hover': { transform: 'translateY(-4px)' } }}>
                <CardActionArea onClick={() => navigate(`/g/${g.id}`)}>
                  <CardContent>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Chip size="small" label={<EmojiText text={g.mode === 'race' ? t('🏁 Race') : t('🤝 Relay')} />} />
                      <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 12 } }}>
                        {g.memberUids.map((u) => (
                          <Avatar key={u} src={g.members[u]?.picture}>
                            {g.members[u]?.name?.[0]}
                          </Avatar>
                        ))}
                      </AvatarGroup>
                    </Stack>
                    <Typography variant="h6" noWrap>
                      {g.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {g.waypoints[0]?.name} → {g.waypoints[g.waypoints.length - 1]?.name} · {formatKm(g.totalM, 0)}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </Box>
  );
}
