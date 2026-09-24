import type { Recorder } from '../recorder.ts';
import { safeLabel } from '../recorder.ts';

/** Lap-oldali worker- és WebSocket-csomagolás (27-es doksi 8.2, A szint;
 *  8.4).
 *
 *  A `document_start`-ban kell futnia — az alkalmazás előtt —, különben a
 *  `new WebSocket(...)` és a `new SharedWorker(...)` már megtörtént.
 *
 *  KÉT SZABÁLY:
 *   1. Csak a `Worker`/`SharedWorker` konstruktoron át született portot és
 *      workert figyeljük. A sima `MessageChannel` NEM worker-forgalom: sok
 *      ütemező (pl. a Reacté) ezzel ütemez, és azt worker-üzenetnek
 *      számolni hamis képet adna.
 *   2. Tartalom nem kerül a pufferbe: az üzenetből csak egy azonosító-alakú
 *      `type` mező lehet címke (`safeLabel`), a WS-ből csak a méret.
 *
 *  Egy üzenethez EGY esemény tartozik, az első kezelő idejével. Ha egy
 *  üzenetnek több kezelője van, a többié nem látszik — a gyakorlatban egy
 *  van, és a pontosság itt kevesebbet ér, mint a puffer tisztasága. */

type Handler = (this: unknown, ev: MessageEvent) => unknown;

export function installMessagingHooks(rec: Recorder, now: () => number = () => performance.now()): void {
  const g = globalThis as unknown as {
    Worker?: typeof Worker; SharedWorker?: typeof SharedWorker; WebSocket?: typeof WebSocket;
    MessagePort?: typeof MessagePort; __perfLensHooks?: boolean;
  };
  if (g.__perfLensHooks) return;               // kétszeri telepítés ellen
  g.__perfLensHooks = true;

  /** A konstruktornak adott URL relatív is lehet ('ws.worker.js'); a worker
   *  a telemetriában a sajátját abszolútan küldi — így párosíthatók. */
  const absolute = (url: string | URL) => { try { return new URL(String(url), location.href).href; } catch { return String(url); } };

  /** port/worker → szál-azonosító; csak ami a konstruktoron át jött. */
  const threadOf = new WeakMap<object, number>();
  const seen = new WeakSet<Event>();
  const wrapped = new WeakMap<Handler, Handler>();

  const timed = (fn: Handler, onDone: (ev: MessageEvent, t: number, dur: number) => void): Handler => {
    let w = wrapped.get(fn);
    if (w) return w;
    w = function (this: unknown, ev: MessageEvent) {
      if (!rec.recording || seen.has(ev)) return fn.call(this, ev);
      seen.add(ev);
      const t = now();
      try { return fn.call(this, ev); } finally { onDone(ev, t, now() - t); }
    };
    wrapped.set(fn, w);
    return w;
  };

  /** A `proto` `onmessage` tulajdonságát és `addEventListener('message')`-ét
   *  csomagolja — csak azokra a példányokra, amelyekre `accept` igaz. */
  const hookReceiver = (proto: object, accept: (self: object) => boolean, onDone: (self: object, ev: MessageEvent, t: number, dur: number) => void) => {
    const desc = Object.getOwnPropertyDescriptor(proto, 'onmessage');
    if (desc?.set && desc.get) {
      const originals = new WeakMap<Handler, Handler>();
      Object.defineProperty(proto, 'onmessage', {
        configurable: true,
        enumerable: desc.enumerable,
        get(this: object) { const cur = desc.get!.call(this) as Handler | null; return (cur && originals.get(cur)) ?? cur; },
        set(this: object, fn: Handler | null) {
          if (typeof fn !== 'function' || !accept(this)) { desc.set!.call(this, fn); return; }
          const self = this;
          const w = timed(fn, (ev, t, dur) => onDone(self, ev, t, dur));
          originals.set(w, fn);
          desc.set!.call(this, w);
        },
      });
    }
    const add = (proto as EventTarget).addEventListener;
    const remove = (proto as EventTarget).removeEventListener;
    Object.defineProperty(proto, 'addEventListener', {
      configurable: true, writable: true,
      value(this: object, type: string, fn: unknown, opts?: unknown) {
        if (type === 'message' && typeof fn === 'function' && accept(this)) {
          const self = this;
          fn = timed(fn as Handler, (ev, t, dur) => onDone(self, ev, t, dur));
        }
        return add.call(this as EventTarget, type, fn as EventListener, opts as AddEventListenerOptions);
      },
    });
    Object.defineProperty(proto, 'removeEventListener', {
      configurable: true, writable: true,
      value(this: object, type: string, fn: unknown, opts?: unknown) {
        const w = type === 'message' && typeof fn === 'function' ? wrapped.get(fn as Handler) : undefined;
        return remove.call(this as EventTarget, type, (w ?? fn) as EventListener, opts as EventListenerOptions);
      },
    });
  };

  const hookSender = (proto: object) => {
    const post = (proto as MessagePort).postMessage;
    Object.defineProperty(proto, 'postMessage', {
      configurable: true, writable: true,
      value(this: object, msg: unknown, ...rest: unknown[]) {
        const thread = threadOf.get(this);
        if (thread !== undefined && rec.recording) rec.workerOut(now(), thread, safeLabel(msg));
        return (post as (...a: unknown[]) => void).call(this, msg, ...rest);
      },
    });
  };

  // ── Worker / SharedWorker ────────────────────────────────────────────
  if (g.Worker) {
    const Native = g.Worker;
    g.Worker = class extends Native {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        threadOf.set(this, rec.thread('dedicated', absolute(url)));
      }
    };
    hookReceiver(Native.prototype, (self) => threadOf.has(self), (self, ev, t, dur) => rec.workerIn(t, threadOf.get(self)!, dur, safeLabel(ev.data)));
    hookSender(Native.prototype);
  }
  if (g.SharedWorker) {
    const Native = g.SharedWorker;
    g.SharedWorker = class extends Native {
      constructor(url: string | URL, opts?: string | WorkerOptions) {
        super(url, opts);
        threadOf.set(this.port, rec.thread('shared', absolute(url)));
      }
    };
  }
  if (g.MessagePort) {
    hookReceiver(g.MessagePort.prototype, (self) => threadOf.has(self), (self, ev, t, dur) => rec.workerIn(t, threadOf.get(self)!, dur, safeLabel(ev.data)));
    hookSender(g.MessagePort.prototype);
  }

  // ── WebSocket (lap-világ) ────────────────────────────────────────────
  if (g.WebSocket) {
    const proto = g.WebSocket.prototype;
    const bytesOf = (d: unknown) => typeof d === 'string' ? d.length
      : d instanceof ArrayBuffer ? d.byteLength
      : d instanceof Blob ? d.size : 0;
    hookReceiver(proto, () => true, (_, ev, t, dur) => rec.wsMessage(t, bytesOf(ev.data), dur, typeof ev.data === 'string' ? 'text' : 'binary'));
    const Native = g.WebSocket;
    g.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        super.addEventListener('open', () => rec.wsLifecycle(now(), 'ws-open'));
        super.addEventListener('close', () => rec.wsLifecycle(now(), 'ws-close'));
      }
    };
  }
}
