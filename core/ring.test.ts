import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ring } from './ring.ts';

test('kapacitás alatt mindent megtart, időrendben', () => {
  const r = new Ring<number>(3);
  r.push(1); r.push(2);
  assert.deepEqual(r.toArray(), [1, 2]);
  assert.equal(r.dropped, 0);
});

test('betelve a legrégebbi esik ki, és a veszteség látszik', () => {
  const r = new Ring<number>(3);
  for (let i = 1; i <= 7; i++) r.push(i);
  assert.deepEqual(r.toArray(), [5, 6, 7]);
  assert.equal(r.size, 3);
  assert.equal(r.total, 7);
  assert.equal(r.dropped, 4);
});

test('clear után tiszta lap', () => {
  const r = new Ring<number>(2);
  r.push(1); r.push(2); r.push(3); r.clear();
  assert.deepEqual(r.toArray(), []);
  assert.equal(r.dropped, 0);
  r.push(9);
  assert.deepEqual(r.toArray(), [9]);
});

test('érvénytelen kapacitás: hiba, nem csendes 0-s puffer', () => {
  assert.throws(() => new Ring(0), RangeError);
  assert.throws(() => new Ring(1.5), RangeError);
});
