import { Box, type SxProps, type Theme } from '@mui/material';
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  ArrowsLeftRightIcon,
  BellIcon,
  BicycleIcon,
  BookOpenTextIcon,
  BookmarkSimpleIcon,
  BooksIcon,
  CameraPlusIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleIcon,
  CompassIcon,
  CopyIcon,
  CrosshairIcon,
  CubeIcon,
  DeviceMobileIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  ExportIcon,
  FileArrowUpIcon,
  FireIcon,
  FlagCheckeredIcon,
  FlagIcon,
  GearSixIcon,
  GiftIcon,
  GoogleLogoIcon,
  LinkBreakIcon,
  LinkIcon,
  ListBulletsIcon,
  LockIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MapTrifoldIcon,
  MoonIcon,
  MountainsIcon,
  MusicNoteIcon,
  PaperPlaneRightIcon,
  PauseIcon,
  PencilSimpleIcon,
  PersonSimpleHikeIcon,
  PersonSimpleRunIcon,
  PlayIcon,
  PlusIcon,
  PlusSquareIcon,
  PrinterIcon,
  RulerIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SlideshowIcon,
  SpeakerHighIcon,
  StarIcon,
  StopCircleIcon,
  StopIcon,
  SunIcon,
  SwordIcon,
  TranslateIcon,
  TrashIcon,
  TrophyIcon,
  UploadSimpleIcon,
  UserPlusIcon,
  UsersThreeIcon,
  XIcon,
} from '@phosphor-icons/react';

/**
 * The app's UI icons: Phosphor, mostly in the soft two-tone "duotone" weight. Each export keeps the
 * name and props of the MUI icon it replaced (fontSize, color, sx), so MUI buttons, lists and tabs
 * size and colour them as before.
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

function make(Icon: PhosphorIcon, weight: IconWeight = 'duotone') {
  const C = ({ fontSize = 'medium', color, sx, className, ...rest }: Props) => (
    <Box
      component={Icon}
      weight={weight}
      className={['MuiSvgIcon-root', className].filter(Boolean).join(' ')}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
      sx={[{ width: '1em', height: '1em', flexShrink: 0, display: 'inline-block', fontSize: SIZE[fontSize], color: color ? COLOR[color] : undefined }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
  C.displayName = `Icon(${Icon.displayName ?? 'Phosphor'})`;
  return C;
}

export const Add = make(PlusIcon, 'bold');
export const ArrowBack = make(ArrowLeftIcon, 'bold');
export const Close = make(XIcon, 'bold');
export const DeleteOutlined = make(TrashIcon);
export const OpenInNew = make(ArrowSquareOutIcon);
export const AutoStoriesOutlined = make(BookOpenTextIcon);
export const Straighten = make(RulerIcon);
export const Hiking = make(PersonSimpleHikeIcon);
export const CardGiftcardOutlined = make(GiftIcon);
export const UploadFileOutlined = make(FileArrowUpIcon);
export const SportsKabaddiOutlined = make(SwordIcon);
export const PlayArrow = make(PlayIcon, 'fill');
export const Pause = make(PauseIcon, 'fill');
export const LinkOff = make(LinkBreakIcon);
export const IosShare = make(ExportIcon);
export const Groups = make(UsersThreeIcon);
export const FileDownloadOutlined = make(DownloadSimpleIcon);
export const EmojiEventsOutlined = make(TrophyIcon);
export const DirectionsRun = make(PersonSimpleRunIcon);
export const DirectionsBike = make(BicycleIcon);
export const VolumeUpOutlined = make(SpeakerHighIcon);
export const TravelExplore = make(CompassIcon);
export const Translate = make(TranslateIcon);
export const ThreeDRotation = make(CubeIcon);
export const Terrain = make(MountainsIcon);
export const Sync = make(ArrowsClockwiseIcon);
export const SwapHoriz = make(ArrowsLeftRightIcon);
export const StopRounded = make(StopIcon, 'fill');
export const StopCircleOutlined = make(StopCircleIcon);
export const Star = make(StarIcon, 'fill');
export const SportsScoreOutlined = make(FlagCheckeredIcon);
export const SportsScore = make(FlagCheckeredIcon);
export const SlideshowOutlined = make(SlideshowIcon);
export const SettingsOutlined = make(GearSixIcon);
export const Send = make(PaperPlaneRightIcon);
export const Search = make(MagnifyingGlassIcon);
export const Replay = make(ArrowCounterClockwiseIcon);
export const Refresh = make(ArrowClockwiseIcon);
export const PrintOutlined = make(PrinterIcon);
export const PlayArrowRounded = make(PlayIcon, 'fill');
export const PlaceOutlined = make(MapPinIcon);
export const PersonAddAlt1 = make(UserPlusIcon);
export const OutlinedFlag = make(FlagIcon);
export const NotificationsOutlined = make(BellIcon);
export const MyLocation = make(CrosshairIcon);
export const MusicNoteOutlined = make(MusicNoteIcon);
export const MoreVert = make(DotsThreeVerticalIcon, 'bold');
export const MapOutlined = make(MapTrifoldIcon);
export const Logout = make(SignOutIcon);
export const LockOutlined = make(LockIcon);
export const LocalFireDepartmentOutlined = make(FireIcon);
export const Link = make(LinkIcon);
export const LightModeOutlined = make(SunIcon);
export const InstallMobile = make(DeviceMobileIcon);
export const Google = make(GoogleLogoIcon);
export const FormatListBulleted = make(ListBulletsIcon);
export const FlagOutlined = make(FlagIcon);
export const FileUploadOutlined = make(UploadSimpleIcon);
export const EditOutlined = make(PencilSimpleIcon);
export const Download = make(DownloadSimpleIcon);
export const DarkModeOutlined = make(MoonIcon);
export const ContentCopy = make(CopyIcon);
export const CollectionsBookmarkOutlined = make(BooksIcon);
export const ChevronRight = make(CaretRightIcon, 'bold');
export const ChevronLeft = make(CaretLeftIcon, 'bold');
export const ChatBubbleOutlined = make(ChatCircleIcon);
export const BookmarkAdded = make(BookmarkSimpleIcon, 'fill');
export const BookmarkAddOutlined = make(BookmarkSimpleIcon);
export const AdminPanelSettingsOutlined = make(ShieldCheckIcon);
export const AddBoxOutlined = make(PlusSquareIcon);
export const AddAPhotoOutlined = make(CameraPlusIcon);
