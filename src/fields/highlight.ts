import { EXPR_CONSTANT_NAMES, EXPR_FUNCTION_NAMES } from './expr';

/**
 * Display tokens for the field editor. This is not a second lexer with opinions:
 * numbers use the same shape the parser accepts, and the name classes come from
 * the parser's own tables, so a token can only be coloured the way it will parse.
 * Anything the parser would reject scans as `unknown` and the editor shows it as
 * an error even before the compile message lands.
 */
export type ExprTokenKind =
  | 'number'
  | 'coord' // x, y
  | 'polar' // r, theta
  | 'constant' // pi, tau, e
  | 'fn'
  | 'op'
  | 'paren'
  | 'comma'
  | 'space'
  | 'unknown';

export interface ExprToken {
  text: string;
  kind: ExprTokenKind;
  at: number;
}

// Mirrors NUMBER_HEAD in expr.ts.
const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const NAME = /[a-zA-Z_][a-zA-Z0-9_]*/y;

function nameKind(name: string): ExprTokenKind {
  if (name === 'x' || name === 'y') return 'coord';
  if (name === 'r' || name === 'theta') return 'polar';
  if (EXPR_CONSTANT_NAMES().includes(name)) return 'constant';
  if (EXPR_FUNCTION_NAMES().includes(name)) return 'fn';
  return 'unknown';
}

export function tokenizeForDisplay(source: string): ExprToken[] {
  const out: ExprToken[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      let j = i + 1;
      while (j < source.length && ' \t\n'.includes(source[j])) j++;
      out.push({ text: source.slice(i, j), kind: 'space', at: i });
      i = j;
      continue;
    }
    NUMBER.lastIndex = i;
    const num = NUMBER.exec(source);
    if (num) {
      out.push({ text: num[0], kind: 'number', at: i });
      i += num[0].length;
      continue;
    }
    NAME.lastIndex = i;
    const name = NAME.exec(source);
    if (name) {
      out.push({ text: name[0], kind: nameKind(name[0]), at: i });
      i += name[0].length;
      continue;
    }
    if ('+-*/^'.includes(ch)) out.push({ text: ch, kind: 'op', at: i });
    else if (ch === '(' || ch === ')') out.push({ text: ch, kind: 'paren', at: i });
    else if (ch === ',') out.push({ text: ch, kind: 'comma', at: i });
    else out.push({ text: ch, kind: 'unknown', at: i });
    i += 1;
  }
  return out;
}
