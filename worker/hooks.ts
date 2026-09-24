import { CHANNEL, zeroCounters, type OutboundInfo, type WorkerCounters, type WorkerSummary } from '../core/telemetry.ts';
import { cleanUrl } from '../core/privacy.ts';

/** Worker-oldali csomagolók (27-es doksi 8.3, B szint).
 *
 *  A workert NEM módosítjuk, hanem becsomagoljuk: ezt a modult a belépési
 *  pont a gazda worker-moduljának ELŐTTE értékeli ki, így a `WebSocket`, a
 *  `JSON.parse` és a `postMessage` már a csomagolt változat, mire a worker
 *  első sora fut.
 *
 *  A forró úton csak számlálás és `performance.now()`-különbség: nincs
 *  allokáció, nincs sorosítás, a payloadba nem írunk. A telemetria
 *  másodpercenként egyszer megy (és kérésre, `flush`). */

export interface WorkerHookOptions {
  describeOutbound?: (msg: unknown, nowEpoch: number) => OutboundInfo | null;
  periodMs?: number;
  /** A DevTools-sávhoz küldött szakaszok felső korlátja küldésenként. */
  maxSpans?: number;
  /** Ennél rövidebb WS-kezelőt nem küldünk szakasznak (a darabszámba
   *  beleszámít). Alapból 0: a kezelő üzenetenként ~0,1 ms, és a sávon épp
   *  ez a ritmus a lényeg — egy 1 ms-os küszöb MINDENT elrejtett (15.2). Az
   *  áradás ellen a `maxSpans` véd. */
  minSpanMs?: number;
}

export function installWorkerHooks(opts: WorkerHookOptions = {}): void {
  const g = self as unknown as Record<string, unknown> & typeof globalThis;
  if (g.__perfLensWorker) return;
  g.__perfLensWorker = true;

  const periodMs = opts.periodMs ?? 1000;
  const maxSpans = opts.maxSpans ?? 300;
  const minSpanMs = opts.minSpanMs ?? 0;
  const epoch = () => performance.timeOrigin + performance.now();
  const id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
  const scope: WorkerSummary['scope'] = typeof (g as { SharedWorkerGlobalScope?: unknown }).SharedWorkerGlobalScope !== 'undefined'
    && self instanceof (g as unknown as { SharedWorkerGlobalScope: typeof EventTarget }).SharedWorkerGlobalScope ? 'shared' : 'dedicated';

  const tot: WorkerCounters = zeroCounters();
  let win = { ...zeroCounters(), handlerMaxMs: 0, queueMaxMs: 0 };
  let spans: number[] = [];
  let spansDropped = 0;
  const span = (start: number, dur: number, kind: 1 | 2) => {
    if (spans.length >= maxSpans * 3) { spansDropped++; return; }
    spans.push(start, dur, kind);
  };
  const add = (k: keyof WorkerCounters, v: number) => { tot[k] += v; win[k] += v; };

  // ── JSON.parse ─────────────────────────────────────────────────────
  const nativeParse = JSON.parse;
  JSON.parse = function parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) {
    const t0 = performance.now();
    try { return nativeParse(text, reviver); } finally { add('parseMs', performance.now() - t0); add('parses', 1); }
  };

  // ── WebSocket ──────────────────────────────────────────────────────
  const NativeWS = g.WebSocket as typeof WebSocket | undefined;
  if (NativeWS) {
    type H = (this: WebSocket, ev: MessageEvent) => unknown;
    const timed = (fn: H): H => function (this: WebSocket, ev: MessageEvent) {
      const start = epoch();
      const t0 = performance.now();
      try { return fn.call(this, ev); } finally {
        const d = performance.now() - t0;
        const data = ev.data as unknown;
        add('wsMessages', 1);
        add('wsBytes', typeof data === 'string' ? data.length : data instanceof ArrayBuffer ? data.byteLength : 0);
        add('handlerMs', d);
        if (d > win.handlerMaxMs) win.handlerMaxMs = d;
        if (d >= minSpanMs) span(start, d, 1);
      }
    };
    g.WebSocket = class extends NativeWS {
      set onmessage(fn: H | null) { super.onmessage = typeof fn === 'function' ? timed(fn) : fn; }
      get onmessage(): H | null { return super.onmessage as H | null; }
      addEventListener(type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions): void {
        if (!fn) return;
        super.addEventListener(type, type === 'message' && typeof fn === 'function' ? timed(fn as H) as EventListener : fn, o);
      }
    };
  }

  // ── a főszál felé menő üzenetek ────────────────────────────────────
  const onOut = (msg: unknown) => {
    add('out', 1);
    const now = epoch();
    const info = opts.describeOutbound?.(msg, now);
    if (!info) return;
    add('batches', 1); add('batchEntries', info.entries); add('batchDeltas', info.deltas); add('queueMs', info.queueMs);
    if (info.queueMs > win.queueMaxMs) win.queueMaxMs = info.queueMs;
    if (info.queueMs > 0) span(now - info.queueMs, info.queueMs, 2);
  };
  const wrapPost = (proto: { postMessage: (...a: unknown[]) => void }) => {
    const post = proto.postMessage;
    proto.postMessage = function (this: unknown, msg: unknown, ...rest: unknown[]) { onOut(msg); return post.call(this, msg, ...rest); };
  };
  if (scope === 'shared') wrapPost(MessagePort.prototype as unknown as { postMessage: (...a: unknown[]) => void });
  else wrapPost(Object.getPrototypeOf(self) as { postMessage: (...a: unknown[]) => void });

  // ── telemetria ─────────────────────────────────────────────────────
  const bc = new BroadcastChannel(CHANNEL);
  const url = cleanUrl(self.location.href);
  const send = (reason: WorkerSummary['reason']) => {
    const msg: WorkerSummary = { v: 1, type: 'perflens:worker', id, url, scope, t: epoch(), reason, tot: { ...tot }, win, spans, spansDropped };
    bc.postMessage(msg);
    win = { ...zeroCounters(), handlerMaxMs: 0, queueMaxMs: 0 };
    spans = [];
    spansDropped = 0;
  };
  bc.onmessage = (e: MessageEvent) => { if ((e.data as { type?: string })?.type === 'perflens:flush') send('flush'); };
  setInterval(() => send('tick'), periodMs);
}
