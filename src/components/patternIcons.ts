import {
  Asterisk02Icon,
  CellsIcon,
  CircleIcon,
  Grid3X3Icon,
  HexagonIcon,
  NanoTechnologyIcon,
  SquareIcon,
  TriangleIcon,
} from '@hugeicons/core-free-icons';
import type { PatternFamily, PatternType } from '../types/moire';
import type { HugeIcon } from './ui/Icon';

export const PATTERN_ICONS: Record<PatternType, HugeIcon> = {
  'straight-lines': Asterisk02Icon,
  'concentric-circles': CircleIcon,
  'concentric-squares': SquareIcon,
  'concentric-triangles': TriangleIcon,
  'concentric-polygons': HexagonIcon,
  'grid-square': Grid3X3Icon,
  'grid-hex': CellsIcon,
  'grid-triangle': NanoTechnologyIcon,
};

export const FAMILY_ICONS: Record<PatternFamily, HugeIcon> = {
  lines: Asterisk02Icon,
  circles: CircleIcon,
  polygon: HexagonIcon,
  grid: Grid3X3Icon,
};
