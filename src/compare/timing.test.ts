import assert from 'node:assert/strict'
import test from 'node:test'
import type { WebGPURenderer } from 'three/webgpu'
import { createGpuTiming } from './timing.ts'

function fixture(supported = true) {
  const info = { frame: 1, render: { frameCalls: 3 } }
  const requests: Array<(ms: number | undefined) => void> = []
  const renderer = {
    info,
    hasFeature: () => supported,
    resolveTimestampsAsync: () => new Promise<number | undefined>(resolve => requests.push(resolve)),
  } as unknown as WebGPURenderer
  return { info, requests, timer: createGpuTiming(renderer) }
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

test('unavailable GPU timestamps stay unavailable instead of using CPU time', () => {
  const { requests, timer } = fixture(false)
  timer.sample()
  assert.equal(requests.length, 0)
  assert.equal(timer.snapshot().available, false)
  assert.equal(timer.snapshot().latestMs, null)
})

test('one whole-frame measurement, no duplicate or concurrent resolves', async () => {
  const { info, requests, timer } = fixture()
  timer.sample()
  info.frame = 2
  timer.sample()
  assert.equal(requests.length, 1)
  requests[0](1.25)
  await settle()
  assert.equal(timer.snapshot().latestMs, 1.25)
  assert.equal(timer.snapshot().renderPasses, 3)
  timer.sample()
  requests[1](2.75)
  await settle()
  timer.sample()
  assert.equal(requests.length, 2)
  assert.equal(timer.snapshot().medianMs, 2)
})

test('reset rejects late results from the previous camera or settings', async () => {
  const { info, requests, timer } = fixture()
  timer.sample()
  timer.reset()
  requests[0](100)
  await settle()
  assert.equal(timer.snapshot().latestMs, null)
  assert.equal(timer.snapshot().samples, 0)
  info.frame = 2
  timer.sample()
  requests[1](0.5)
  await settle()
  assert.equal(timer.snapshot().latestMs, 0.5)
  assert.equal(timer.snapshot().samples, 1)
})

test('a missing timestamp never turns into a zero-millisecond result', async () => {
  const { requests, timer } = fixture()
  timer.sample()
  requests[0](undefined)
  await settle()
  assert.equal(timer.snapshot().available, false)
  assert.equal(timer.snapshot().medianMs, null)
})
