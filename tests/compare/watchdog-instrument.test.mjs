import assert from 'node:assert/strict';
import test from 'node:test';
import { instrumentWgslWatchdog, auditWgslWatchdog, findWgslLoops, WATCHDOG_PREFIX } from './watchdog-instrument.mjs';

test('every loop kind and nested continue path gets a first-statement guard', () => {
  const source = `fn work() { for(var i=0;i<3;i++){loop{if(i>0){continue;} break;}} while(true){break;} while false { break; } }`;
  const result = instrumentWgslWatchdog(source, { limit: 64 });
  assert.equal(result.audit.loopCount, 4);
  assert.deepEqual(findWgslLoops(source).map(l => l.kind), ['for', 'loop', 'while', 'while']);
  assert.equal(auditWgslWatchdog(result.code, 64, 4).uncovered, 0);
  const missing = result.code.replace(`if (${WATCHDOG_PREFIX}Fuel >= 64u)`, 'if (false)');
  assert.throws(() => auditWgslWatchdog(missing, 64, 4), /Incomplete watchdog/);
});

test('comments, including nested block comments, do not manufacture loops', () => {
  const source = `// for(;;){\n/* loop { /* while(true){} */ } */ fn loopName(){loop /* body */ { break; }} `;
  assert.equal(instrumentWgslWatchdog(source).audit.loopCount, 1);
});

test('malformed or already instrumented source fails closed', () => {
  for (const source of ['fn x(){ for { } }', 'fn x(){loop {', '/* incomplete', 'fn x(){ "loop"; }']) assert.throws(() => instrumentWgslWatchdog(source));
  const result = instrumentWgslWatchdog('fn x(){loop{break;}}');
  assert.throws(() => instrumentWgslWatchdog(result.code), /already present/);
  assert.throws(() => auditWgslWatchdog(result.code, 16384, 2), /Incomplete/);
  for (const limit of [0, 32769, 1.5, Infinity]) assert.throws(() => instrumentWgslWatchdog('fn x(){}', { limit }));
});
