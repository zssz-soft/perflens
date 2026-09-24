import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Recorder } from './recorder.ts';
import { TRACKS, type TrackSink } from './tracks.ts';
import { zeroCounters, type WorkerSummary } from './telemetry.ts';

const capture = () => {
  const got: { name: string; start: number; end: number; track: string }[] = [];
  const sink: TrackSink = { entry: (name, start, end, track) => got.push({ name, start, end, track }) };
  return { got, sink };
};
const summary = (spans: number[], tot = zeroCounters()): WorkerSummary => ({
  v: 1, type: 'perflens:worker', id: 'w1', url: 'https://x/ws.worker.perflens.js', scope: 'shared',
  t: 0, reason: 'tick', tot, win: { ...zeroCounters(), handlerMaxMs: 0, queueMaxMs: 0 }, spans, spansDropped: 0,
});

test('a főszál worker-üzenete a saját sávjára kerül', () => {
  const { got, sink } = capture();
  const r = new Recorder(); r.tracks = sink; r.start(0);
  r.workerIn(100, 1, 2.5, 'match_batch');
  assert.deepEqual(got, [{ name: 'match_batch', start: 100, end: 102.5, track: TRACKS.mainWorker }]);
});

test('a worker-szakaszok epoch-ból a lap órájára váltva, fajta szerint sávra', () => {
  const { got, sink } = capture();
  const r = new Recorder(); r.tracks = sink; r.timeOrigin = 1_000_000; r.start(0);
  r.workerSummary(summary([]), 0, 1);                       // bázis — nem rajzol
  r.workerSummary(summary([1_000_500, 1.5, 1, 1_000_510, 4, 2]), 600, 1);
  assert.deepEqual(got.map((g) => [g.track, g.start, g.end]), [
    [TRACKS.wsWorker, 500, 501.5],
    [TRACKS.queue, 510, 514],
  ]);
});

test('sink nélkül nem rajzol, és nem is hibázik', () => {
  const r = new Recorder(); r.start(0);
  r.workerIn(1, 1, 1, 'x');
  assert.equal(r.events.size, 1);
});
