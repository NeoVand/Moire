import {
  Asterisk02Icon,
  CircleIcon,
  GridViewIcon,
  Hexagon01Icon,
  HexagonIcon,
  SquareIcon,
  Triangle01Icon,
  TriangleIcon,
} from '@hugeicons/core-free-icons';
import type { PatternType } from '../types/moire';
import type { HugeIcon } from './ui/Icon';

export const PATTERN_ICONS: Record<PatternType, HugeIcon> = {
  'straight-lines': Asterisk02Icon,
  'concentric-circles': CircleIcon,
  'concentric-squares': SquareIcon,
  'concentric-triangles': TriangleIcon,
  'concentric-polygons': HexagonIcon,
  'grid-square': GridViewIcon,
  'grid-hex': Hexagon01Icon,
  'grid-triangle': Triangle01Icon,
};
