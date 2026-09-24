import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hu } from './hu.ts';
import { en } from './en.ts';
import { localeFor, setLocale } from './index.ts';
import { Recorder } from '../recorder.ts';
import { evaluate } from '../rules/engine.ts';
import { buildSession, type SessionContext } from '../session.ts';
import { diffSessions, formatDiff } from '../diff.ts';

/** A szótár minden levele: a sztring, vagy a sablon mintabemenettel. */
const leaves = (node: unknown, path = ''): [string, string][] => {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'function') return [[path, String((node as (...a: unknown[]) => unknown)(7, 7, 7))]];
  return Object.entries(node as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
};
const HUNGARIAN = /[áéíóöőúüű]/i;

test('localeFor: magyar csak a hu-val kezdődő címkére, minden más angol', () => {
  for (const tag of ['hu', 'hu-HU', 'HU', 'hu_HU.UTF-8']) assert.equal(localeFor(tag), 'hu', tag);
  for (const tag of ['en-US', 'de-DE', 'hr', 'hub', '', undefined]) assert.equal(localeFor(tag), 'en', String(tag));
});

test('a két szótár kulcsai egyeznek (a tsc mellett futásidőben is)', () => {
  assert.deepEqual(leaves(en).map(([p]) => p).sort(), leaves(hu).map(([p]) => p).sort());
});

test('az angol szótárban nincs lefordítatlan magyar szöveg', () => {
  assert.deepEqual(leaves(en).filter(([, s]) => HUNGARIAN.test(s)), []);
});

test('a szabálymotor a beállított nyelven ír, a számok nem változnak', () => {
  const longTask = () => {
    const r = new Recorder(); r.start(0); r.longTask(100, 120);
    return evaluate({ buckets: r.buckets.list(), events: r.events.toArray() }).find((f) => f.ruleId === 'long-task')!;
  };
  try {
    setLocale('en');
    const f = longTask();
    assert.equal(f.title, 'Long task: 120 ms');
    assert.deepEqual(f.facts, { 'task duration (ms)': 120, 'blocking part (ms)': 70 });
    setLocale('hu');
    assert.equal(longTask().title, 'Hosszú feladat: 120 ms');
  } finally { setLocale('hu'); }
});

test('a diff-jelentés angolul: nincs magyar szó, a darabnak nincs lógó egysége', () => {
  const ctx: SessionContext = { url: 'https://x/app', userAgent: 'u', viewport: '1600x1000', dpr: 1, mode: 'generic', agentVersion: '1' };
  const sess = (tasks: number[]) => {
    const r = new Recorder(); r.start(0);
    tasks.forEach((d, i) => r.longTask(1000 + i * 700, d));
    return buildSession({ context: ctx, summary: r.summary(10_000), buckets: r.buckets.list(), events: r.events.toArray(), threads: r.threads, sources: r.sources });
  };
  try {
    setLocale('en');
    const a = sess([68, 60]), b = sess([124, 90, 80, 70, 66, 61, 55]);
    const text = formatDiff(a, b, diffSessions(a, b));
    assert.match(text, /PERFORMANCE REGRESSION/);
    assert.match(text, /Longest task:\n {2}68 ms → 124 ms/);
    assert.doesNotMatch(text, HUNGARIAN);
    assert.doesNotMatch(text, / \n| \]/, 'üres egység után nem maradhat szóköz');
  } finally { setLocale('hu'); }
});
