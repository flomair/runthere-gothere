import { Add as AddIcon, Groups as GroupsIcon } from '../icons';
import { AddPrizeDialog } from './BucketCard';
import { Alert, AvatarGroup, Avatar, Box, Button, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { formatKm } from '../lib/format';
import { useGroupActions, useGroups } from '../lib/groups';
import { navigate } from '../lib/nav';
import { Stagger, StaggerItem } from './motion';
import { t } from '../lib/i18n';
import { Emoji, EmojiText } from './Emoji';

/** Invitations and shared journeys on the start page, each with its surprise bucket. */
export default function SharedJourneys({ onPlanTogether }: { onPlanTogether?: () => void }) {
  const { data } = useGroups();
  const actions = useGroupActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  if (!data) return null;
  const empty = !data.groups.length && !data.invitations.length;

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
        <GroupsIcon color="primary" />
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {t('With friends')}
        </Typography>
        {onPlanTogether && !empty && (
          <Button size="small" startIcon={<AddIcon />} onClick={onPlanTogether}>
            {t('Plan together')}
          </Button>
        )}
      </Stack>
      {empty && onPlanTogether && (
        <Card sx={{ borderStyle: 'dashed', borderWidth: 1.5 }}>
          <CardActionArea onClick={onPlanTogether}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Emoji name="handshake" size={24} badge />
              <Box sx={{ flexGrow: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{t('Plan a destination together')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('Pick a target with friends, race there or run it as a relay – with a shared surprise bucket.')}
                </Typography>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      )}
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
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 2, pb: 1.5, pt: 0.25 }}>
                  <Emoji name="bucket" size={15} badge draw={false} />
                  <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                    {g.bucket?.toReveal ? (
                      <Box component="span" sx={{ color: 'secondary.main', fontWeight: 700 }}>
                        {t('{n} new for you', { n: g.bucket.toReveal })}
                      </Box>
                    ) : (
                      t('{n} surprises in the bucket', { n: g.bucket?.available ?? 0 })
                    )}
                  </Typography>
                  <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(g.id)}>
                    {t('Add')}
                  </Button>
                </Stack>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <AddPrizeDialog open={!!adding} onClose={() => setAdding(null)} groupId={adding ?? ''} />
    </Box>
  );
}
