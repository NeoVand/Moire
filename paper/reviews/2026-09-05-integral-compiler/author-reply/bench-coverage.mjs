import fs from 'node:fs';
import os from 'node:os';
import { gaussianChirpMoments as moments } from './gaussian-chirp.mjs';

const cases = [
  ['small finite interval', { a: -1.3, b: 2.1, beta: 2.3, q: -4.1 }],
  ['quadratic masked halfline', { a: 1, q: 2 }],
  ['oscillatory finite', { a: -1, b: 2, beta: 512, q: 128 }],
  ['high stationary finite', { a: -2, b: 3, beta: 1000, q: 1000 }],
  ['high stationary halfline', { a: -1, beta: 1000, q: 1000 }],
  ['same phase full-line shortcut', { beta: 1000, q: 1000 }],
  ['default work budget rejection', { a: -3, b: 3, beta: 1e5, q: 1e5 }],
];
const rows = [];
for (const [name, args] of cases) {
  try {
    for (let k = 0; k < 3; k++) moments(args);
    const times = [];
    let result;
    for (let k = 0; k < 11; k++) {
      const start = performance.now();
      result = moments(args);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    rows.push({ name, args, medianMs: times[5], minMs: times[0], maxMs: times[10], panels: result.panels,
      coefficients: result.coefficients, status: result.status, method: result.method });
  } catch (error) {
    rows.push({ name, args, error: error.message });
  }
}
const report = { node: process.version, cpu: os.cpus()[0].model, platform: `${os.platform()} ${os.arch()}`,
  repeats: 11, warmups: 3, note: 'Single process, CPU reference only; not a GPU benchmark or comparison with the compiler.', rows };
if (process.argv.includes('--write'))
  fs.writeFileSync(new URL('./coverage-benchmark.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
