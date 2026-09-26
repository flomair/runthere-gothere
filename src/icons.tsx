import { Box, type SxProps, type Theme } from '@mui/material';
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  BellIcon,
  BikeIcon,
  BookOpenIcon,
  BookmarkCheckIcon,
  BookmarkPlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleStopIcon,
  CompassIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  FileUpIcon,
  FlagIcon,
  FlameIcon,
  FootprintsIcon,
  GalleryHorizontalEndIcon,
  GiftIcon,
  ImagePlusIcon,
  LanguagesIcon,
  LibraryIcon,
  LinkIcon,
  ListIcon,
  LocateFixedIcon,
  LockIcon,
  LogOutIcon,
  MapIcon,
  MapPinIcon,
  MessageCircleIcon,
  MoonIcon,
  MountainIcon,
  MusicIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  Rotate3dIcon,
  RotateCcwIcon,
  RotateCwIcon,
  RulerIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShareIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SquareIcon,
  SquarePlusIcon,
  StarIcon,
  SunIcon,
  SwordsIcon,
  Trash2Icon,
  TrophyIcon,
  UnlinkIcon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
  Volume2Icon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { type Anim, AnimIcon } from './components/AnimIcon';

/**
 * The app's UI icons: Lucide line icons with small motion presets (see AnimIcon). Each export keeps
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

const SIZE = { inherit: 'inherit', small: '1.25rem', medium: '1.5rem', large: '2.1875rem' } as const;
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

function make(icon: LucideIcon, anim: Anim) {
  const C = ({ fontSize = 'medium', color, sx, className, ...rest }: Props) => (
    <AnimIcon
      icon={icon}
      anim={anim}
      className={['MuiSvgIcon-root', className].filter(Boolean).join(' ')}
      {...rest}
      sx={[{ fontSize: SIZE[fontSize], color: color ? COLOR[color] : undefined, verticalAlign: 'middle' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
  C.displayName = `Icon(${icon.displayName ?? 'Lucide'})`;
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

export const Add = make(PlusIcon, 'spin');
export const ArrowBack = make(ArrowLeftIcon, 'nudge');
export const Close = make(XIcon, 'spin');
export const DeleteOutlined = make(Trash2Icon, 'wiggle');
export const OpenInNew = make(ExternalLinkIcon, 'nudge');
export const AutoStoriesOutlined = make(BookOpenIcon, 'pop');
export const Straighten = make(RulerIcon, 'wiggle');
export const Hiking = make(MountainIcon, 'bounce');
export const CardGiftcardOutlined = make(GiftIcon, 'wiggle');
export const UploadFileOutlined = make(FileUpIcon, 'bounce');
export const SportsKabaddiOutlined = make(SwordsIcon, 'wiggle');
export const PlayArrow = make(PlayIcon, 'pop');
export const Pause = make(PauseIcon, 'pop');
export const LinkOff = make(UnlinkIcon, 'wiggle');
export const IosShare = make(ShareIcon, 'bounce');
export const Groups = make(UsersIcon, 'bounce');
export const FileDownloadOutlined = make(DownloadIcon, 'drop');
export const EmojiEventsOutlined = make(TrophyIcon, 'wiggle');
export const DirectionsRun = make(FootprintsIcon, 'bounce');
export const DirectionsBike = make(BikeIcon, 'nudge');
export const VolumeUpOutlined = make(Volume2Icon, 'pop');
export const TravelExplore = make(CompassIcon, 'spin');
export const Translate = make(LanguagesIcon, 'wiggle');
export const ThreeDRotation = make(Rotate3dIcon, 'spin');
export const Terrain = make(MountainIcon, 'bounce');
export const Sync = make(RefreshCwIcon, 'spin');
export const SwapHoriz = make(ArrowLeftRightIcon, 'nudge');
export const StopRounded = make(SquareIcon, 'pop');
export const StopCircleOutlined = make(CircleStopIcon, 'pop');
export const Star = make(StarIcon, 'twinkle');
export const SportsScoreOutlined = make(FlagIcon, 'wave');
export const SportsScore = make(FlagIcon, 'wave');
export const SlideshowOutlined = make(GalleryHorizontalEndIcon, 'nudge');
export const SettingsOutlined = make(SettingsIcon, 'spin');
export const Send = make(SendIcon, 'nudge');
export const Search = make(SearchIcon, 'wiggle');
export const Replay = make(RotateCcwIcon, 'spin');
export const Refresh = make(RotateCwIcon, 'spin');
export const PrintOutlined = make(PrinterIcon, 'drop');
export const PlaceOutlined = make(MapPinIcon, 'drop');
export const PersonAddAlt1 = make(UserPlusIcon, 'bounce');
export const OutlinedFlag = make(FlagIcon, 'wave');
export const NotificationsOutlined = make(BellIcon, 'ring');
export const MyLocation = make(LocateFixedIcon, 'spin');
export const MusicNoteOutlined = make(MusicIcon, 'bounce');
export const MoreVert = make(EllipsisVerticalIcon, 'pop');
export const MapOutlined = make(MapIcon, 'pop');
export const Logout = make(LogOutIcon, 'nudge');
export const LockOutlined = make(LockIcon, 'wiggle');
export const LocalFireDepartmentOutlined = make(FlameIcon, 'twinkle');
export const Link = make(LinkIcon, 'wiggle');
export const LightModeOutlined = make(SunIcon, 'spin');
export const InstallMobile = make(SmartphoneIcon, 'wiggle');
export const FormatListBulleted = make(ListIcon, 'nudge');
export const FlagOutlined = make(FlagIcon, 'wave');
export const FileUploadOutlined = make(UploadIcon, 'bounce');
export const EditOutlined = make(PencilIcon, 'wiggle');
export const Download = make(DownloadIcon, 'drop');
export const DarkModeOutlined = make(MoonIcon, 'wiggle');
export const ContentCopy = make(CopyIcon, 'pop');
export const CollectionsBookmarkOutlined = make(LibraryIcon, 'pop');
export const ChevronRight = make(ChevronRightIcon, 'nudge');
export const ChevronLeft = make(ChevronLeftIcon, 'nudge');
export const ChatBubbleOutlined = make(MessageCircleIcon, 'wiggle');
export const BookmarkAdded = make(BookmarkCheckIcon, 'pop');
export const BookmarkAddOutlined = make(BookmarkPlusIcon, 'drop');
export const AdminPanelSettingsOutlined = make(ShieldCheckIcon, 'pop');
export const AddBoxOutlined = make(SquarePlusIcon, 'pop');
export const AddAPhotoOutlined = make(ImagePlusIcon, 'pop');
export const PlayArrowRounded = make(PlayIcon, 'pop');
