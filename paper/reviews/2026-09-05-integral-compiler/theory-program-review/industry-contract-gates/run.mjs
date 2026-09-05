import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { runRadialEventGates } from './radial-events.mjs';
import { runSourceRemainderGates } from './source-remainder.mjs';
import { runCompositionGates } from './composition.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: directory, encoding: 'utf8' }).trim();
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!['--revision', '--out'].includes(key) || !value || key in options) {
    throw new Error('Usage: node run.mjs [--revision <hex-commit>] [--out <new-json-file>]');
  }
  options[key] = value;
}
const timestamp = new Date().toISOString();
const output = options['--out'] ? path.resolve(options['--out'])
  : path.join(directory, 'results', `${timestamp.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.json`);
if (fs.existsSync(output)) throw new Error('Refusing to overwrite a prior result.');

const radial = runRadialEventGates(repo, options['--revision']);
const source = runSourceRemainderGates();
const composition = runCompositionGates();
const sourceChecksPassed = source.passed && composition.passed;
const report = {
  schemaVersion: 1, createdAt: timestamp,
  provenance: {
    repoRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    runtime: process.version, platform: process.platform, architecture: process.arch,
    runnerSources: Object.fromEntries(['run.mjs', 'radial-events.mjs', 'source-remainder.mjs', 'composition.mjs'].map(file =>
      [file, createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')])),
    candidateSource: radial.candidate,
  },
  scope: 'Independent CPU mathematical/semantic fixtures; only radial functions are loaded from the candidate.',
  summary: {
    candidateRadialAccepted: radial.checks.candidateAccepted,
    radialCases: radial.checks.total, radialViolations: radial.checks.violations,
    sourceRemainderChecks: source.checks.length, sourceRemainderChecksPassed: source.checks.filter(c => c.passed).length,
    sourceRemainderSamples: source.cases.reduce((sum, row) => sum + row.result.sampleCount, 0),
    compositionCases: composition.cases.length,
    compositionChecks: composition.checks.length, compositionChecksPassed: composition.checks.filter(c => c.passed).length,
    historicalRadialFailureReproduced: radial.historicalFailureReproduced,
    legacySourceBoundViolationFactor: source.counterexample.leadingViolationFactor,
    status: !sourceChecksPassed ? 'independent-fixture-check-failed'
      : radial.checks.candidateAccepted ? 'cpu-fixtures-passed' : 'candidate-radial-contract-rejected',
  },
  radial, sourceRemainder: source, composition,
  limitations: [
    'Passing this package does not certify a shader, general material lowering, or an outward-rounded implementation.',
    'Source-remainder and composition modules define independent contracts; they are not candidate compiler integrations.',
    'No GPU timing, reference rendering, temporal reconstruction, or industry material coverage is established.',
    'Use the immutable candidate revision and source hashes; the working repository may contain concurrent author changes.',
  ],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, ...report.summary }, null, 2));
process.exitCode = !sourceChecksPassed ? 1 : radial.checks.candidateAccepted ? 0 : 2;
