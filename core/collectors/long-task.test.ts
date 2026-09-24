import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LongTaskTally } from './long-task.ts';

test('darabszám, maximum és foglaltság a harness definíciója szerint', () => {
  const t = new LongTaskTally();
  t.add(60); t.add(142); t.add(58);
  assert.deepEqual(t.stats(2600), { longTaskCount: 3, longTaskMaxMs: 142, mainThreadBusyPct: 10 });
});

test('hosszú feladat nélkül: nullák, nem -Infinity', () => {
  assert.deepEqual(new LongTaskTally().stats(1000), { longTaskCount: 0, longTaskMaxMs: 0, mainThreadBusyPct: 0 });
});

test('0 ms eltelt idő: nincs osztás nullával (max(1, eltelt))', () => {
  const t = new LongTaskTally();
  t.add(50);
  assert.equal(t.stats(0).mainThreadBusyPct, 5000);
});

test('reset után újrakezd', () => {
  const t = new LongTaskTally();
  t.add(80); t.reset();
  assert.equal(t.stats(1000).longTaskCount, 0);
});
