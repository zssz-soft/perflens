import type { PerfEvent } from './event.ts';
import { Ring } from './ring.ts';
import { BucketSet, type Bucket } from './metrics/buckets.ts';
import { LongTaskTally } from './collectors/long-task.ts';
import { InteractionTally } from './collectors/interaction.ts';
import { FrameTally } from './collectors/frames.ts';
import { mainInvoker, type LoafFrame } from './collectors/loaf.ts';
import { ViewTotals, type ViewRun } from './collectors/views.ts';
import type { DomBatch } from './collectors/dom.ts';
import { round1 } from './metrics/percentile.ts';
import { diffCounters, zeroCounters, type WorkerCounters, type WorkerSummary } from './telemetry.ts';
import { TRACKS, type TrackSink, type TrackText } from './tracks.ts';

/** A rögzítő — a gyűjtők közös célpontja (27-es doksi 11. fejezet).
 *
 *  TISZTA: nem olvas órát és nem nyúl a DOM-hoz; minden időt paraméterként
 *  kap. Így ugyanez fut a lapon, a kiterjesztés paneljében (visszatöltött
 *  munkamenetnél) és Node-ban a tesztekben.
 *
 *  Kikapcsolva (`recording === false`) minden metódus azonnal visszatér: a
 *  csomagolók a lapon mindig telepítve vannak (`document_start`), de rögzítés
 *  nélkül csak egy logikai vizsgálatba kerülnek. */

export interface ThreadInfo { id: number; kind: 'main' | 'dedicated' | 'shared' | 'service'; url?: string }
export interface SourceRef { url: string; fn?: string; charPos?: number }

/** Ennél rövidebb nézet-futásból nem lesz esemény, csak összesítés: egy
 *  60 fps-es lista minden tickje különben elárasztaná a puffert. A hosszú
 *  képkockához (50 ms fölött) tartozó futás így mindig megmarad. */
export const VIEW_RUN_MIN_MS = 4;
/** Futásonként legfeljebb ennyi nézet-címke kerül eseménybe. */
export const VIEW_TOP = 8;
/** Ennyi változás alatt a DOM-visszahívás csak összesítésbe megy. */
export const DOM_BATCH_MIN = 20;
export const DOM_TOP = 5;

export { cleanUrl, safeLabel } from './privacy.ts';
import { cleanUrl } from './privacy.ts';

export class Recorder {
  recording = false;
  /** DevTools-sávok (15.2). Nincs → nem rajzol. */
  tracks: TrackSink | null = null;
  /** A sávok neve a böngésző nyelvén — az ügynök állítja (tracks.ts). */
  trackText: TrackText = TRACKS;
  /** A lap `timeOrigin`-ja — a worker-szakaszok (epoch) átváltásához. */
  timeOrigin = 0;
  startedAt = 0;
  private seq = 0;

  readonly events = new Ring<PerfEvent>(20_000);
  readonly buckets = new BucketSet();
  readonly longTasks = new LongTaskTally();
  readonly interactions = new InteractionTally();
  readonly frames = new FrameTally();
  readonly threads: ThreadInfo[] = [{ id: 0, kind: 'main' }];
  readonly sources: SourceRef[] = [];
  private sourceIndex = new Map<string, number>();
  private counts = { loafs: 0, wsMessages: 0, wsBytes: 0, workerIn: 0, workerOut: 0 };
  /** Worker-példányonként: az első rögzítés alatti összegzés (a bázis) és a
   *  legutóbbi. A kettő különbsége a PONTOS összesítés. */
  private workers = new Map<string, { thread: number; base: WorkerCounters; last: WorkerCounters }>();
  private app = { storeUpdates: 0, storeMs: 0, renders: 0, deltas: 0, pipelineP50: 0, pipelineP95: 0 };
  /** Honnan jön a nézet-profil (üres: sehonnan — pl. éles build). */
  viewsSource = '';
  readonly views = new ViewTotals();
  private dom = { batches: 0, changes: 0, hosts: new Map<string, number>() };

  start(now: number): void {
    this.workers.clear();
    this.app = { storeUpdates: 0, storeMs: 0, renders: 0, deltas: 0, pipelineP50: 0, pipelineP95: 0 };
    this.seq = 0;
    this.events.clear();
    this.buckets.clear();
    this.longTasks.reset();
    this.interactions.reset();
    this.frames.reset();
    this.views.reset();
    this.dom = { batches: 0, changes: 0, hosts: new Map() };
    this.counts = { loafs: 0, wsMessages: 0, wsBytes: 0, workerIn: 0, workerOut: 0 };
    this.startedAt = now;
    this.recording = true;
  }

  stop(): void { this.recording = false; }

  private emit(e: Omit<PerfEvent, 'seq'>): PerfEvent {
    const ev = { ...e, seq: ++this.seq } as PerfEvent;
    this.events.push(ev);
    return ev;
  }

  private bucket(t: number): Bucket { return this.buckets.at(t); }

  thread(kind: ThreadInfo['kind'], url?: string): number {
    const id = this.threads.length;
    this.threads.push({ id, kind, url: url === undefined ? undefined : cleanUrl(url) });
    return id;
  }

  source(url: string, fn: string, charPos: number): number {
    const clean = cleanUrl(url);
    const key = `${clean}|${fn}|${charPos}`;
    let idx = this.sourceIndex.get(key);
    if (idx === undefined) {
      idx = this.sources.length;
      this.sources.push({ url: clean, fn: fn || undefined, charPos: charPos >= 0 ? charPos : undefined });
      this.sourceIndex.set(key, idx);
    }
    return idx;
  }

  // ── gyűjtő-bemenetek ────────────────────────────────────────────────

  longTask(start: number, dur: number): void {
    if (!this.recording) return;
    this.longTasks.add(dur);
    this.emit({ t: start, src: 'main', kind: 'longtask', dur });
    const b = this.bucket(start); b.longTasks++; b.longTaskMs += dur;
  }

  /** Egy LoAF és a `scripts[]` gyermek-eseményei, `parent` láncolással. */
  loaf(f: LoafFrame): void {
    if (!this.recording) return;
    this.counts.loafs++;
    const parent = this.emit({ t: f.start, src: 'main', kind: 'loaf', dur: f.dur, a: f.blockingMs, b: f.scriptMs, label: mainInvoker(f) });
    parent.id = parent.seq;
    for (const s of f.scripts) {
      this.emit({
        t: s.start, src: 'main', kind: 'script', dur: s.dur, a: s.forcedLayoutMs, b: s.pauseMs,
        label: s.invokerType, parent: parent.id, source: this.source(s.url, s.fn, s.charPos),
      });
    }
    const b = this.bucket(f.start);
    b.loafs++; b.blockingMs += f.blockingMs; b.scriptMs += f.scriptMs; b.renderMs += f.renderMs;
  }

  interaction(name: string, start: number, dur: number, inputDelay: number, interactionId: number): void {
    if (!this.recording) return;
    const first = this.interactions.add(interactionId, dur);
    this.emit({ t: start, src: 'main', kind: 'interaction', dur, a: inputDelay, b: interactionId, label: name });
    const b = this.bucket(start);
    if (first) b.interactions++;
    if (dur > b.worstInteraction) b.worstInteraction = dur;
  }

  frame(now: number, delta: number, hidden = false): void {
    if (!this.recording) return;
    const { dropped, pausedMs } = this.frames.add(delta, hidden);
    const b = this.bucket(now); b.frames++; b.droppedFrames += dropped; b.pausedMs += pausedMs;
    // Csak a RÉST rögzítjük eseményként — képkockánként egy esemény
    // másodpercenként 60 bejegyzéssel árasztaná el a puffert. A szünet nem
    // rés: a böngésző nem is rajzolt (rejtett fül, fojtás, alvó gép).
    if (dropped > 0) this.emit({ t: now - delta, src: 'main', kind: 'frame-gap', dur: delta, a: dropped });
  }

  /** Egy nézet-futás (adapters/angular): mindig az összesítésbe; eseménybe
   *  csak a `VIEW_RUN_MIN_MS` fölötti, a legdrágább címkéivel láncolva. */
  viewRun(run: ViewRun): void {
    if (!this.recording) return;
    this.views.add(run);
    if (run.dur < VIEW_RUN_MIN_MS) return;
    const top = run.views.slice(0, VIEW_TOP).filter((v) => v.ms >= 0.1);
    const parent = this.emit({ t: run.start, src: 'main', kind: 'view-run', dur: run.dur, a: run.views.reduce((n, v) => n + v.count, 0), label: run.kind });
    parent.id = parent.seq;
    for (const v of top) this.emit({ t: run.start, src: 'main', kind: 'view', dur: v.ms, a: v.count, label: v.label, parent: parent.id });
    if (this.tracks && top[0]) this.tracks.entry(`${run.kind}: ${top[0].label}`, run.start, run.start + run.dur, this.trackText.views, 'secondary');
  }

  /** Egy DOM-visszahívás (collectors/dom.ts): a gazdaelemek szerint. */
  domBatch(d: DomBatch): void {
    if (!this.recording || !d.total) return;
    this.dom.batches++; this.dom.changes += d.total;
    for (const [host, n] of d.hosts) {
      if (this.dom.hosts.has(host) || this.dom.hosts.size < 500) this.dom.hosts.set(host, (this.dom.hosts.get(host) ?? 0) + n);
    }
    if (d.total < DOM_BATCH_MIN) return;
    const parent = this.emit({ t: d.t, src: 'main', kind: 'dom', a: d.total, label: d.hosts[0]?.[0] });
    parent.id = parent.seq;
    for (const [host, n] of d.hosts.slice(0, DOM_TOP)) this.emit({ t: d.t, src: 'main', kind: 'dom-area', a: n, label: host, parent: parent.id });
  }

  wsMessage(t: number, bytes: number, handlerMs: number, label: string): void {
    if (!this.recording) return;
    this.counts.wsMessages++; this.counts.wsBytes += bytes;
    this.emit({ t, src: 'main', kind: 'ws-message', dur: handlerMs, a: bytes, label });
    const b = this.bucket(t); b.wsMessages++; b.wsBytes += bytes; b.wsHandlerMs += handlerMs;
    this.tracks?.entry(`WS ${bytes} B`, t, t + handlerMs, this.trackText.mainWs, 'primary');
  }

  wsLifecycle(t: number, kind: 'ws-open' | 'ws-close'): void {
    if (!this.recording) return;
    this.emit({ t, src: 'main', kind });
  }

  workerIn(t: number, thread: number, handlerMs: number, label: string): void {
    if (!this.recording) return;
    this.counts.workerIn++;
    this.emit({ t, src: 'main', kind: 'worker-msg-in', dur: handlerMs, label, thread });
    const b = this.bucket(t); b.workerIn++; b.workerInMs += handlerMs;
    this.tracks?.entry(label, t, t + handlerMs, this.trackText.mainWorker, 'tertiary');
  }

  workerOut(t: number, thread: number, label: string): void {
    if (!this.recording) return;
    this.counts.workerOut++;
    this.emit({ t, src: 'main', kind: 'worker-msg-out', label, thread });
    this.bucket(t).workerOut++;
  }

  /** A műszerezett worker összegzése (15.5). `pageT` a küldés ideje a lap
   *  óráján (a hívó váltja át `clock.ts`-szel), `thread` a szál-tábla indexe.
   *
   *  Az első összegzés a BÁZIS: az ablaka a rögzítés előtti időt is
   *  tartalmazhatja, ezért a vödrökbe nem kerül. */
  workerSummary(s: WorkerSummary, pageT: number, thread: number): void {
    if (!this.recording) return;
    const w = this.workers.get(s.id);
    if (!w) { this.workers.set(s.id, { thread, base: s.tot, last: s.tot }); return; }
    w.last = s.tot;
    if (this.tracks) {
      // [epochKezdet, hossz, fajta] hármasok; a lap órájára váltva. Múltbeli
      // időpontok (legfeljebb egy telemetria-periódusnyi késéssel) — a sáv
      // a helyükre rajzolja őket.
      for (let i = 0; i + 2 < s.spans.length; i += 3) {
        const start = s.spans[i] - this.timeOrigin, dur = s.spans[i + 1];
        if (s.spans[i + 2] === 1) this.tracks.entry(this.trackText.wsMessage, start, start + dur, this.trackText.wsWorker, 'primary');
        else this.tracks.entry(this.trackText.waiting, start, start + dur, this.trackText.queue, 'warning');
      }
    }
    const b = this.bucket(pageT);
    b.wkWsMessages += s.win.wsMessages; b.wkWsBytes += s.win.wsBytes; b.wkHandlerMs += s.win.handlerMs;
    b.wkParseMs += s.win.parseMs; b.wkOut += s.win.out; b.wkBatches += s.win.batches; b.wkDeltas += s.win.batchDeltas;
    if (s.win.queueMaxMs > b.wkQueueMaxMs) b.wkQueueMaxMs = s.win.queueMaxMs;
    this.emit({ t: pageT, src: s.scope === 'shared' ? 'shared-worker' : 'worker', kind: 'worker-work',
      dur: s.win.handlerMs, a: s.win.wsMessages, b: s.win.batches, label: s.reason, thread });
  }

  /** A worker-oldali PONTOS összesítés: minden worker (utolsó − bázis). */
  workerTotals(): WorkerCounters {
    const sum = zeroCounters();
    for (const w of this.workers.values()) {
      const d = diffCounters(w.last, w.base);
      for (const k of Object.keys(sum) as (keyof WorkerCounters)[]) sum[k] += d[k];
    }
    return sum;
  }

  /** Alkalmazás-oldali ablak (15.5) — az app-tudatos adapter kumulatív
   *  számlálóinak különbségeiből. Adapter nélkül soha nem hívódik. */
  appStats(t: number, d: { storeUpdates: number; storeMs: number; renders: number; deltas: number; pipelineP50: number; pipelineP95: number }): void {
    if (!this.recording) return;
    this.app.storeUpdates += d.storeUpdates; this.app.storeMs += d.storeMs; this.app.renders += d.renders; this.app.deltas += d.deltas;
    this.app.pipelineP50 = d.pipelineP50; this.app.pipelineP95 = d.pipelineP95;
    const b = this.bucket(t);
    b.storeUpdates += d.storeUpdates; b.storeMs += d.storeMs; b.renders += d.renders; b.pipelineP95 = d.pipelineP95;
    if (d.storeUpdates) this.emit({ t, src: 'main', kind: 'store-update', dur: d.storeMs, a: d.storeUpdates, label: 'app' });
  }

  // ── kimenet ──────────────────────────────────────────────────────────

  summary(now: number) {
    const elapsedMs = now - this.startedAt;
    return {
      ...this.longTasks.stats(elapsedMs),
      elapsedMs: Math.round(elapsedMs),
      loafCount: this.counts.loafs,
      inp: round1(this.interactions.inp()),
      interactions: this.interactions.count,
      frames: this.frames.frames,
      droppedFrames: this.frames.dropped,
      pausedMs: Math.round(this.frames.pausedMs),
      wsMessages: this.counts.wsMessages,
      wsBytes: this.counts.wsBytes,
      workerIn: this.counts.workerIn,
      workerOut: this.counts.workerOut,
      eventsDropped: this.events.dropped,
      workers: this.workers.size,
      worker: this.workerTotals(),
      app: { ...this.app, storeMs: round1(this.app.storeMs) },
      views: { source: this.viewsSource, runs: this.views.runs, runMs: round1(this.views.runMs), top: this.views.top(30) },
      dom: {
        batches: this.dom.batches, changes: this.dom.changes,
        top: [...this.dom.hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15) as [string, number][],
      },
    };
  }
}

export type Summary = ReturnType<Recorder['summary']>;
