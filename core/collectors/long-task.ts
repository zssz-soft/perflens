import { observe } from './observer.ts';
import { maxOf, round1 } from '../metrics/percentile.ts';

/** Hosszú feladatok (27-es doksi 6. fejezet).
 *
 *  A 15.1-ben még csak a `longtask` bejegyzés — pontosan azt, amit a
 *  harness is néz, hogy a drift-őr egy az egyben összevethesse. A LoAF
 *  (`long-animation-frame`) a 15.3-ban jön ide.
 *
 *  A számolás TISZTA (`LongTaskTally`), az observer-bekötés külön — így a
 *  számolás Node-ban tesztelhető. */

export class LongTaskTally {
  private durations: number[] = [];
  private total = 0;

  add(durationMs: number): void {
    this.durations.push(durationMs);
    this.total += durationMs;
  }

  /** A harness `longTaskCount`, `longTaskMaxMs` és `mainThreadBusyPct`
   *  mezőinek definíciója szerint: a foglaltság a hosszú feladatok
   *  összideje az eltelt időhöz képest, `max(1, eltelt)`-tel védve. */
  stats(elapsedMs: number): { longTaskCount: number; longTaskMaxMs: number; mainThreadBusyPct: number } {
    return {
      longTaskCount: this.durations.length,
      longTaskMaxMs: this.durations.length ? round1(maxOf(this.durations)) : 0,
      mainThreadBusyPct: round1((this.total / Math.max(1, elapsedMs)) * 100),
    };
  }

  reset(): void {
    this.durations = [];
    this.total = 0;
  }
}

/** Bekötés a böngészőben. NEM bufferelt: csak az ablakban keletkező
 *  bejegyzés számít — ugyanúgy, mint a harness `start()`-jában. */
export function watchLongTasks(onTask: (startTime: number, durationMs: number) => void): () => void {
  return observe('longtask', (e) => onTask(e.startTime, e.duration), { buffered: false });
}
