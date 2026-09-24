/** A közös PerformanceObserver-csomagolás (27-es doksi 3.3).
 *
 *  A `perf-harness.ts`, a `rum.ts` és az `external-probe.mts` ugyanezt a
 *  mintát használja; ez a negyedik példány, szándékosan (4.2).
 *
 *  Egy különbség a harnesshez képest: az alapértelmezés itt `buffered:
 *  false`. A bufferelt observer a betöltés zaját is visszajátszaná, és a
 *  valós idejű panel az első másodpercben hamis leletet mutatna (9. fejezet,
 *  2. csapda). Aki a betöltést akarja látni, kérje kifejezetten. */

export interface ObserveOptions {
  buffered?: boolean;
  /** Típusfüggő kiegészítés, pl. `{ durationThreshold: 16 }` az `event`-hez. */
  extra?: Record<string, unknown>;
}

/** Feliratkozik egy bejegyzés-típusra; a visszaadott függvény leiratkoztat.
 *  Nem támogatott típusra némán nem csinál semmit — a metrika 0 marad, és a
 *  `supported()` megmondja, miért. */
export function observe(type: string, handler: (entry: PerformanceEntry) => void, opts: ObserveOptions = {}): () => void {
  if (!supported(type)) return () => {};
  try {
    const o = new PerformanceObserver((list) => list.getEntries().forEach(handler));
    o.observe({ type, buffered: opts.buffered ?? false, ...opts.extra } as PerformanceObserverInit);
    return () => o.disconnect();
  } catch {
    return () => {};
  }
}

export function supported(type: string): boolean {
  return typeof PerformanceObserver !== 'undefined'
    && (PerformanceObserver.supportedEntryTypes ?? []).includes(type);
}
