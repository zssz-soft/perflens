import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLoaf, mainInvoker } from './loaf.ts';

const raw = {
  startTime: 1000, duration: 142, blockingDuration: 92, renderStart: 1115,
  scripts: [
    { startTime: 1002, duration: 67, invoker: 'MessagePort.onmessage', invokerType: 'event-listener', sourceURL: 'https://x/app.js?v=9', sourceFunctionName: 'updateMarkets', sourceCharPosition: 4120, forcedStyleAndLayoutDuration: 3 },
    { startTime: 1070, duration: 41, invoker: 'TimerHandler:setTimeout', invokerType: 'user-callback', sourceURL: 'https://x/app.js', sourceFunctionName: 'flush' },
  ],
};

test('a képkocka bontása: script, render, blokkolás', () => {
  const f = readLoaf(raw);
  assert.equal(f.blockingMs, 92);
  assert.equal(f.scriptMs, 108);
  assert.equal(f.renderMs, 27);                     // 1142 − 1115
  assert.equal(f.scripts.length, 2);
});

test('a scripts[] attribúciója megmarad (17.4/1)', () => {
  const s = readLoaf(raw).scripts[0];
  assert.equal(s.fn, 'updateMarkets');
  assert.equal(s.invokerType, 'event-listener');
  assert.equal(s.charPos, 4120);
  assert.equal(s.forcedLayoutMs, 3);
});

test('a fő kiváltó a leghosszabb script invokere', () => {
  assert.equal(mainInvoker(readLoaf(raw)), 'MessagePort.onmessage');
});

test('render nélküli képkocka: renderMs 0; hiányzó mezők: biztonságos alapérték', () => {
  const f = readLoaf({ startTime: 0, duration: 60 });
  assert.deepEqual([f.renderMs, f.blockingMs, f.scriptMs, f.scripts.length], [0, 0, 0, 0]);
});
