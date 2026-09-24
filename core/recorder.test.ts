import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, cleanUrl, safeLabel } from './recorder.ts';
import { readLoaf } from './collectors/loaf.ts';

test('rögzítés nélkül semmi nem kerül a pufferbe', () => {
  const r = new Recorder();
  r.longTask(10, 80); r.wsMessage(20, 512, 1, 'text');
  assert.equal(r.events.size, 0);
});

test('a LoAF és a scriptjei láncolva, a forrás táblában, tisztított URL-lel (17.4/1–4)', () => {
  const r = new Recorder(); r.start(0);
  r.loaf(readLoaf({ startTime: 100, duration: 90, blockingDuration: 40, scripts: [
    { startTime: 101, duration: 60, invokerType: 'event-listener', sourceURL: 'https://x/a.js?token=SECRET#h', sourceFunctionName: 'f', sourceCharPosition: 7 },
    { startTime: 170, duration: 10, invokerType: 'user-callback', sourceURL: 'https://x/a.js?token=OTHER', sourceFunctionName: 'f', sourceCharPosition: 7 },
  ] }));
  const [loaf, s1, s2] = r.events.toArray();
  assert.equal(loaf.kind, 'loaf');
  assert.equal(s1.parent, loaf.id);
  assert.equal(s2.parent, loaf.id);
  assert.equal(s1.source, s2.source, 'ugyanaz a függvény → ugyanaz a forrás-bejegyzés');
  assert.deepEqual(r.sources, [{ url: 'https://x/a.js', fn: 'f', charPos: 7 }]);
  assert.ok(!JSON.stringify(r.sources).includes('SECRET'));
});

test('vödör és összegzés együtt mozog', () => {
  const r = new Recorder(); r.start(0);
  r.longTask(100, 120); r.longTask(1500, 60);
  r.wsMessage(200, 100, 0.5, 'text'); r.wsMessage(300, 50, 0.5, 'text');
  const th = r.thread('shared', 'https://x/ws.worker.js?v=1');
  r.workerIn(400, th, 2, 'match_batch');
  const s = r.summary(2000);
  assert.equal(s.longTaskCount, 2);
  assert.equal(s.mainThreadBusyPct, 9);           // 180 / 2000
  assert.equal(s.wsBytes, 150);
  assert.equal(s.workerIn, 1);
  assert.equal(r.threads[th].url, 'https://x/ws.worker.js');
  const [b0, b1] = r.buckets.list();
  assert.deepEqual([b0.longTasks, b0.wsMessages, b0.workerIn, b1.longTasks], [1, 2, 1, 1]);
});

test('képkockánként NEM esemény, csak résnél', () => {
  const r = new Recorder(); r.start(0);
  for (let i = 1; i <= 40; i++) r.frame(i * 16.7, 16.7);
  r.frame(720, 50);
  assert.deepEqual(r.events.toArray().map((e) => e.kind), ['frame-gap']);
});

test('start() tiszta lapot ad, a szál-tábla viszont megmarad (a worker él tovább)', () => {
  const r = new Recorder(); r.start(0);
  const th = r.thread('dedicated', 'w.js'); r.workerIn(1, th, 1, 'x');
  r.start(10);
  assert.equal(r.events.size, 0);
  assert.equal(r.summary(20).workerIn, 0);
  assert.equal(r.threads.length, 2);
});

test('címke: csak azonosító-alakú type, tartalom soha', () => {
  assert.equal(safeLabel({ type: 'match_batch', entries: [] }), 'match_batch');
  assert.equal(safeLabel({ type: 'Kovács János egyenlege: 5000' }), 'object');
  assert.equal(safeLabel('szöveg'), 'string');
  assert.equal(safeLabel(null), 'null');
});

test('URL-tisztítás', () => {
  assert.equal(cleanUrl('https://x/p?a=1#f'), 'https://x/p');
  assert.equal(cleanUrl('https://x/p'), 'https://x/p');
});
