import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Recorder } from './recorder.ts';
import { buildSession, parseSession, SCHEMA } from './session.ts';

const ctx = { url: 'https://x/', userAgent: 'test', viewport: '1600x1000', dpr: 2, mode: 'generic' as const, agentVersion: '0' };
const make = () => {
  const r = new Recorder(); r.start(0);
  r.longTask(100, 120); r.interaction('click', 50, 250, 5, 1);
  return buildSession({ context: ctx, summary: r.summary(2000), buckets: r.buckets.list(), events: r.events.toArray(), threads: r.threads, sources: r.sources, now: new Date('2026-09-11T10:00:00Z') });
};

test('mentés → betöltés: ugyanaz a munkamenet és ugyanazok a leletek', () => {
  const s = make();
  const back = parseSession(JSON.stringify(s));
  assert.equal(back.schema, SCHEMA);
  assert.deepEqual(back.summary, s.summary);
  assert.deepEqual(back.findings.map((f) => f.id), s.findings.map((f) => f.id));
  assert.equal(s.startedAt, '2026-09-11T09:59:58.000Z');
});

test('előre kompatibilis: egy későbbi verzió ismeretlen eseménye és mezője nem tör', () => {
  const s = make() as unknown as Record<string, unknown>;
  (s.events as unknown[]).push({ t: 5, seq: 99, src: 'lab', kind: 'hot-function', dur: 3 });
  s.profile = { nodes: [] };
  const back = parseSession(JSON.stringify(s));
  assert.ok(!back.events.some((e) => (e.kind as string) === 'hot-function'));
});

test('hibás fájl: érthető hiba', () => {
  assert.throws(() => parseSession('nem json'), /Nem JSON/);
  assert.throws(() => parseSession('{"schema":"perflens/9"}'), /Ismeretlen séma/);
  assert.throws(() => parseSession(`{"schema":"${SCHEMA}"}`), /Hiányos/);
});
