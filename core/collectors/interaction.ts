import { observe } from './observer.ts';

/** Interakciók és valódi INP (27-es doksi 6. fejezet).
 *
 *  Ugyanaz a definíció, mint a `shared/rum.ts`-ben: az `interactionId` fogja
 *  össze egy interakció eseményeit (pointerdown, pointerup, click), ezekből
 *  a LEGHOSSZABB az interakció ideje, és az INP ezek közül 50-enként egy
 *  kiugrót enged el (a web-vitals szerint; 50 alatt a legrosszabb érték).
 *
 *  NEM a harness „INP-közelítése" (az a legrosszabb esemény, interakciós
 *  csoportosítás nélkül) — a PerfLens a mező-definíciót követi. */
export class InteractionTally {
  private worst = new Map<number, number>();

  /** @returns igaz, ha ez az interakció első eseménye. */
  add(interactionId: number, durationMs: number): boolean {
    const prev = this.worst.get(interactionId);
    if (prev === undefined || durationMs > prev) this.worst.set(interactionId, durationMs);
    return prev === undefined;
  }

  get count(): number { return this.worst.size; }

  inp(): number {
    const sorted = [...this.worst.values()].sort((a, b) => b - a);
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))];
  }

  reset(): void { this.worst.clear(); }
}

export interface InteractionEntry { name: string; start: number; dur: number; inputDelay: number; interactionId: number }

/** Az `event` bejegyzések közül csak az interakcióhoz tartozók (`interactionId`
 *  > 0) — a hover és a scroll nem interakció. A küszöb 16 ms, ennél lejjebb a
 *  böngésző úgysem megy (9. fejezet, 1. csapda). */
export function watchInteractions(onEntry: (e: InteractionEntry) => void): () => void {
  return observe('event', (raw) => {
    const e = raw as PerformanceEntry & { interactionId?: number; processingStart?: number };
    if (!e.interactionId) return;
    onEntry({ name: e.name, start: e.startTime, dur: e.duration, inputDelay: (e.processingStart ?? e.startTime) - e.startTime, interactionId: e.interactionId });
  }, { buffered: false, extra: { durationThreshold: 16 } });
}
