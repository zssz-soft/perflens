import type { RuleContext } from './context.ts';
import type { Finding, Severity } from './finding.ts';
import { t } from '../i18n/index.ts';

/** A kezdeti szabálykészlet — a DETEKTOROK (27-es doksi 12.2).
 *
 *  Egy detektor csak a gyanús ablakot találja meg, és létrehozza a leletet a
 *  tényekkel. A magyarázó lépéseket a gazdagítók fűzik hozzá (enrich.ts).
 *
 *  Minden küszöb egy helyen, névvel — a doksi indokolja őket. */

export const LIMITS = {
  longTaskMs: 50,
  busyPct: 50, busyWindowS: 5,
  interactionWarnMs: 100, interactionCriticalMs: 200,
  inputDelayMs: 50,
  workerPerSec: 60, workerBurstCount: 20, workerBurstWindowMs: 100,
  wsBurstFactor: 3, wsBurstMin: 10, wsBurstHistoryS: 10, wsBurstAfterMs: 200,
  interactionFollowMs: 100,
  /** Ennyi kiesett képkockától már figyelmeztetés, alatta tájékoztatás. */
  droppedFramesWarn: 3,
  pipelineP95Ms: 100,
} as const;

export interface Rule {
  id: string;
  /** Belső név (doksi, hibakeresés) — a felületen nem jelenik meg, ezért nem
   *  fordítjuk. A lelet szövegei a szótárból jönnek (core/i18n). */
  title: string;
  /** Rátaszabály: az egymást követő másodpercek leleteit a motor EGY
   *  leletté vonja össze (engine.ts). Egyedi eseményre (task, interakció)
   *  nem — azoknak saját láncuk van. */
  merge?: boolean;
  detect(ctx: RuleContext): Finding[];
}

const f = (ruleId: string, severity: Severity, t: number, windowMs: number, title: string,
  facts: Finding['facts'], hint: string, hypothesis?: Finding['hypothesis']): Finding =>
  ({ id: `${ruleId}@${Math.round(t)}`, ruleId, severity, t, windowMs, title, facts, hint, steps: [], hypothesis });

const round1 = (n: number) => Math.round(n * 10) / 10;

export const RULES: Rule[] = [
  {
    // A spec eredeti feltétele („blockingDuration > 50 ms") pontatlan volt: a
    // blockingDuration az 50 ms FÖLÖTTI rész, vagyis az 100 ms-os taskot
    // jelentett volna. A definíció a longtaské: > 50 ms.
    id: 'long-task', title: 'Hosszú feladat',
    detect: (ctx) => {
      const m = t().rules.longTask;
      return ctx.events.filter((e) => e.kind === 'longtask' && (e.dur ?? 0) > LIMITS.longTaskMs).map((e) =>
        f('long-task', 'warn', e.t, e.dur!, m.title(round1(e.dur!)),
          { [m.facts.duration]: round1(e.dur!), [m.facts.blocking]: round1(e.dur! - 50) }, m.hint));
    },
  },
  {
    id: 'main-thread-busy', title: 'Túlterhelt főszál', merge: true,
    detect: (ctx) => {
      const out: Finding[] = [];
      const b = ctx.buckets;
      for (let i = LIMITS.busyWindowS - 1; i < b.length; i++) {
        const win = b.slice(i - LIMITS.busyWindowS + 1, i + 1);
        const pct = win.reduce((s, x) => s + x.longTaskMs, 0) / (LIMITS.busyWindowS * 10);
        const prev = out[out.length - 1];
        if (pct > LIMITS.busyPct && (!prev || win[0].t0 >= prev.t + prev.windowMs)) {
          const m = t().rules.busy;
          out.push(f('main-thread-busy', 'warn', win[0].t0, LIMITS.busyWindowS * 1000, m.title(round1(pct), LIMITS.busyWindowS),
            { [m.facts.pct]: round1(pct), [m.facts.longTasks]: win.reduce((s, x) => s + x.longTasks, 0) }, m.hint));
        }
      }
      return out;
    },
  },
  {
    id: 'slow-interaction', title: 'Lassú interakció',
    detect: (ctx) => {
      const worst = new Map<number, { t: number; dur: number; name: string }>();
      for (const e of ctx.events) if (e.kind === 'interaction' && e.b !== undefined) {
        const w = worst.get(e.b);
        if (!w || (e.dur ?? 0) > w.dur) worst.set(e.b, { t: e.t, dur: e.dur ?? 0, name: e.label ?? '' });
      }
      const m = t().rules.slowInteraction;
      return [...worst.values()].filter((w) => w.dur > LIMITS.interactionWarnMs).map((w) =>
        f('slow-interaction', w.dur > LIMITS.interactionCriticalMs ? 'critical' : 'warn', w.t, w.dur,
          m.title(w.name, round1(w.dur)), { [m.facts.latency]: round1(w.dur), [m.facts.event]: w.name }, m.hint));
    },
  },
  {
    id: 'input-delay', title: 'Bemeneti késés',
    detect: (ctx) => {
      const m = t().rules.inputDelay;
      return ctx.events.filter((e) => e.kind === 'interaction' && (e.a ?? 0) > LIMITS.inputDelayMs).map((e) =>
        f('input-delay', 'warn', e.t, e.a!, m.title(round1(e.a!)), { [m.facts.delay]: round1(e.a!), [m.facts.event]: e.label ?? '' }, m.hint));
    },
  },
  {
    id: 'worker-msg-burst', title: 'Worker-üzenetcsúcs', merge: true,
    detect: (ctx) => {
      const out: Finding[] = [];
      const m = t().rules.workerBurst;
      const msgs = ctx.events.filter((e) => e.kind === 'worker-msg-in');
      let lastEnd = -Infinity;
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].t < lastEnd) continue;
        const win = ctx.range('worker-msg-in', msgs[i].t, msgs[i].t + LIMITS.workerBurstWindowMs);
        if (win.length > LIMITS.workerBurstCount) {
          out.push(f('worker-msg-burst', 'warn', msgs[i].t, LIMITS.workerBurstWindowMs, m.title(win.length, LIMITS.workerBurstWindowMs),
            { [m.facts.messages]: win.length, [m.facts.mainMs]: round1(win.reduce((s, e) => s + (e.dur ?? 0), 0)) }, m.hint));
          lastEnd = msgs[i].t + LIMITS.workerBurstWindowMs;
        }
      }
      for (const b of ctx.buckets) if (b.workerIn > LIMITS.workerPerSec && !out.some((x) => x.t >= b.t0 && x.t < b.t0 + 1000)) {
        out.push(f('worker-msg-burst', 'warn', b.t0, 1000, m.rateTitle(b.workerIn), { [m.rateFacts.rate]: b.workerIn }, m.rateHint));
      }
      return out;
    },
  },
  {
    id: 'store-churn', title: 'Fölösleges store-írás', merge: true,
    detect: (ctx) => {
      const m = t().rules.storeChurn;
      return ctx.buckets.filter((b) => b.frames > 0 && b.storeUpdates > b.frames).map((b) =>
        f('store-churn', 'warn', b.t0, 1000, m.title(b.storeUpdates, b.frames),
          { [m.facts.writes]: b.storeUpdates, [m.facts.frames]: b.frames }, m.hint,
          { text: m.hypothesis, confidence: 'possible' }));
    },
  },
  {
    id: 'ws-burst-blocks', title: 'WS-csúcs után blokkolás',
    detect: (ctx) => {
      const out: Finding[] = [];
      const b = ctx.buckets;
      const ws = (x: typeof b[number]) => x.wsMessages + x.wkWsMessages;
      for (let i = 1; i < b.length; i++) {
        const hist = b.slice(Math.max(0, i - LIMITS.wsBurstHistoryS), i);
        const avg = hist.reduce((s, x) => s + ws(x), 0) / hist.length;
        const n = ws(b[i]);
        if (n < LIMITS.wsBurstMin || n <= LIMITS.wsBurstFactor * avg) continue;
        // Másodperces felbontás: a worker-telemetria vödrökben jön. A csúcs
        // másodperce és az utána következő 200 ms.
        const tasks = ctx.range('longtask', b[i].t0, b[i].t0 + 1000 + LIMITS.wsBurstAfterMs);
        if (!tasks.length) continue;
        const worst = tasks.reduce((m, e) => ((e.dur ?? 0) > (m.dur ?? 0) ? e : m));
        const m = t().rules.wsBurst;
        out.push(f('ws-burst-blocks', 'critical', worst.t, worst.dur ?? 0, m.title(n, round1(worst.dur ?? 0)),
          { [m.facts.peak]: n, [m.facts.average]: round1(avg), [m.facts.task]: round1(worst.dur ?? 0) }, m.hint,
          { text: m.hypothesis, confidence: 'probable' }));
      }
      return out;
    },
  },
  {
    id: 'interaction-then-work', title: 'Interakció után drága munka',
    detect: (ctx) => {
      const seen = new Set<number>();
      const out: Finding[] = [];
      for (const e of ctx.events) {
        if (e.kind !== 'interaction' || e.b === undefined || seen.has(e.b)) continue;
        seen.add(e.b);
        const tasks = ctx.range('longtask', e.t, e.t + (e.dur ?? 0) + LIMITS.interactionFollowMs);
        if (!tasks.length) continue;
        const worst = tasks.reduce((m, x) => ((x.dur ?? 0) > (m.dur ?? 0) ? x : m));
        const m = t().rules.interactionThenWork;
        out.push(f('interaction-then-work', 'critical', e.t, (e.dur ?? 0) + LIMITS.interactionFollowMs,
          m.title(e.label ?? m.unnamed, round1(worst.dur ?? 0)),
          { [m.facts.interaction]: round1(e.dur ?? 0), [m.facts.task]: round1(worst.dur ?? 0) }, m.hint,
          { text: m.hypothesis, confidence: 'probable' }));
      }
      return out;
    },
  },
  {
    // „Miért esett ki egy képkocka?" — a dashboard eddig csak a piros
    // oszlopot mutatta, magyarázat nélkül. A LoAF csak az 50 ms fölötti
    // képkockát jelenti, egy kimaradt képkocka (≈33 ms 60 Hz-en) tehát
    // NEM hagy főszál-nyomot. Ez önmagában is válasz: nem a JS blokkolt.
    id: 'dropped-frames', title: 'Kiesett képkocka', merge: true,
    detect: (ctx) => ctx.events.filter((e) => e.kind === 'frame-gap' && (e.a ?? 0) >= 1).map((e) => {
      const dropped = e.a ?? 0;
      const gap = e.dur ?? 0;
      const tasks = ctx.range('longtask', e.t - 16, e.t + gap + 16);
      const worst = tasks.length ? tasks.reduce((m, x) => ((x.dur ?? 0) > (m.dur ?? 0) ? x : m)) : null;
      const severity: Severity = worst || dropped >= LIMITS.droppedFramesWarn ? 'warn' : 'info';
      const m = t().rules.droppedFrames;
      return f('dropped-frames', severity, e.t, gap, m.title(dropped, round1(gap)),
        { [m.facts.dropped]: dropped, [m.facts.gap]: round1(gap), [m.facts.evidence]: worst ? m.evidenceTask(round1(worst.dur ?? 0)) : m.evidenceNone },
        worst ? m.hintTask : m.hintNone,
        worst ? undefined : { text: m.hypothesis, confidence: 'possible' });
    }),
  },
  {
    // Az adapter p95-je a mérés kezdete ÓTA kumulált — ablakos p95-öt
    // kívülről nem kapunk (27-es doksi 7.3). A szabály ezért egyszer szól,
    // az első másodpercnél, ahol a kumulált érték átlépi a küszöböt.
    id: 'pipeline-slow', title: 'Lassú csővezeték',
    detect: (ctx) => {
      const b = ctx.buckets.find((x) => x.pipelineP95 > LIMITS.pipelineP95Ms);
      const m = t().rules.pipelineSlow;
      return b ? [f('pipeline-slow', 'warn', b.t0, 1000, m.title(b.pipelineP95), { [m.facts.p95]: b.pipelineP95 }, m.hint)] : [];
    },
  },
];
