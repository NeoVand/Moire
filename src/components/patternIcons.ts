import {
  Asterisk02Icon,
  Blockchain01Icon,
  CellsIcon,
  CircleIcon,
  DialpadCircle01Icon,
  Grid3X3Icon,
  HexagonIcon,
  HyperboleIcon,
  Menu07Icon,
  NanoTechnologyIcon,
  Parabola01Icon,
  ShellIcon,
  Sine02Icon,
  SpiralsIcon,
  SquareIcon,
  Target03Icon,
  TriangleIcon,
} from '@hugeicons/core-free-icons';
import type { PatternFamily, PatternType } from '../types/moire';
import type { HugeIcon } from './ui/Icon';

export const PATTERN_ICONS: Record<PatternType, { icon: HugeIcon; className?: string }> = {
  'straight-lines': { icon: Menu07Icon, className: 'rotate-90' },
  'radial-lines': { icon: Asterisk02Icon },
  'concentric-circles': { icon: CircleIcon },
  'concentric-squares': { icon: SquareIcon },
  'concentric-triangles': { icon: TriangleIcon },
  'concentric-polygons': { icon: HexagonIcon },
  'grid-square': { icon: Grid3X3Icon },
  'grid-hex': { icon: CellsIcon },
  'grid-triangle': { icon: NanoTechnologyIcon },
  'curve-wave': { icon: Sine02Icon },
  'curve-parabola': { icon: Parabola01Icon },
  'curve-hyperbola': { icon: HyperboleIcon },
  'curve-spiral': { icon: SpiralsIcon },
  'tiling-periodic': { icon: Blockchain01Icon },
};

export const FAMILY_ICONS: Record<PatternFamily, HugeIcon> = {
  lines: Asterisk02Icon,
  concentric: Target03Icon,
  grid: DialpadCircle01Icon,
  curves: ShellIcon,
};
