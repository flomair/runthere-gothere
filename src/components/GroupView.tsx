import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1';
import SendIcon from '@mui/icons-material/Send';
import {
  Alert,
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import L from 'leaflet';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { LatLon } from '../../shared/geo';
import { flag, useMe } from '../lib/api';
import { formatDate, formatKm } from '../lib/format';
import { useFeed, useGroupActions, useStandings } from '../lib/groups';
import { navigate } from '../lib/nav';
import type { FeedItem, Standing } from '../lib/types';
import { AnimatedBar, CountUp, Stagger, StaggerItem } from './motion';
import { getLang, t } from '../lib/i18n';
import { milestoneTitle } from '../../shared/milestoneTitle';

const COLORS = ['#fc4c02', '#1d3557', '#2a9d8f', '#8e44ad', '#e9c46a', '#e76f51', '#457b9d', '#6a994e'];
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

function avatarIcon(s: Standing, color: string, leader: boolean) {
  const inner = s.picture ? `<img src="${s.picture}" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>` : initials(s.name);
  return L.divIcon({
    className: '',
    html: `<div style="width:38px;height:38px;border-radius:50%;border:3px solid ${color};background:${color};color:#fff;display:grid;place-items:center;font:700 13px Inter,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.35)">${inner}</div>${leader ? '<div style="position:absolute;top:-14px;left:10px;font-size:16px">👑</div>' : ''}`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function FeedCard({ item, groupId, myUid, nameOf }: { item: FeedItem; groupId: string; myUid: string; nameOf: (uid: string) => string }) {
  const { kudos, comment } = useGroupActions();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const mine = item.kudos.includes(myUid);
  const icon = item.type === 'milestone' ? (item.milestone?.kind === 'border' && item.milestone.countryCode ? flag(item.milestone.countryCode) : item.milestone?.kind === 'finish' ? '🏁' : '📍') : item.type === 'join' ? '👋' : '💬';
  return (
    <Card>
      <CardContent sx={{ pb: '12px !important' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Avatar src={item.picture} sx={{ width: 40, height: 40, bgcolor: 'secondary.main' }}>
            {initials(item.name)}
          </Avatar>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong style={{ color: 'var(--mui-palette-text-primary)' }}>{item.name}</strong> · {formatDate(item.createdAt, { dateStyle: 'medium' })}
            </Typography>
            <Typography sx={{ fontWeight: item.type === 'milestone' ? 700 : 400, fontSize: item.type === 'milestone' ? '1.1rem' : '1rem', mt: 0.25 }}>
              <span style={{ marginRight: 6 }}>{icon}</span>
              {item.type === 'join' ? `${item.name} ${t(item.text)}` : item.milestone ? milestoneTitle(item.milestone, getLang()) : item.text}
            </Typography>
            {item.milestone && (
              <Typography variant="caption" color="text.secondary">
                {t('at {km}', { km: formatKm(item.milestone.atM, 0) })}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
              <Button
                size="small"
                onClick={() => kudos(groupId, item.id)}
                component={motion.button}
                whileTap={{ scale: 0.85 }}
                sx={{ minWidth: 0, px: 1.25, bgcolor: mine ? 'rgba(252,76,2,0.12)' : 'transparent', color: mine ? 'primary.main' : 'text.secondary' }}
              >
                <motion.span key={String(mine)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }} style={{ marginRight: 6 }}>
                  👏
                </motion.span>
                {item.kudos.length || ''}
              </Button>
              <Button size="small" startIcon={<ChatBubbleOutlineIcon fontSize="small" />} onClick={() => setOpen((o) => !o)} sx={{ color: 'text.secondary' }}>
                {item.comments.length || t('Comment')}
              </Button>
              {item.kudos.length > 0 && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {item.kudos.map(nameOf).join(', ')}
                </Typography>
              )}
            </Stack>
            <Collapse in={open || item.comments.length > 0}>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {item.comments.map((c, i) => (
                  <Box key={i} sx={{ bgcolor: 'action.hover', borderRadius: '12px', px: 1.5, py: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {c.name}
                    </Typography>
                    <Typography variant="body2">{c.text}</Typography>
                  </Box>
                ))}
                {open && (
                  <TextField
                    size="small"
                    placeholder={t('Write a comment…')}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && text.trim()) {
                        await comment(groupId, text, item.id);
                        setText('');
                      }
                    }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              disabled={!text.trim()}
                              onClick={async () => {
                                await comment(groupId, text, item.id);
                                setText('');
                              }}
                            >
                              <SendIcon fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}
              </Stack>
            </Collapse>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function GroupView({ id }: { id: string }) {
  const { data: me } = useMe();
  const st = useStandings(id);
  const feed = useFeed(id);
  const actions = useGroupActions();
  const [post, setPost] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteText, setInviteText] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const colorOf = useMemo(() => {
    const ids = st.data?.group.memberUids ?? [];
    return (uid: string) => COLORS[Math.max(0, ids.indexOf(uid)) % COLORS.length];
  }, [st.data]);

  if (st.isLoading) return <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 8 }} />;
  if (st.error || !st.data) return <Alert severity="error">{st.error?.message ?? t('This shared journey is not available.')}</Alert>;

  const { group: g, standings, team } = st.data;
  const race = g.mode === 'race';
  const leader = standings[0];
  const teamTotal = standings.reduce((s, x) => s + x.distanceM, 0) || 1;
  const nameOf = (uid: string) => g.members[uid]?.name?.split(' ')[0] ?? 'Someone';
  const bounds = L.latLngBounds(g.route.points as LatLon[]);

  return (
    <Stack spacing={2.5} sx={{ pb: 4 }}>
      <Box
        component={motion.div}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        sx={{ borderRadius: { xs: '26px', sm: '32px' }, p: { xs: 2, sm: 3.5 }, color: '#fff', background: 'linear-gradient(135deg, #1d3557 0%, #3a3f8f 45%, #d9345f 100%)', boxShadow: '0 20px 40px -22px rgba(29,53,87,.7)' }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, ml: -1, mb: 1 }}>
          <IconButton onClick={() => navigate('/')} sx={{ color: 'inherit' }} aria-label="back">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="overline" sx={{ flexGrow: 1, opacity: 0.9 }}>
            {race ? t('🏁 Race') : t('🤝 Relay')} · {t('since {date}', { date: formatDate(g.startDate) })}
          </Typography>
          <IconButton onClick={() => setInviteOpen(true)} sx={{ color: 'inherit' }} aria-label="invite friends">
            <PersonAddIcon />
          </IconButton>
        </Stack>
        <Typography variant="h3" component="h1" sx={{ fontSize: { xs: '1.6rem', sm: '2.4rem' } }}>
          {g.name}
        </Typography>
        <Typography sx={{ opacity: 0.85 }}>
          {g.waypoints[0]?.name} → {g.waypoints[g.waypoints.length - 1]?.name} · {formatKm(g.route.totalM, 0)}
        </Typography>
        <Stack direction="row" sx={{ mt: 2, alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <AvatarGroup max={6} sx={{ '& .MuiAvatar-root': { width: 34, height: 34, border: '2px solid rgba(255,255,255,.8)' } }}>
            {g.memberUids.map((u) => (
              <Avatar key={u} src={g.members[u]?.picture} sx={{ bgcolor: colorOf(u) }}>
                {initials(g.members[u]?.name ?? '?')}
              </Avatar>
            ))}
          </AvatarGroup>
          {race && leader ? (
            <Typography sx={{ fontWeight: 700 }}>
              👑 {t('{name} leads with', { name: nameOf(leader.uid) })} <CountUp value={leader.doneM / 1000} format={(n) => formatKm(n * 1000, 0)} />
            </Typography>
          ) : team ? (
            <Typography sx={{ fontWeight: 700 }}>
              {t('Team:')} <CountUp value={team.doneM / 1000} format={(n) => formatKm(n * 1000, 0)} /> {t('of {km}', { km: formatKm(g.route.totalM, 0) })}
            </Typography>
          ) : null}
        </Stack>
        {team && (
          <Box sx={{ mt: 1.5 }}>
            <AnimatedBar value={(team.doneM / g.route.totalM) * 100} color="linear-gradient(90deg, #ffd3b8, #fff)" />
          </Box>
        )}
      </Box>

      {g.invitedEmails.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('Invited, not joined yet: {emails}', { emails: g.invitedEmails.join(', ') })}
        </Typography>
      )}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, alignItems: 'start' }}>
        <Card sx={{ overflow: 'hidden', p: 0 }}>
          <MapContainer bounds={bounds} boundsOptions={{ padding: [30, 30] }} style={{ height: 420, width: '100%' }} scrollWheelZoom>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Polyline positions={g.route.points as LatLon[]} pathOptions={{ color: '#1d3557', weight: 4, opacity: 0.5, dashArray: '6 8' }} />
            {race
              ? standings.map((s, i) => (
                  <Marker key={s.uid} position={s.point} icon={avatarIcon(s, colorOf(s.uid), i === 0 && s.doneM > 0)} zIndexOffset={1000 - i}>
                    <Tooltip direction="top" offset={[0, -18]}>
                      {s.name}: {formatKm(s.doneM, 0)}
                    </Tooltip>
                  </Marker>
                ))
              : team && (
                  <Marker position={team.point} icon={L.divIcon({ className: '', html: '<div class="rtgt-marker me">🤝</div>', iconSize: [34, 34], iconAnchor: [17, 17] })}>
                    <Tooltip permanent direction="top" offset={[0, -18]}>
                      {t('Team')}
                    </Tooltip>
                  </Marker>
                )}
          </MapContainer>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              {race ? t('Leaderboard') : t('Who carried the team')}
            </Typography>
            <Stagger sx={{ display: 'grid', gap: 1.5 }}>
              {standings.map((s, i) => (
                <StaggerItem key={s.uid}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography sx={{ width: 22, fontWeight: 800, color: 'text.secondary' }}>{i + 1}</Typography>
                    <Avatar src={s.picture} sx={{ width: 36, height: 36, bgcolor: colorOf(s.uid) }}>
                      {initials(s.name)}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                        <Typography sx={{ fontWeight: 700 }} noWrap>
                          {s.name}
                          {s.uid === me?.user.uid ? ` (${t('you')})` : ''}
                        </Typography>
                        <Typography sx={{ fontWeight: 800 }}>{formatKm(race ? s.doneM : s.distanceM, 0)}</Typography>
                      </Stack>
                      <AnimatedBar
                        value={race ? (s.doneM / g.route.totalM) * 100 : (s.distanceM / teamTotal) * 100}
                        height={7}
                        color={`linear-gradient(90deg, ${colorOf(s.uid)}, ${colorOf(s.uid)}cc)`}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {s.finishedOn ? `🏁 ${t('arrived {date}', { date: formatDate(s.finishedOn) })}` : t('{km} / week', { km: formatKm(s.weeklyAvgM) })}
                        {s.lastActivity ? ` · ${t('last run {date}', { date: formatDate(s.lastActivity) })}` : ''}
                      </Typography>
                    </Box>
                  </Stack>
                </StaggerItem>
              ))}
            </Stagger>
          </CardContent>
        </Card>
      </Box>

      <Box>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          {t('Feed')}
        </Typography>
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '16px !important' }}>
            <TextField
              fullWidth
              size="small"
              placeholder={t('Cheer the others on…')}
              value={post}
              onChange={(e) => setPost(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && post.trim()) {
                  await actions.comment(id, post);
                  setPost('');
                }
              }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        disabled={!post.trim()}
                        onClick={async () => {
                          await actions.comment(id, post);
                          setPost('');
                        }}
                      >
                        <SendIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </CardContent>
        </Card>
        <Stack spacing={1.5}>
          <AnimatePresence initial={false}>
            {(feed.data ?? []).map((item) => (
              <motion.div key={item.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <FeedCard item={item} groupId={id} myUid={me?.user.uid ?? ''} nameOf={nameOf} />
              </motion.div>
            ))}
          </AnimatePresence>
        </Stack>
      </Box>

      <Button
        color="error"
        sx={{ alignSelf: 'center' }}
        onClick={async () => {
          if (!confirm(t('Leave "{name}"?', { name: g.name }))) return;
          await actions.leave(id);
          navigate('/');
        }}
      >
        {t('Leave this shared journey')}
      </Button>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('Invite more friends')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            autoFocus
            sx={{ mt: 1 }}
            label={t('Google addresses')}
            placeholder="anna@gmail.com, ben@gmail.com"
            value={inviteText}
            onChange={(e) => setInviteText(e.target.value)}
          />
          {inviteMsg && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {inviteMsg}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteOpen(false)}>{t('Close')}</Button>
          <Button
            variant="contained"
            disabled={!inviteText.trim()}
            onClick={async () => {
              const emails = inviteText.split(/[\s,;]+/).filter(Boolean);
              const r = await actions.invite(id, emails);
              setInviteText('');
              setInviteMsg(r.notAllowed.length ? t('Invited. {emails} still need to be added to the guest list by the owner.', { emails: r.notAllowed.join(', ') }) : t('Invited!'));
            }}
          >
            {t('Invite')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
