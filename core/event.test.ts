import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownEvents, type PerfEvent } from './event.ts';

test('előre kompatibilis: az ismeretlen kind csendben kiesik (17.4/7)', () => {
  const later = [
    { t: 1, seq: 1, src: 'main', kind: 'longtask', dur: 80 },
    { t: 2, seq: 2, src: 'lab', kind: 'hot-function', dur: 12 },   // egy későbbi verzió eseménye
    { t: 3, seq: 3, src: 'main', kind: 'script', parent: 1 },
  ] as unknown as PerfEvent[];
  assert.deepEqual(knownEvents(later).map((e) => e.seq), [1, 3]);
});
