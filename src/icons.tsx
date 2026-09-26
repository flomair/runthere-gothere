import { Box, type SxProps, type Theme } from '@mui/material';
import {
  type IconDefinition,
  faArrowLeft,
  faArrowUpFromBracket,
  faArrowUpRightFromSquare,
  faArrowsRotate,
  faBell,
  faBicycle,
  faBookBookmark,
  faBookOpen,
  faBookmark,
  faCamera,
  faChevronLeft,
  faChevronRight,
  faCircleStop,
  faComment,
  faCompass,
  faCopy,
  faCube,
  faDownload,
  faEllipsisVertical,
  faFileArrowUp,
  faFire,
  faFlag,
  faFlagCheckered,
  faGear,
  faGift,
  faHandFist,
  faImages,
  faLanguage,
  faLink,
  faLinkSlash,
  faList,
  faLocationCrosshairs,
  faLocationDot,
  faLock,
  faMagnifyingGlass,
  faMap,
  faMobileScreen,
  faMoon,
  faMountain,
  faMusic,
  faPaperPlane,
  faPause,
  faPen,
  faPersonHiking,
  faPersonRunning,
  faPlay,
  faPlus,
  faPrint,
  faRightFromBracket,
  faRightLeft,
  faRotateLeft,
  faRotateRight,
  faRuler,
  faSquarePlus,
  faStar,
  faStop,
  faSun,
  faTrashCan,
  faTrophy,
  faUpload,
  faUserGroup,
  faUserPlus,
  faUserShield,
  faVolumeHigh,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { type Anim, AnimIcon } from './components/AnimIcon';



/**
 * The app's UI icons: Font Awesome Free (solid) glyphs in a single colour, with small motion presets (see AnimIcon). Each export keeps
 * the name and props of the MUI icon it replaced (fontSize, color, sx), so MUI buttons, lists and
 * tabs size and colour them as before.
 */
type Props = {
  fontSize?: 'inherit' | 'small' | 'medium' | 'large';
  color?: 'inherit' | 'primary' | 'secondary' | 'action' | 'disabled' | 'error' | 'success' | 'warning' | 'info';
  sx?: SxProps<Theme>;
  className?: string;
  'aria-label'?: string;
};

const SIZE = { inherit: 'inherit', small: '1.05rem', medium: '1.25rem', large: '1.8rem' } as const;
const COLOR: Record<string, string | undefined> = {
  inherit: undefined,
  primary: 'primary.main',
  secondary: 'secondary.main',
  action: 'action.active',
  disabled: 'action.disabled',
  error: 'error.main',
  success: 'success.main',
  warning: 'warning.main',
  info: 'info.main',
};

function make(icon: IconDefinition, anim: Anim) {
  const C = ({ fontSize = 'medium', color, sx, className, ...rest }: Props) => (
    <AnimIcon
      icon={icon}
      anim={anim}
      className={['MuiSvgIcon-root', className].filter(Boolean).join(' ')}
      {...rest}
      sx={[{ fontSize: SIZE[fontSize], color: color ? COLOR[color] : undefined, verticalAlign: 'middle' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
  C.displayName = `Icon(${icon.iconName})`;
  return C;
}

/** Google's "G" (brand colours) for the sign-in button. */
export const Google = ({ fontSize = 'medium', sx }: Props) => (
  <Box component="svg" viewBox="0 0 48 48" aria-hidden sx={[{ width: '1em', height: '1em', fontSize: SIZE[fontSize], flexShrink: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </Box>
);

export const Add = make(faPlus, 'spin');
export const ArrowBack = make(faArrowLeft, 'nudge');
export const Close = make(faXmark, 'spin');
export const DeleteOutlined = make(faTrashCan, 'wiggle');
export const OpenInNew = make(faArrowUpRightFromSquare, 'nudge');
export const AutoStoriesOutlined = make(faBookOpen, 'pop');
export const Straighten = make(faRuler, 'wiggle');
export const Hiking = make(faPersonHiking, 'bounce');
export const CardGiftcardOutlined = make(faGift, 'wiggle');
export const UploadFileOutlined = make(faFileArrowUp, 'bounce');
export const SportsKabaddiOutlined = make(faHandFist, 'wiggle');
export const PlayArrow = make(faPlay, 'pop');
export const Pause = make(faPause, 'pop');
export const LinkOff = make(faLinkSlash, 'wiggle');
export const IosShare = make(faArrowUpFromBracket, 'bounce');
export const Groups = make(faUserGroup, 'bounce');
export const FileDownloadOutlined = make(faDownload, 'drop');
export const EmojiEventsOutlined = make(faTrophy, 'wiggle');
export const DirectionsRun = make(faPersonRunning, 'bounce');
export const DirectionsBike = make(faBicycle, 'nudge');
export const VolumeUpOutlined = make(faVolumeHigh, 'pop');
export const TravelExplore = make(faCompass, 'spin');
export const Translate = make(faLanguage, 'wiggle');
export const ThreeDRotation = make(faCube, 'spin');
export const Terrain = make(faMountain, 'bounce');
export const Sync = make(faArrowsRotate, 'spin');
export const SwapHoriz = make(faRightLeft, 'nudge');
export const StopRounded = make(faStop, 'pop');
export const StopCircleOutlined = make(faCircleStop, 'pop');
export const Star = make(faStar, 'twinkle');
export const SportsScoreOutlined = make(faFlagCheckered, 'wave');
export const SportsScore = make(faFlagCheckered, 'wave');
export const SlideshowOutlined = make(faImages, 'nudge');
export const SettingsOutlined = make(faGear, 'spin');
export const Send = make(faPaperPlane, 'nudge');
export const Search = make(faMagnifyingGlass, 'wiggle');
export const Replay = make(faRotateLeft, 'spin');
export const Refresh = make(faRotateRight, 'spin');
export const PrintOutlined = make(faPrint, 'drop');
export const PlaceOutlined = make(faLocationDot, 'drop');
export const PersonAddAlt1 = make(faUserPlus, 'bounce');
export const OutlinedFlag = make(faFlag, 'wave');
export const NotificationsOutlined = make(faBell, 'ring');
export const MyLocation = make(faLocationCrosshairs, 'spin');
export const MusicNoteOutlined = make(faMusic, 'bounce');
export const MoreVert = make(faEllipsisVertical, 'pop');
export const MapOutlined = make(faMap, 'pop');
export const Logout = make(faRightFromBracket, 'nudge');
export const LockOutlined = make(faLock, 'wiggle');
export const LocalFireDepartmentOutlined = make(faFire, 'twinkle');
export const Link = make(faLink, 'wiggle');
export const LightModeOutlined = make(faSun, 'spin');
export const InstallMobile = make(faMobileScreen, 'wiggle');
export const FormatListBulleted = make(faList, 'nudge');
export const FlagOutlined = make(faFlag, 'wave');
export const FileUploadOutlined = make(faUpload, 'bounce');
export const EditOutlined = make(faPen, 'wiggle');
export const Download = make(faDownload, 'drop');
export const DarkModeOutlined = make(faMoon, 'wiggle');
export const ContentCopy = make(faCopy, 'pop');
export const CollectionsBookmarkOutlined = make(faBookBookmark, 'pop');
export const ChevronRight = make(faChevronRight, 'nudge');
export const ChevronLeft = make(faChevronLeft, 'nudge');
export const ChatBubbleOutlined = make(faComment, 'wiggle');
export const BookmarkAdded = make(faBookmark, 'pop');
export const BookmarkAddOutlined = make(faBookmark, 'drop');
export const AdminPanelSettingsOutlined = make(faUserShield, 'pop');
export const AddBoxOutlined = make(faSquarePlus, 'pop');
export const AddAPhotoOutlined = make(faCamera, 'pop');
export const PlayArrowRounded = make(faPlay, 'pop');
