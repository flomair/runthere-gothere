import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
} from '@mui/material';
import { useState } from 'react';
import { navigate } from '../lib/nav';
import { useLogout, useMe } from '../lib/api';
import StravaButton from './StravaButton';

export default function AppHeader() {
  const { data: me } = useMe();
  const logout = useLogout();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { mode, systemMode, setMode } = useColorScheme();
  const effective = mode === 'system' ? systemMode : mode;

  return (
    <AppBar
      position="sticky"
      color="inherit"
      sx={{ borderBottom: 1, borderColor: 'divider', backdropFilter: 'blur(8px)', bgcolor: 'background.paper' }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <Link
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
          underline="none"
          color="inherit"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexGrow: 1, minWidth: 0 }}
        >
          <Box component="img" src="/favicon.svg" alt="" sx={{ width: 32, height: 32 }} />
          <Typography variant="h6" noWrap sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
            Run There
            <Box component="span" sx={{ color: 'primary.main', mx: 0.75 }}>
              ·
            </Box>
            Go There
          </Typography>
        </Link>

        <Tooltip title={effective === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')} aria-label="toggle color mode">
            {effective === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

        {me?.athlete ? (
          <>
            <Button
              color="inherit"
              onClick={(e) => setAnchor(e.currentTarget)}
              startIcon={<Avatar src={me.athlete.profile} sx={{ width: 28, height: 28 }} />}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {me.athlete.firstname}
            </Button>
            <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ display: { sm: 'none' } }}>
              <Avatar src={me.athlete.profile} sx={{ width: 28, height: 28 }} />
            </IconButton>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              <MenuItem component="a" href={`https://www.strava.com/athletes/${me.athlete.id}`} target="_blank">
                Open Strava profile
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  void logout();
                }}
              >
                Disconnect Strava
              </MenuItem>
            </Menu>
          </>
        ) : me?.features.strava ? (
          <StravaButton size="small" />
        ) : null}
      </Toolbar>
    </AppBar>
  );
}
