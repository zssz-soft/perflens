import { observe } from './observer.ts';

/** Long Animation Frames — a gerinc (27-es doksi 6.1).
 *
 *  A `longtask` csak egy hosszt ad; a LoAF képkockára bont (script, render,
 *  kényszerített elrendezés), és a `scripts[]`-ben megmondja, MELYIK
 *  forrásfájl melyik függvénye indította, és mi hívta. A `scripts[]`-t
 *  NEM dobjuk el (17.4/1): minden eleme külön `script` esemény lesz.
 *
 *  A beolvasás TISZTA (`readLoaf`) — Node-ban kitalált bejegyzéssel
 *  tesztelhető; a böngésző-típus (`PerformanceLongAnimationFrameTiming`)
 *  helyett saját, szűk alakot olvasunk, hogy a lib.dom verziójától se
 *  függjünk. */

export interface LoafScript {
  start: number;
  dur: number;
  /** Mi hívta: pl. `TimerHandler:setTimeout`, `MessagePort.onmessage`. */
  invoker: string;
  /** `user-callback` | `event-listener` | `resolve-promise` | `classic-script` | … */
  invokerType: string;
  url: string;
  fn: string;
  charPos: number;
  forcedLayoutMs: number;
  pauseMs: number;
}

export interface LoafFrame {
  start: number;
  dur: number;
  blockingMs: number;
  scriptMs: number;
  /** A render-szakasz: `renderStart`-tól a képkocka végéig (0, ha nem volt). */
  renderMs: number;
  scripts: LoafScript[];
}

interface RawScript {
  startTime?: number; duration?: number; invoker?: string; invokerType?: string;
  sourceURL?: string; sourceFunctionName?: string; sourceCharPosition?: number;
  forcedStyleAndLayoutDuration?: number; pauseDuration?: number;
}
interface RawLoaf { startTime: number; duration: number; blockingDuration?: number; renderStart?: number; scripts?: RawScript[] }

export function readLoaf(e: RawLoaf): LoafFrame {
  const scripts: LoafScript[] = (e.scripts ?? []).map((s) => ({
    start: s.startTime ?? e.startTime,
    dur: s.duration ?? 0,
    invoker: s.invoker ?? '',
    invokerType: s.invokerType ?? '',
    url: s.sourceURL ?? '',
    fn: s.sourceFunctionName ?? '',
    charPos: s.sourceCharPosition ?? -1,
    forcedLayoutMs: s.forcedStyleAndLayoutDuration ?? 0,
    pauseMs: s.pauseDuration ?? 0,
  }));
  const end = e.startTime + e.duration;
  return {
    start: e.startTime,
    dur: e.duration,
    blockingMs: e.blockingDuration ?? 0,
    scriptMs: scripts.reduce((sum, s) => sum + s.dur, 0),
    renderMs: e.renderStart && e.renderStart > 0 ? Math.max(0, end - e.renderStart) : 0,
    scripts,
  };
}

/** A képkocka fő kiváltója: a leghosszabb script invokere. */
export function mainInvoker(f: LoafFrame): string {
  let best: LoafScript | undefined;
  for (const s of f.scripts) if (!best || s.dur > best.dur) best = s;
  return best?.invoker ?? '';
}

export function watchLoaf(onFrame: (f: LoafFrame) => void): () => void {
  return observe('long-animation-frame', (e) => onFrame(readLoaf(e as unknown as RawLoaf)), { buffered: false });
}
