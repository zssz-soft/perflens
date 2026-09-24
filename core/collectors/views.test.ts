import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMEWORK, ViewSpans, ViewTotals, componentOf, type ViewRun } from './views.ts';

const collect = () => { const runs: ViewRun[] = []; return { runs, spans: new ViewSpans((r) => runs.push(r)) }; };
const cost = (r: ViewRun, label: string) => r.views.find((v) => v.label === label);

test('a saját idő a gyermekek nélkül könyvelődik, a futás a legkülső szakasz végén megy ki', () => {
  const { runs, spans } = collect();
  spans.begin('run', 0, '', 'tick');            // tick: 0–100
  spans.begin('view', 5);                      //   List: 5–85, címke a végén
  spans.begin('view', 10, 'List @for[3]');     //     sor-sablonok: 10–40
  spans.end(40, undefined, true);
  spans.begin('view', 45);                     //     Row komponens: 45–75
  spans.end(75, 'Row');
  spans.end(85, 'List');
  assert.equal(runs.length, 0, 'amíg a futás nyitott, nincs kimenet');
  spans.end(100);
  assert.equal(runs.length, 1);
  const r = runs[0];
  assert.deepEqual([r.start, r.dur, r.kind], [0, 100, 'tick']);
  assert.deepEqual(cost(r, 'List @for[3]'), { label: 'List @for[3]', ms: 30, count: 1 });
  assert.deepEqual(cost(r, 'Row'), { label: 'Row', ms: 30, count: 1 });
  assert.deepEqual(cost(r, 'List'), { label: 'List', ms: 20, count: 1 });      // 80 − 30 − 30
  assert.deepEqual(cost(r, FRAMEWORK), { label: FRAMEWORK, ms: 20, count: 0 }); // 100 − 80
  assert.deepEqual(r.views.map((v) => v.ms), [30, 30, 20, 20]);
});

test('ugyanaz a címke összeadódik; a count=false nem számít előfordulásnak', () => {
  const { runs, spans } = collect();
  spans.begin('run', 0);
  for (let i = 0; i < 3; i++) { spans.begin('view', i * 10); spans.begin('view', i * 10, 'Row'); spans.end(i * 10 + 2, undefined, false); spans.end(i * 10 + 5, 'Row'); }
  spans.end(40);
  assert.deepEqual(cost(runs[0], 'Row'), { label: 'Row', ms: 15, count: 3 });
});

test('futás-keret nélküli nézet-szakasz is futás (pl. egy output-kezelő)', () => {
  const { runs, spans } = collect();
  spans.begin('view', 0, 'Btn (listener)', 'output');
  spans.end(8);
  assert.deepEqual([runs[0].kind, runs[0].dur, runs[0].views[0].label], ['output', 8, 'Btn (listener)']);
});

test('a pass-keret saját ideje a keretrendszeré; reset után tiszta lap', () => {
  const { runs, spans } = collect();
  spans.begin('run', 0);
  spans.begin('pass', 1);
  spans.end(10);
  spans.end(10);
  assert.deepEqual(runs[0].views, [{ label: FRAMEWORK, ms: 10, count: 0 }]);
  spans.begin('run', 20); spans.begin('view', 21);
  spans.reset();
  assert.equal(spans.depth, 0);
  spans.end(30);                                // üres veremre: nem dob, nem ad ki
  assert.equal(runs.length, 1);
});

test('ViewTotals: összegez, korlátos, és a toplista kerekít', () => {
  const t = new ViewTotals(2);
  t.add({ start: 0, dur: 10, kind: 'tick', views: [{ label: 'A', ms: 4.04, count: 1 }, { label: 'B', ms: 3, count: 2 }] });
  t.add({ start: 20, dur: 5, kind: 'tick', views: [{ label: 'A', ms: 1, count: 1 }, { label: 'C', ms: 2, count: 1 }] });
  assert.deepEqual([t.runs, t.runMs], [2, 15]);
  assert.deepEqual(t.top(5), [{ label: 'A', ms: 5, count: 2 }, { label: 'B', ms: 3, count: 2 }, { label: FRAMEWORK, ms: 2, count: 1 }]);
});

test('componentOf: a címke első szava', () => {
  assert.equal(componentOf('LiveScreen @if[12] › @for[8]'), 'LiveScreen');
  assert.equal(componentOf('Row'), 'Row');
});
