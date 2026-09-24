import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epochToPage, pageToEpoch, MAX_AGE_MS, FUTURE_TOLERANCE_MS } from './clock.ts';

const ORIGIN = 1_757_000_000_000;

test('a worker-epoch bélyeg a lap órájára vált', () => {
  assert.deepEqual(epochToPage(ORIGIN + 900, ORIGIN, 1000), { t: 900, clamped: false });
});

test('hiányzó bélyeg: a most, visszavágás nélkül (a főszál-úton nincs mit átváltani)', () => {
  assert.deepEqual(epochToPage(undefined, ORIGIN, 1000), { t: 1000, clamped: false });
});

test('jövőbeli bélyeg: a mostra vág, és jelzi — negatív latencia nem lehet', () => {
  assert.deepEqual(epochToPage(ORIGIN + 1500, ORIGIN, 1000), { t: 1000, clamped: true });
});

test(`tűrésen (${FUTURE_TOLERANCE_MS} ms) belüli jövő: ugyanaz a mostra vágás, de NEM hiba (órakülönbség)`, () => {
  assert.deepEqual(epochToPage(ORIGIN + 1000.2, ORIGIN, 1000), { t: 1000, clamped: false });
  assert.deepEqual(epochToPage(ORIGIN + 1000 + FUTURE_TOLERANCE_MS + 0.1, ORIGIN, 1000).clamped, true);
});

test(`${MAX_AGE_MS} ms-nál régebbi bélyeg: visszavág (a harness korlátja)`, () => {
  assert.equal(epochToPage(ORIGIN + 10, ORIGIN, 10 + MAX_AGE_MS + 1).clamped, true);
  assert.equal(epochToPage(ORIGIN + 10, ORIGIN, 10 + MAX_AGE_MS).clamped, false);
});

test('oda-vissza átváltás', () => {
  assert.equal(epochToPage(pageToEpoch(420, ORIGIN), ORIGIN, 1000).t, 420);
});
