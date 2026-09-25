import { alpha, createTheme } from '@mui/material/styles';

/**
 * Colour concept "Pine & Iris" – deliberately nothing like Strava orange:
 *  - Pine (deep evergreen) carries the brand: buttons, headings, hero surfaces.
 *  - Iris (violet) is reserved for *you*: your position, the covered route, progress.
 *    Violet barely occurs on map tiles, so your route always stands out on the map.
 *  - Mint marks destinations, finishes and success.
 * Neutrals are cool paper tones so photos and maps stay the most colourful thing on screen.
 */
export const PINE = '#0F3B35';
export const IRIS = '#7E57C2';
export const MINT = '#149A80';
/** Selected run / rating stars. */
export const HIGHLIGHT = '#E8B03A';
/** Only for the "Connect with Strava" button (Strava brand guidelines). */
export const STRAVA_ORANGE = '#fc4c02';

/** Theme-aware tokens as CSS variables (see styles.css) for SVG, canvas-free markup and inline styles. */
export const C = {
  brand: 'var(--rtgt-brand)',
  you: 'var(--rtgt-you)',
  dest: 'var(--rtgt-dest)',
  track: 'var(--rtgt-track)',
  heroBg: 'var(--rtgt-hero-bg)',
};

/** Deep pine surface with a faint iris and mint glow – used for the hero cards. */
export const HERO_SURFACE = `radial-gradient(120% 90% at 100% 0%, ${alpha(IRIS, 0.28)} 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, ${alpha(MINT, 0.22)} 0%, transparent 60%), ${PINE}`;

const SERIF = '"Fraunces", "Iowan Old Style", Georgia, serif';
const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: PINE, light: '#1E5249', dark: '#082722', contrastText: '#fff' },
        secondary: { main: IRIS, light: '#9575CD', dark: '#6A45B0', contrastText: '#fff' },
        success: { main: MINT, contrastText: '#fff' },
        info: { main: '#3D6FA8' },
        background: { default: '#F4F6F4', paper: '#FFFFFF' },
        text: { primary: '#121A18', secondary: '#5B6763' },
        divider: 'rgba(15, 59, 53, 0.09)',
        action: { hover: 'rgba(15, 59, 53, 0.045)', selected: 'rgba(15, 59, 53, 0.08)' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#E6EFEC', light: '#FFFFFF', dark: '#C3D2CD', contrastText: '#0B1210' },
        secondary: { main: '#B39DDB', light: '#D1C4E9', dark: '#9E86D0', contrastText: '#0B1210' },
        success: { main: '#4FD1B5', contrastText: '#0B1210' },
        info: { main: '#7FA7D6' },
        background: { default: '#0B1210', paper: '#121B18' },
        text: { primary: '#E9F0ED', secondary: '#93A39E' },
        divider: 'rgba(255, 255, 255, 0.08)',
        action: { hover: 'rgba(255, 255, 255, 0.05)', selected: 'rgba(255, 255, 255, 0.09)' },
      },
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: SANS,
    h1: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.02em', fontVariationSettings: '"opsz" 144' },
    h2: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.02em', fontVariationSettings: '"opsz" 144' },
    h3: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.015em', fontVariationSettings: '"opsz" 96' },
    h4: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em', fontVariationSettings: '"opsz" 72' },
    h5: { fontWeight: 650, letterSpacing: '-0.015em' },
    h6: { fontWeight: 650, letterSpacing: '-0.01em', fontSize: '1.1rem' },
    subtitle2: { fontWeight: 650 },
    overline: { fontWeight: 650, letterSpacing: '0.12em', fontSize: '0.7rem' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', fontFeatureSettings: '"cv11", "ss01"' },
        '::selection': { background: alpha(IRIS, 0.22) },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 20,
          border: '1px solid',
          borderColor: theme.vars ? theme.vars.palette.divider : theme.palette.divider,
          boxShadow: '0 1px 2px rgba(15, 59, 53, 0.04)',
          backgroundImage: 'none',
          transition: 'box-shadow .3s ease, transform .3s ease, border-color .3s ease',
          ...theme.applyStyles('dark', { boxShadow: 'none' }),
        }),
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 18,
          transition: 'transform .15s ease, background-color .2s ease, box-shadow .2s ease',
          '&:active': { transform: 'scale(0.97)' },
          variants: [
            { props: { size: 'small' }, style: { paddingInline: 12 } },
            { props: { size: 'large' }, style: { paddingInline: 24, minHeight: 48 } },
            { props: { variant: 'outlined' }, style: { borderColor: 'var(--mui-palette-divider)', '&:hover': { borderColor: 'currentColor' } } },
            // main actions wear the avatar's violet: a solid pill with white text
            {
              props: { variant: 'contained', color: 'primary' },
              style: {
                backgroundColor: 'var(--rtgt-you)',
                color: '#fff',
                boxShadow: '0 6px 16px -8px rgb(126 87 194 / 70%)',
                '&:hover': { backgroundColor: 'var(--rtgt-you-strong)', boxShadow: '0 8px 20px -8px rgb(126 87 194 / 75%)' },
              },
            },
          ],
        },
      },
    },
    MuiIconButton: { styleOverrides: { root: { transition: 'background-color .2s ease, transform .15s ease', '&:active': { transform: 'scale(0.92)' } } } },
    MuiAvatar: { styleOverrides: { colorDefault: { backgroundColor: 'var(--rtgt-you)', color: '#fff', fontWeight: 600 } } },
    MuiBadge: { styleOverrides: { colorPrimary: { backgroundColor: 'var(--rtgt-you)', color: '#fff' }, colorSecondary: { backgroundColor: 'var(--rtgt-you)', color: '#fff' } } },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 999,
          variants: [
            // filled chips: soft violet tint, like the avatar
            { props: { variant: 'filled', color: 'default' }, style: { backgroundColor: 'rgb(126 87 194 / 12%)', color: 'var(--rtgt-you-text)' } },
            { props: { variant: 'filled', color: 'primary' }, style: { backgroundColor: 'var(--rtgt-you)', color: '#fff' } },
          ],
        },
        outlined: { borderColor: 'var(--mui-palette-divider)' },
      },
    },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, fontSize: '0.95rem', minHeight: 44 } } },
    MuiTabs: { styleOverrides: { indicator: { height: 2, borderRadius: 2 } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 99, height: 6 }, bar: { borderRadius: 99 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 24 } } },
    MuiAppBar: { defaultProps: { elevation: 0 } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14, alignItems: 'center' },
        standard: { border: '1px solid var(--mui-palette-divider)' },
      },
    },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, fontWeight: 500 } } },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
  },
});
