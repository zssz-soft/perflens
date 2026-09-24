import { Recorder } from '../core/recorder.ts';
import { watchLongTasks } from '../core/collectors/long-task.ts';
import { watchLoaf } from '../core/collectors/loaf.ts';
import { watchInteractions } from '../core/collectors/interaction.ts';
import { watchFrames } from '../core/collectors/frames.ts';
import { watchDom } from '../core/collectors/dom.ts';
import { installMessagingHooks } from '../core/collectors/messaging.ts';
import { epochToPage } from '../core/clock.ts';
import { CHANNEL, type WorkerSummary } from '../core/telemetry.ts';
import { watchAngularViews } from '../adapters/angular/profiler.ts';
import { devtoolsSink, TRACK_TEXT } from '../core/tracks.ts';
import { localeFor } from '../core/i18n/locale.ts';
import { cleanUrl } from '../core/privacy.ts';
import { MAX_BUCKETS_PER_REPORT, MAX_EVENTS_PER_REPORT, type AgentReport } from '../core/report.ts';

/** A PerfLens ügynök — a lapba injektálva fut (27-es doksi 5.1).
 *
 *  Ez a modul ALKALMAZÁS-FÜGGETLEN: a magon és az Angular-adapteren kívül
 *  semmit nem importál, és **nincs mellékhatása** — a telepítést a belépési
 *  pont hívja (`agent/index.ts`; app-tudatos módhoz egy saját belépési pont,
 *  ami `installAgent({ app })`-pel adja át az adapterét).
 *  Ez a határ engedi meg, hogy az ügynök a mag mellett kivágható legyen
 *  (4.1), és ezt a `perflens-boundary` gépileg ellenőrzi is.
 *
 *  Két életszakasz:
 *   - BETÖLTÉSKOR (`document_start`) telepíti a worker- és WS-csomagolókat.
 *     Ennek az alkalmazás ELŐTT kell megtörténnie; rögzítés nélkül a
 *     csomagolók csak egy logikai vizsgálatba kerülnek.
 *   - RÖGZÍTÉSKOR (`start()`) köti be az observereket és a rAF-hurkot. A
 *     betöltéskor azonnal indul: a lapba csak az kerül, aki mérni akar.
 *
 *  A műszerezett worker (15.5) telemetriáját a `perflens` BroadcastChannelen
 *  hallgatja — ha nincs ilyen worker, a csatorna néma, és nem történik
 *  semmi. A `?perflens=on` az app-tudatos módot is bekapcsolja — de csak
 *  akkor, ha a belépési pont adott adaptert (`opts.app`).
 *
 *  Kétszeri injektálás ellen védett. */

export const AGENT_VERSION = '0.6.0';

/** Az app-tudatos adapter alakja (7.3). A mag felé egyetlen dolga van:
 *  `PerfEvent`-eket termel a `Recorder`-be. A `read()` azonnal olvas — a
 *  `stop()` ELŐTT kell, különben az utolsó töredék-másodperc kimarad. */
export type AppAdapter = (rec: Recorder, now: () => number) => { stop: () => void; read: () => void };

export interface AgentOptions {
  /** App-tudatos adapter. CSAK `?perflens=on` mellett hívjuk (7.3): a
   *  `start()`-ja lenullázza a gazda harnesst, és ez egy kézi méréssel
   *  ütközne. Nélküle az ügynök generic módban fut, és a `mode` is azt
   *  mondja — a `?perflens=on` egymagában nem tesz app-tudatossá. */
  app?: AppAdapter;
}

const w = window as unknown as { __perfLens?: unknown };

export function installAgent(opts: AgentOptions = {}): void {
  if (w.__perfLens) return;
  const rec = new Recorder();
  const now = () => performance.now();
  // DevTools-sávok: alapból mennek — rögzítés nélkül 0,14 µs/hívás (19.3).
  // `?perflens=notracks` kikapcsolja.
  if (new URLSearchParams(location.search).get('perflens') !== 'notracks') rec.tracks = devtoolsSink();
  rec.trackText = TRACK_TEXT[localeFor(navigator.language)];   // a sávnevek a böngésző nyelvén
  rec.timeOrigin = performance.timeOrigin;
  installMessagingHooks(rec, now);
  // App-tudatos mód: a kapcsoló ÉS az adapter is kell hozzá. Adapter nélkül
  // (generic build, idegen oldal) a `?perflens=on` nem hazudik app-tudatost.
  const appAware = new URLSearchParams(location.search).get('perflens') === 'on' && !!opts.app;

  // ── worker-telemetria ──────────────────────────────────────────────
  const bc = new BroadcastChannel(CHANNEL);
  const threadByWorker = new Map<string, number>();
  const flushWaiters: (() => void)[] = [];
  let clampedStamps = 0;
  bc.onmessage = (e: MessageEvent) => {
    const s = e.data as WorkerSummary;
    if (s?.type !== 'perflens:worker' || s.v !== 1) return;
    let thread = threadByWorker.get(s.id);
    if (thread === undefined) {
      // A lap-oldali hook már felvette ezt a workert a konstruktornál —
      // ugyanaz az URL, ugyanaz a szál. Ha nem (pl. később injektáltunk),
      // új bejegyzés.
      thread = rec.threads.find((t) => t.url === s.url && t.kind === s.scope)?.id ?? rec.thread(s.scope, s.url);
      threadByWorker.set(s.id, thread);
    }
    const { t, clamped } = epochToPage(s.t, performance.timeOrigin, now());
    if (clamped) clampedStamps++;
    rec.workerSummary(s, t, thread);
    if (s.reason === 'flush') flushWaiters.splice(0).forEach((r) => r());
  };
  const requestFlush = () => bc.postMessage({ v: 1, type: 'perflens:flush' });

  let stops: (() => void)[] = [];
  let app: ReturnType<AppAdapter> | null = null;
  const disconnect = () => { for (const s of stops) s(); stops = []; app?.stop(); app = null; };

  const api = {
    version: AGENT_VERSION,
    appAware,
    start() {
      disconnect();
      rec.start(now());
      stops = [
        watchLongTasks((start, dur) => rec.longTask(start, dur)),
        watchLoaf((f) => rec.loaf(f)),
        watchInteractions((e) => rec.interaction(e.name, e.start, e.dur, e.inputDelay, e.interactionId)),
        watchFrames((t, d, hidden) => rec.frame(t, d, hidden)),
        // Nézet-réteg: a DOM-területek mindig; a komponens-profil csak ott,
        // ahol az Angular fejlesztői módban fut (élesben nem települ).
        watchDom((b) => rec.domBatch(b), now),
        watchAngularViews(rec, now),
      ];
      if (appAware) app = opts.app!(rec, now);
      requestFlush();                     // a worker bázisa ehhez a pillanathoz
    },
    /** Friss worker-összegzést kér, és megvárja (legfeljebb 500 ms) — a
     *  pontos összesítéshez a `stop()` előtt. */
    flush(): Promise<void> {
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, 500);
        flushWaiters.push(() => { clearTimeout(timer); resolve(); });
        requestFlush();
      });
    },
    snapshot: () => ({ ...rec.summary(now()), clampedStamps }),
    stop() {
      app?.read();                        // az utolsó töredék-másodperc is
      const m = { ...rec.summary(now()), clampedStamps };
      rec.stop();
      disconnect();
      return m;
    },
    buckets: () => rec.buckets.list(),
    events: (sinceSeq = 0) => rec.events.toArray().filter((e) => e.seq > sinceSeq),
    threads: () => rec.threads.slice(),
    sources: () => rec.sources.slice(),
  };
  w.__perfLens = api;
  api.start();

  // ── jelentés a kiterjesztésnek (15.4) ────────────────────────────────
  // Csak akkor, ha egy relay bejelentkezett: Playwrightból vagy kiterjesztés
  // nélkül az ügynök SEMMIT nem küld — nulla költség.
  const session = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
  let reporting = false;
  let lastSeq = 0;
  let sourcesSent = 0;
  /** Ennyi másodperc vödrei mennek újra minden jelentésben. A bejegyzések
   *  KÉSVE is érkezhetnek egy már elküldött vödörbe: az Event Timing a
   *  következő festés után, a LoAF a képkocka végén, a worker-telemetria
   *  egy periódussal később. Csak a legutóbbi vödröt küldeni (az első
   *  változat így tett) a késő bejegyzést elveszítette — a dashboardon egy
   *  208 ms-os interakció 0 ms-os sávként látszott. */
  const RESEND_S = 6;
  const report = () => {
    const events = rec.events.toArray().filter((e) => e.seq > lastSeq).slice(-MAX_EVENTS_PER_REPORT);
    if (events.length) lastSeq = events[events.length - 1].seq;
    const since = Math.floor(now() / 1000) * 1000 - (RESEND_S - 1) * 1000;
    const buckets = rec.buckets.list().filter((b) => b.t0 >= since).slice(-MAX_BUCKETS_PER_REPORT);
    const sources = rec.sources.slice(sourcesSent);
    const msg: AgentReport = {
      v: 1, source: 'perflens-agent', type: 'report', session, url: cleanUrl(location.href),
      context: {
        url: cleanUrl(location.href), userAgent: navigator.userAgent, viewport: `${innerWidth}x${innerHeight}`,
        dpr: devicePixelRatio, mode: appAware ? 'app-aware' : 'generic', agentVersion: AGENT_VERSION,
      },
      summary: api.snapshot(), buckets, events, threads: rec.threads.slice(), sources, sourcesFrom: sourcesSent,
    };
    sourcesSent += sources.length;
    window.postMessage(msg, location.origin);
  };
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { source?: string; type?: string };
    if (e.source !== window || d?.source !== 'perflens-relay' || d.type !== 'hello' || reporting) return;
    reporting = true;
    report();
    setInterval(report, 1000);
  });
}
