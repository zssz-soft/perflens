import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Recorder } from '../recorder.ts';
import { readLoaf } from '../collectors/loaf.ts';
import { evaluate } from './engine.ts';

// Minden szabályra egy eset, ami KIVÁLTJA, és egy, ami szándékosan NEM
// (27-es doksi 15.7). A hamis pozitív ugyanolyan hiba, mint a hiányzó lelet.

const session = (feed: (r: Recorder) => void) => {
  const r = new Recorder(); r.start(0); feed(r);
  return evaluate({ buckets: r.buckets.list(), events: r.events.toArray(), sources: r.sources });
};
const ids = (fs: ReturnType<typeof evaluate>, rule: string) => fs.filter((f) => f.ruleId === rule);
const frames = (r: Recorder, fromS: number, toS: number) => { for (let s = fromS; s < toS; s++) for (let i = 0; i < 60; i++) r.frame(s * 1000 + i * 16.7, 16.7); };

test('üres munkamenet: nulla lelet', () => { assert.deepEqual(session(() => {}), []); });

test('1. long-task: > 50 ms szól, pontosan 50 nem', () => {
  assert.equal(ids(session((r) => r.longTask(100, 120)), 'long-task').length, 1);
  assert.equal(ids(session((r) => r.longTask(100, 50)), 'long-task').length, 0);
});

test('2. main-thread-busy: 5 s-on át 60% szól, 40% nem', () => {
  const busy = (ms: number) => session((r) => { for (let s = 0; s < 5; s++) r.longTask(s * 1000 + 10, ms); });
  assert.equal(ids(busy(600), 'main-thread-busy').length, 1);
  assert.equal(ids(busy(400), 'main-thread-busy').length, 0);
});

test('3. slow-interaction: 250 ms kritikus, 150 figyelmeztetés, 90 semmi', () => {
  const one = (d: number) => ids(session((r) => r.interaction('click', 100, d, 5, 1)), 'slow-interaction');
  assert.equal(one(250)[0].severity, 'critical');
  assert.equal(one(150)[0].severity, 'warn');
  assert.equal(one(90).length, 0);
});

test('4. input-delay: 60 ms szól, 40 nem', () => {
  assert.equal(ids(session((r) => r.interaction('click', 100, 80, 60, 1)), 'input-delay').length, 1);
  assert.equal(ids(session((r) => r.interaction('click', 100, 80, 40, 1)), 'input-delay').length, 0);
});

test('5. worker-msg-burst: 25 üzenet 100 ms alatt szól, 15 nem; 70/s egyenletesen is szól, 50/s nem', () => {
  const burst = (n: number) => session((r) => { const th = r.thread('shared', 'w.js'); for (let i = 0; i < n; i++) r.workerIn(100 + i * 3, th, 0.1, 'x'); });
  assert.equal(ids(burst(25), 'worker-msg-burst').length, 1);
  assert.equal(ids(burst(15), 'worker-msg-burst').length, 0);
  const steady = (n: number) => session((r) => { const th = r.thread('shared', 'w.js'); for (let i = 0; i < n; i++) r.workerIn(i * (1000 / n), th, 0.1, 'x'); });
  assert.equal(ids(steady(70), 'worker-msg-burst').length, 1);
  assert.equal(ids(steady(50), 'worker-msg-burst').length, 0);
});

test('6. store-churn: több store-írás, mint képkocka, szól — kevesebb nem', () => {
  const churn = (n: number) => session((r) => { frames(r, 0, 1); r.appStats(500, { storeUpdates: n, storeMs: 1, renders: 0, deltas: n, pipelineP50: 0, pipelineP95: 0 }); });
  assert.equal(ids(churn(80), 'store-churn').length, 1);
  assert.equal(ids(churn(30), 'store-churn').length, 0);
});

test('7. ws-burst-blocks: csúcs + utána hosszú task szól; csúcs task nélkül, vagy task csúcs nélkül nem', () => {
  const run = (burst: boolean, task: boolean) => ids(session((r) => {
    for (let s = 0; s < 10; s++) for (let i = 0; i < 5; i++) r.wsMessage(s * 1000 + i * 150, 100, 0.1, 'text');
    if (burst) for (let i = 0; i < 40; i++) r.wsMessage(10_000 + i * 10, 100, 0.1, 'text');
    else for (let i = 0; i < 5; i++) r.wsMessage(10_000 + i * 150, 100, 0.1, 'text');
    if (task) r.longTask(10_450, 90);
  }), 'ws-burst-blocks');
  const hit = run(true, true);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].severity, 'critical');
  assert.equal(hit[0].hypothesis?.confidence, 'probable');
  assert.equal(run(true, false).length, 0);
  assert.equal(run(false, true).length, 0);
});

test('8. interaction-then-work: interakció alatt/után hosszú task szól, nélküle nem', () => {
  assert.equal(ids(session((r) => { r.interaction('click', 1000, 130, 5, 5); r.longTask(1010, 120); }), 'interaction-then-work').length, 1);
  assert.equal(ids(session((r) => { r.interaction('click', 1000, 30, 5, 5); r.longTask(3000, 120); }), 'interaction-then-work').length, 0);
});

test('9. pipeline-slow: kumulált p95 > 100 ms szól (egyszer), 60 nem', () => {
  const p = (v: number) => ids(session((r) => { for (let s = 0; s < 3; s++) r.appStats(s * 1000, { storeUpdates: 1, storeMs: 0, renders: 0, deltas: 1, pipelineP50: 0, pipelineP95: v }); }), 'pipeline-slow');
  assert.equal(p(150).length, 1);
  assert.equal(p(60).length, 0);
});

test('a LoAF-gazdagító a 17.1 láncának első lépéseit adja — műszerezés nélkül', () => {
  const fs = session((r) => {
    r.loaf(readLoaf({ startTime: 95, duration: 130, blockingDuration: 70, scripts: [
      { startTime: 96, duration: 118, invoker: 'MessagePort.onmessage', invokerType: 'event-listener', sourceURL: 'https://x/main-abc.js?v=1', sourceFunctionName: 'updateMarkets', sourceCharPosition: 4120 },
    ] }));
    r.longTask(96, 120);
  });
  const steps = ids(fs, 'long-task')[0].steps.map((s) => s.text);
  assert.deepEqual(steps.slice(0, 3), [
    'kiváltója: MessagePort.onmessage',
    '118 ms JavaScript-futás',
    'a képkocka többi része (render, elrendezés, tétlen): 12 ms',
  ]);
  assert.ok(steps.includes('ebből 118 ms: updateMarkets() — main-abc.js'));
});

test('az alkalmazás-gazdagító a lelet előtti forgalmat számolja', () => {
  const fs = session((r) => { const th = r.thread('shared', 'w.js'); for (let i = 0; i < 12; i++) r.workerIn(700 + i * 20, th, 0.2, 'match_batch'); r.longTask(1000, 90); });
  assert.ok(ids(fs, 'long-task')[0].steps.some((s) => s.layer === 'app' && s.text.startsWith('12 worker-üzenet')));
});

test('sorrend: kritikus előre; azonosító stabil újraértékelésnél', () => {
  const feed = (r: Recorder) => { r.longTask(100, 80); r.interaction('click', 50, 250, 5, 1); };
  const a = session(feed), b = session(feed);
  assert.equal(a[0].severity, 'critical');
  assert.deepEqual(a.map((f) => f.id), b.map((f) => f.id));
});

test('hűtés: egymást követő másodpercek rátalelete EGY lelet, előfordulással', () => {
  const fs = session((r) => { frames(r, 0, 6); for (let s = 0; s < 5; s++) r.appStats(s * 1000 + 500, { storeUpdates: 90, storeMs: 1, renders: 0, deltas: 90, pipelineP50: 0, pipelineP95: 0 }); });
  const churn = ids(fs, 'store-churn');
  assert.equal(churn.length, 1);
  assert.equal(churn[0].facts['előfordulás'], 5);
  assert.match(churn[0].title, /5×/);
});

test('hűtés NEM vonja össze az önálló eseményeket: három hosszú task három lelet', () => {
  assert.equal(ids(session((r) => { r.longTask(100, 80); r.longTask(500, 80); r.longTask(900, 80); }), 'long-task').length, 3);
});

test('10. dropped-frames: megmondja, volt-e főszál-bizonyíték', () => {
  // egy kimaradt képkocka, hosszú feladat NÉLKÜL → tájékoztatás, és kimondja,
  // hogy nem a JS blokkolt (ez volt a kérdés a dashboard piros oszlopánál)
  const alone = ids(session((r) => { for (let i = 1; i <= 30; i++) r.frame(i * 16.7, 16.7); r.frame(534, 33); }), 'dropped-frames');
  assert.equal(alone.length, 1);
  assert.equal(alone[0].severity, 'info');
  assert.equal(alone[0].facts['főszál-bizonyíték'], 'nincs');
  assert.match(alone[0].hint, /nem a JS blokkolásából/);

  // ugyanaz a rés, de hosszú feladattal → figyelmeztetés, a feladat hosszával
  const withTask = ids(session((r) => { for (let i = 1; i <= 30; i++) r.frame(i * 16.7, 16.7); r.longTask(510, 90); r.frame(610, 100); }), 'dropped-frames');
  assert.equal(withTask[0].severity, 'warn');
  assert.match(String(withTask[0].facts['főszál-bizonyíték']), /hosszú feladat, 90/);
});

test('10. dropped-frames: egyenletes futásra nincs lelet', () => {
  assert.equal(ids(session((r) => { for (let i = 1; i <= 120; i++) r.frame(i * 16.7, 16.7); }), 'dropped-frames').length, 0);
});

test('a nézet-gazdagító megmondja, melyik komponens és melyik rész vitte az időt, és hol változott a DOM', () => {
  const fs = session((r) => {
    r.longTask(100, 90);
    r.viewRun({ start: 105, dur: 80, kind: 'tick', views: [
      { label: 'LiveScreen @if[12] › @for[8]', ms: 30, count: 40 },
      { label: 'EventRowComponent', ms: 25, count: 40 },
      { label: 'LiveScreen', ms: 6, count: 1 },
      { label: '(framework)', ms: 12, count: 0 },
      { label: 'TopBarComponent', ms: 0.5, count: 1 },
    ] });
    r.domBatch({ t: 186, total: 412, hosts: [['app-event-row › app-odds-button', 380], ['app-live-screen', 30], ['app-top-bar', 2]] });
  });
  const steps = ids(fs, 'long-task')[0].steps.filter((s) => s.layer === 'view').map((s) => s.text);
  assert.deepEqual(steps, [
    '80 ms nézet-frissítés (1 futás, Angular-profil — fejlesztői build)',
    'ebből 36 ms: LiveScreen (1× ellenőrizve) — főleg @if[12] › @for[8]: 30 ms',
    'ebből 25 ms: EventRowComponent (40× ellenőrizve)',
    '412 DOM-változás; a legtöbb: app-event-row › app-odds-button (380), app-live-screen (30)',
  ]);
});

test('a nézet-gazdagító hallgat, ha a nézet-munka nem a lelet ablakában volt; a rövid futás és a kis DOM-köteg nem esemény', () => {
  const fs = session((r) => {
    r.longTask(1000, 90);
    r.viewRun({ start: 3000, dur: 60, kind: 'tick', views: [{ label: 'A', ms: 60, count: 1 }] });
    r.viewRun({ start: 1010, dur: 3, kind: 'tick', views: [{ label: 'B', ms: 3, count: 1 }] });
    r.domBatch({ t: 1050, total: 5, hosts: [['app-x', 5]] });
  });
  assert.deepEqual(ids(fs, 'long-task')[0].steps.filter((s) => s.layer === 'view'), []);
});
