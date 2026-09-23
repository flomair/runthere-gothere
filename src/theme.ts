import { createTheme } from '@mui/material/styles';

export const STRAVA_ORANGE = '#fc4c02';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: STRAVA_ORANGE, contrastText: '#fff' },
        secondary: { main: '#1d3557' },
        background: { default: '#f6f5f2', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#ff6a2b', contrastText: '#fff' },
        secondary: { main: '#8ecae6' },
        background: { default: '#101214', paper: '#1a1d21' },
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.03em' },
    h2: { fontWeight: 800, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiAppBar: { defaultProps: { elevation: 0 } },
  },
});
