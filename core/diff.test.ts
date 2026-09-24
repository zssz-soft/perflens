import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Recorder } from './recorder.ts';
import { buildSession, type SessionContext } from './session.ts';
import { diffSessions, formatDiff } from './diff.ts';

const ctx: SessionContext = { url: 'https://x/app', userAgent: 'u', viewport: '1600x1000', dpr: 1, mode: 'generic', agentVersion: '1' };
const sess = (tasks: number[], opts: { ws?: number; durMs?: number; context?: Partial<SessionContext> } = {}) => {
  const r = new Recorder(); r.start(0);
  tasks.forEach((d, i) => r.longTask(1000 + i * 700, d));
  for (let i = 0; i < (opts.ws ?? 0); i++) r.wsMessage(10 + i, 100, 0.1, 'text');
  return buildSession({ context: { ...ctx, ...opts.context }, summary: r.summary(opts.durMs ?? 10_000), buckets: r.buckets.list(), events: r.events.toArray(), threads: r.threads, sources: r.sources });
};

test('a feladat példája: 68 → 124 ms, 2 → 7 task → regresszió', () => {
  const d = diffSessions(sess([68, 60]), sess([124, 90, 80, 70, 66, 61, 55]));
  const row = (k: string) => d.rows.find((r) => r.key === k)!;
  assert.equal(d.passed, false);
  assert.deepEqual([row('worstTask').base, row('worstTask').next, row('worstTask').verdict], [68, 124, 'regressed']);
  assert.deepEqual([row('longTasks').baseRaw, row('longTasks').nextRaw, row('longTasks').verdict], [2, 7, 'regressed']);
  const text = formatDiff(sess([68, 60]), sess([124, 90, 80, 70, 66, 61, 55]), d);
  assert.match(text, /TELJESÍTMÉNY-REGRESSZIÓ/);
  assert.match(text, /Leghosszabb feladat:\n  68 ms → 124 ms/);
});

test('küszöbön belül stabil, javulás javulás', () => {
  const d = diffSessions(sess([80]), sess([95]));
  assert.equal(d.rows.find((r) => r.key === 'worstTask')!.verdict, 'stable');     // +15 < +20
  assert.equal(diffSessions(sess([140]), sess([80])).rows.find((r) => r.key === 'worstTask')!.verdict, 'improved');
  assert.equal(d.passed, true);
});

test('app-tudatos metrika generikus munkamenetben: n/a, nem 0', () => {
  const d = diffSessions(sess([80]), sess([80]));
  assert.equal(d.rows.find((r) => r.key === 'pipelineP95')!.verdict, 'n/a');
});

test('összevethetőség: eltérő terhelés, hossz, oldal — kimondva, nem tiltva', () => {
  const w = diffSessions(sess([80], { ws: 100 }), sess([80], { ws: 400, durMs: 20_000, context: { url: 'https://x/other' } })).comparability.join(' | ');
  assert.match(w, /eltérő terhelés/);
  assert.match(w, /eltérő hossz/);
  assert.match(w, /más oldal/);
});

test('eltérő hosszú munkamenet: a darabszám percre vetítve kapuz', () => {
  // 2 task 10 s alatt = 12/perc; 4 task 20 s alatt = 12/perc → stabil, nem „2 → 4"
  const d = diffSessions(sess([60, 60]), sess([60, 60, 60, 60], { durMs: 20_000 }));
  assert.equal(d.rows.find((r) => r.key === 'longTasks')!.verdict, 'stable');
});
