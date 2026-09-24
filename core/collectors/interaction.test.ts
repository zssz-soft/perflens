import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InteractionTally } from './interaction.ts';

test('egy interakció több eseményéből a leghosszabb számít (rum.ts definíció)', () => {
  const t = new InteractionTally();
  assert.equal(t.add(7, 40), true);     // pointerdown
  assert.equal(t.add(7, 96), false);    // click — ugyanaz az interakció
  assert.equal(t.add(7, 30), false);
  assert.equal(t.count, 1);
  assert.equal(t.inp(), 96);
});

test('50 alatt az INP a legrosszabb interakció', () => {
  const t = new InteractionTally();
  [20, 180, 60].forEach((d, i) => t.add(i + 1, d));
  assert.equal(t.inp(), 180);
});

test('50 interakciónként egy kiugrót elenged', () => {
  const t = new InteractionTally();
  for (let i = 1; i <= 100; i++) t.add(i, i === 1 ? 900 : i === 2 ? 800 : 50);
  assert.equal(t.inp(), 50);            // 100 → floor(100/50) = 2 → a harmadik legrosszabb
});

test('interakció nélkül 0', () => { assert.equal(new InteractionTally().inp(), 0); });
