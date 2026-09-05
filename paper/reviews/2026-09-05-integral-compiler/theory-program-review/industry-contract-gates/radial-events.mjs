import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const sourcePath = 'paper/tools/exp/theory-probes/band-enclosure.mjs';
const historicalRevision = '722a1a3af0ed361433dbe0563421714a52e902fb';
const R = 6;
const numericAllowance = 1e-10;
const mass = ([lo, hi]) => Math.exp(-lo * lo / 2) * -Math.expm1(-(hi * hi - lo * lo) / 2);

// Known factorizations supply the roots; the independent reference never searches for them.
function coefficients(leading, roots) {
  let ascending = [leading];
  for (const root of roots) {
    const next = Array(ascending.length + 1).fill(0);
    ascending.forEach((value, i) => { next[i] -= root * value; next[i + 1] += value; });
    ascending = next;
  }
  while (ascending.length < 4) ascending.push(0);
  return ascending.reverse();
}

const fixtures = [
  ['positive-constant', 1, [], [[0, R]]],
  ['negative-constant', -1, [], []],
  ['strict-zero-plateau', 0, [], []],
  ['linear-positive', 1, [2], [[2, R]]],
  ['linear-negative', -1, [2], [[0, 2]]],
  ['root-at-origin', 1, [0], [[0, R]]],
  ['root-at-boundary', 1, [R], []],
  ['quadratic-gap', 1, [1, 2], [[0, 1], [2, R]]],
  ['quadratic-band', -1, [1, 2], [[1, 2]]],
  ['quadratic-positive-tangency', 1, [1, 1], [[0, R]]],
  ['quadratic-negative-tangency', -1, [1, 1], []],
  ['negative-origin-and-tangency', -1, [0, 1, 1], []],
  ['cubic-disconnected', 1, [0.6, 1.6, 3.2], [[0.6, 1.6], [3.2, R]]],
  ['cubic-disconnected-opposite', -1, [0.6, 1.6, 3.2], [[0, 0.6], [1.6, 3.2]]],
  ['two-roots-in-one-cell-lower', -1, [1.002, 1.023, 10], [[0, 1.002], [1.023, R]]],
  ['two-roots-in-one-cell-upper', 1, [1.002, 1.023, 10], [[1.002, 1.023]]],
  ['three-roots-in-one-cell', 1, [1.002, 1.011, 1.023], [[1.002, 1.011], [1.023, R]]],
  ['three-roots-in-one-cell-opposite', -1, [1.002, 1.011, 1.023], [[0, 1.002], [1.011, 1.023]]],
];

function extractBetween(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || source.indexOf(start, a + 1) >= 0) {
    throw new Error('Candidate adapter does not match its supported function layout; no results inferred.');
  }
  return source.slice(a, b);
}

export function runRadialEventGates(repo, revision = historicalRevision) {
  if (!/^[a-f0-9]{7,40}$/.test(revision)) throw new Error('Use an immutable hexadecimal Git revision.');
  const commit = execFileSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], { cwd: repo, encoding: 'utf8' }).trim();
  const source = execFileSync('git', ['show', `${commit}:${sourcePath}`], { cwd: repo, encoding: 'utf8' });
  const functions = extractBetween(source, 'function cubicRoots(', 'function bandMassAt(')
    + '\n' + extractBetween(source, 'function coverageAt(', 'function enclosure(');
  // Execute only the two frozen pure functions. Do not run the candidate's reference loops.
  const candidate = new Function(`${functions}\nreturn { cubicRoots, coverageAt };`)();
  const cases = fixtures.map(([id, leading, roots, intervals]) => {
    const polynomial = coefficients(leading, roots);
    const reference = intervals.reduce((sum, interval) => sum + mass(interval), 0);
    const lower = candidate.coverageAt(...polynomial, false);
    const upper = candidate.coverageAt(...polynomial, true);
    const finite = Number.isFinite(lower) && Number.isFinite(upper);
    const valid = finite && lower <= reference + numericAllowance
      && upper >= reference - numericAllowance && lower <= upper + numericAllowance;
    return {
      id, leading, factoredRoots: roots, polynomial, strictPositiveIntervals: intervals,
      reference, lower, upper, returnedRoots: candidate.cubicRoots(...polynomial).roots,
      lowerOverstatement: finite ? Math.max(0, lower - reference) : null,
      upperUnderstatement: finite ? Math.max(0, reference - upper) : null,
      status: valid ? 'contained-with-diagnostic-allowance' : 'rejected',
    };
  });
  const violations = cases.filter(row => row.status === 'rejected');
  return {
    schemaVersion: 1,
    contract: {
      claim: 'Both returned radial-event endpoints contain the strict-positive event mass.',
      source: 'Explicit factored degree-zero through degree-three polynomials.',
      map: 'Whitened Gaussian radius; no material or camera mapping.',
      jointWindow: 'N(0,I2), radial density r exp(-r^2/2).',
      domain: { radius: [0, R], outsideMass: 'Excluded from this inner-ball event test.' },
      norm: 'Absolute probability error.', errorBudget: 0.002,
      workCap: 'Historical candidate: 240 scan cells and 40 bisections per detected crossing; no GPU cost asserted.',
      expectedWitness: 'Every real crossing and strict-zero plateau handled; unresolved neighborhoods retained.',
      reference: 'Known factored roots and explicitly supplied positive intervals; analytic Gaussian radial integral.',
      numericalReferenceAllowance: numericAllowance,
      convergence: 'No sampling discretization; double-precision coefficient and exponential evaluation is not a formal certificate.',
    },
    candidate: { commit, sourcePath, sha256: createHash('sha256').update(source).digest('hex'), adapter: 'named-pure-functions-v1' },
    checks: { total: cases.length, violations: violations.length, candidateAccepted: violations.length === 0 },
    historicalFailureReproduced: commit === historicalRevision
      ? cases.find(row => row.id === 'two-roots-in-one-cell-lower').lowerOverstatement > 0.012
        && cases.find(row => row.id === 'two-roots-in-one-cell-upper').upperUnderstatement > 0.012
      : null,
    cases,
    limitations: [
      'This is a radial inequality gate, not validation of full angular coverage or source remainders.',
      'Known mathematical roots belong to the factored polynomial; its rounded coefficients need a separate numerical enclosure.',
      'The 1e-10 diagnostic allowance is not a proved floating-point error bound.',
      'No timing, shader, or general-material correctness follows from passing these fixtures.',
    ],
  };
}
