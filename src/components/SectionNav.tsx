import AutoStoriesIcon from '@mui/icons-material/AutoStoriesOutlined';
import EmojiEventsIcon from '@mui/icons-material/EmojiEventsOutlined';
import ListIcon from '@mui/icons-material/FormatListBulleted';
import MapIcon from '@mui/icons-material/MapOutlined';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { Badge, BottomNavigation, BottomNavigationAction, Box, Paper, Tab, Tabs } from '@mui/material';
import { t } from '../lib/i18n';

export type Section = 'overview' | 'explore' | 'goals' | 'log';

const ITEMS: { value: Section; label: string; icon: React.ReactElement }[] = [
  { value: 'overview', label: 'Overview', icon: <MapIcon /> },
  { value: 'explore', label: 'Explore', icon: <TravelExploreIcon /> },
  { value: 'goals', label: 'Goals', icon: <EmojiEventsIcon /> },
  { value: 'log', label: 'Log', icon: <ListIcon /> },
];

/** Sticky tabs on desktop, a bottom tab bar on phones. */
export default function SectionNav({ value, onChange, onDiary, unseen }: { value: Section; onChange: (s: Section) => void; onDiary: () => void; unseen: number }) {
  return (
    <>
      <Box
        sx={{
          display: { xs: 'none', sm: 'block' },
          position: 'sticky',
          top: 64,
          zIndex: 1100,
          mx: -1,
          px: 1,
          py: 0.5,
          backdropFilter: 'saturate(180%) blur(12px)',
          bgcolor: 'color-mix(in srgb, var(--mui-palette-background-default) 80%, transparent)',
        }}
      >
        <Tabs value={value} onChange={(_, v) => onChange(v)} variant="scrollable" allowScrollButtonsMobile>
          {ITEMS.map((it) => (
            <Tab key={it.value} value={it.value} label={t(it.label)} icon={it.icon} iconPosition="start" />
          ))}
          <Tab
            value="diary"
            label={t('Diary')}
            iconPosition="start"
            icon={
              <Badge color="secondary" variant="dot" invisible={!unseen}>
                <AutoStoriesIcon />
              </Badge>
            }
            onClick={onDiary}
          />
        </Tabs>
      </Box>
      <Paper
        elevation={0}
        sx={{
          display: { xs: 'block', sm: 'none' },
          position: 'fixed',
          left: 12,
          right: 12,
          bottom: 'calc(10px + env(safe-area-inset-bottom))',
          zIndex: 1200,
          borderRadius: 999,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
          backdropFilter: 'saturate(180%) blur(16px)',
          bgcolor: 'color-mix(in srgb, var(--mui-palette-background-paper) 82%, transparent)',
          boxShadow: '0 12px 32px -12px rgba(0,0,0,0.35)',
        }}
      >
        <BottomNavigation
          showLabels
          value={value}
          onChange={(_, v) => (v === 'diary' ? onDiary() : onChange(v))}
          sx={{ bgcolor: 'transparent', height: 62, '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.25 }, '& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected': { fontSize: '0.72rem', whiteSpace: 'nowrap' }, '& .Mui-selected': { fontWeight: 700 } }}
        >
          {ITEMS.map((it) => (
            <BottomNavigationAction key={it.value} value={it.value} label={t(it.label)} icon={it.icon} />
          ))}
          <BottomNavigationAction
            value="diary"
            label={t('Diary')}
            icon={
              <Badge color="secondary" badgeContent={unseen} invisible={!unseen}>
                <AutoStoriesIcon />
              </Badge>
            }
          />
        </BottomNavigation>
      </Paper>
    </>
  );
}
