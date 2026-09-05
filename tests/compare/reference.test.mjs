import assert from 'node:assert/strict';
import test from 'node:test';
import { gaussianOffsets, integratePixel } from './reference.mjs';

test('source reference integrates independent known Gaussian moments and oscillations', () => {
  const offsets = gaussianOffsets(131072, 0.5);
  assert.equal(integratePixel(() => 0.37, 12, -4, offsets), 0.37);
  assert.ok(Math.abs(integratePixel((x) => x, 0, 0, offsets)) < 1e-4);
  assert.ok(Math.abs(integratePixel((x, y) => x * x + y * y, 0, 0, offsets) - 0.5) < 1e-4);
  for (const [a, b] of [[1, 2], [7, -4], [19, 6]]) {
    const got = integratePixel((x, y) => Math.cos(a * x + b * y), 0, 0, offsets);
    const exact = Math.exp(-0.125 * (a * a + b * b));
    assert.ok(Math.abs(got - exact) < 2e-4, `${a},${b}: ${got} vs ${exact}`);
  }
  const halfPlane = integratePixel((x, y) => x + 2 * y >= 0 ? 1 : 0, 0, 0, offsets);
  assert.ok(Math.abs(halfPlane - 0.5) < 1e-4);
});
