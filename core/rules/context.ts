import type { PerfEvent } from '../event.ts';
import type { Bucket } from '../metrics/buckets.ts';
import type { SourceRef } from '../recorder.ts';

/** Amit egy szabály lát (27-es doksi 12.1). A 17. fejezet rétegei
 *  (`profile`, `trace`) opcionális képességként jönnek majd ide — a
 *  hiányuk a detektorokat nem érinti. */
export interface RuleContext {
  buckets: readonly Bucket[];
  events: readonly PerfEvent[];
  sources: readonly SourceRef[];
  /** Időablakos lekérdezés: [t0, t1) közé eső, adott fajtájú események. */
  range(kind: PerfEvent['kind'], t0: number, t1: number): PerfEvent[];
}

export function makeContext(buckets: readonly Bucket[], events: readonly PerfEvent[], sources: readonly SourceRef[] = []): RuleContext {
  const byKind = new Map<string, PerfEvent[]>();
  for (const e of events) {
    let list = byKind.get(e.kind);
    if (!list) byKind.set(e.kind, (list = []));
    list.push(e);
  }
  for (const list of byKind.values()) list.sort((a, b) => a.t - b.t);
  return {
    buckets, events, sources,
    range(kind, t0, t1) {
      const list = byKind.get(kind) ?? [];
      // bináris keresés az első t ≥ t0 elemre
      let lo = 0, hi = list.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].t < t0) lo = mid + 1; else hi = mid; }
      const out: PerfEvent[] = [];
      for (let i = lo; i < list.length && list[i].t < t1; i++) out.push(list[i]);
      return out;
    },
  };
}
