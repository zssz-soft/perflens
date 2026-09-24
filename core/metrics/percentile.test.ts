import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, round1, maxOf } from './percentile.ts';

// Ezek az esetek a `shared/perf-harness.ts` definícióját rögzítik. Ha a mag
// eltérne tőle, a drift-őr a futásban is elkapná — itt olcsóbban, előbb.

test('alsó-index percentilis, interpoláció nélkül (a harness szerint)', () => {
  assert.equal(percentile([1, 2, 3, 4], 50), 3);          // floor(0,5·4) = 2 → 3
  assert.equal(percentile([10, 20, 30], 95), 30);         // floor(2,85) = 2
  assert.equal(percentile([5], 1), 5);
});

test('üres tömb: 0, nem NaN', () => {
  assert.equal(percentile([], 95), 0);
});

test('egy tizedesre kerekít', () => {
  assert.equal(round1(12.345), 12.3);
  assert.equal(percentile([1.26, 2], 1), 1.3);
});

test('maxOf nagy tömbön sem száll el (nincs spread)', () => {
  const big = Array.from({ length: 300_000 }, (_, i) => i);
  assert.equal(maxOf(big), 299_999);
});
