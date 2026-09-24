import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DomTally, hostLabel, type NodeLike } from './dom.ts';

const el = (nodeName: string, parentNode: NodeLike | null = null): NodeLike => ({ nodeType: 1, nodeName, parentNode });

const body = el('BODY', el('HTML'));
const main = el('MAIN', body);
const live = el('APP-LIVE-SCREEN', main);
const row = el('APP-EVENT-ROW', el('DIV', live));
const odds = el('APP-ODDS-BUTTON', el('SPAN', row));
const span = el('SPAN', odds);

test('hostLabel: a legközelebbi két egyedi elem, kívülről befelé', () => {
  assert.equal(hostLabel(span), 'app-event-row › app-odds-button');
  assert.equal(hostLabel(el('DIV', live)), 'app-live-screen');
});

test('hostLabel: egyedi elem nélkül a tájékozódási elem, végül document', () => {
  assert.equal(hostLabel(el('LI', el('UL', main))), 'ul');
  assert.equal(hostLabel(el('DIV', body)), 'document');
  assert.equal(hostLabel(null), 'document');
});

test('DomTally: gazdaelemenként számol, csökkenő sorrendben', () => {
  const b = new DomTally().count(12, [span, span, odds, el('DIV', live), null]);
  assert.equal(b.total, 4);
  assert.equal(b.t, 12);
  assert.deepEqual(b.hosts, [['app-event-row › app-odds-button', 3], ['app-live-screen', 1]]);
});
