import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BucketSet } from './buckets.ts';

test('másodperc szerint vödröz', () => {
  const s = new BucketSet();
  s.at(10).wsMessages++; s.at(999).wsMessages++; s.at(1000).wsMessages++;
  assert.deepEqual(s.list().map((b) => [b.t0, b.wsMessages]), [[0, 2], [1000, 1]]);
});

test('a korlát fölött a legrégebbi vödör esik ki', () => {
  const s = new BucketSet(3);
  for (let sec = 0; sec < 5; sec++) s.at(sec * 1000);
  assert.deepEqual(s.list().map((b) => b.t0), [2000, 3000, 4000]);
});
