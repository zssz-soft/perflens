import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameTally, PAUSE_MS } from './frames.ts';

test('60 Hz-en egy 50 ms-os rés két kiesett képkocka', () => {
  const t = new FrameTally();
  for (let i = 0; i < 30; i++) t.add(16.7);
  assert.deepEqual(t.add(50), { dropped: 2, pausedMs: 0 });
  assert.equal(t.frames, 31);
  assert.equal(t.dropped, 2);
});

test(`a ${PAUSE_MS} ms-nál hosszabb rés SZÜNET, nem kiesés (rejtett vagy fojtott fül)`, () => {
  const t = new FrameTally();
  for (let i = 0; i < 60; i++) t.add(16.7);
  // A javítás előtt ez 897 „kiesett képkockát" adott — egy ablakváltás
  // 10 435-re hízlalta a számlálót egy egyébként akadásmentes appon.
  assert.deepEqual(t.add(15_000), { dropped: 0, pausedMs: 15_000 });
  assert.equal(t.dropped, 0);
  assert.equal(t.pausedMs, 15_000);
});

test('rejtett fülön a rövid rés is szünet', () => {
  const t = new FrameTally();
  for (let i = 0; i < 30; i++) t.add(16.7);
  assert.deepEqual(t.add(50, true), { dropped: 0, pausedMs: 50 });
});

test('120 Hz-en a képkocka-időt a deltákból tanulja (nem égeti be a 16,7-et)', () => {
  const t = new FrameTally();
  for (let i = 0; i < 30; i++) t.add(8.33);
  assert.equal(t.add(16.7).dropped, 1); // 60 Hz-es feltevéssel 0 lenne
});

test('egyenletes futásban nincs kiesés', () => {
  const t = new FrameTally();
  for (let i = 0; i < 100; i++) t.add(16.7 + (i % 3) * 0.3);
  assert.equal(t.dropped, 0);
});
