/** Másodperces vödrök (27-es doksi 11.3).
 *
 *  A dashboard és a szabályok ezeken dolgoznak, nem a nyers folyamon. A
 *  mezők az MVP-ben ténylegesen MÉRHETŐ dolgok: a nem-hosszú taskok száma
 *  például NINCS benne, mert szabvány API-ból nem látszik (csak az 50 ms
 *  fölöttiek). A `wk*` mezők a műszerezett workerből, a store-mezők az
 *  app-tudatos adapterből jönnek — nélkülük nullák. */
export interface Bucket {
  t0: number;
  longTasks: number; longTaskMs: number;
  loafs: number; blockingMs: number; scriptMs: number; renderMs: number;
  frames: number; droppedFrames: number;
  /** Szünet ms-ban: a böngésző nem rajzolt (rejtett/fojtott fül) — nem kiesés. */
  pausedMs: number;
  interactions: number; worstInteraction: number;
  wsMessages: number; wsBytes: number; wsHandlerMs: number;
  workerIn: number; workerInMs: number; workerOut: number;
  // worker-oldal (15.5, B szint — a műszerezett workerből)
  wkWsMessages: number; wkWsBytes: number; wkHandlerMs: number; wkParseMs: number;
  wkOut: number; wkBatches: number; wkDeltas: number; wkQueueMaxMs: number;
  // alkalmazás-oldal (15.5, az app-tudatos adapter felületéről)
  storeUpdates: number; storeMs: number; renders: number;
  /** A WS → render p95 — az adapter szerint a mérés kezdete ÓTA kumulált. */
  pipelineP95: number;
}

const empty = (t0: number): Bucket => ({
  t0, longTasks: 0, longTaskMs: 0, loafs: 0, blockingMs: 0, scriptMs: 0, renderMs: 0,
  frames: 0, droppedFrames: 0, pausedMs: 0, interactions: 0, worstInteraction: 0,
  wsMessages: 0, wsBytes: 0, wsHandlerMs: 0, workerIn: 0, workerInMs: 0, workerOut: 0,
  wkWsMessages: 0, wkWsBytes: 0, wkHandlerMs: 0, wkParseMs: 0, wkOut: 0, wkBatches: 0, wkDeltas: 0, wkQueueMaxMs: 0,
  storeUpdates: 0, storeMs: 0, renders: 0, pipelineP95: 0,
});

/** Legfeljebb `max` másodperc (alapból 1 óra); a legrégebbi esik ki. */
export class BucketSet {
  private map = new Map<number, Bucket>();
  private readonly max: number;

  constructor(max = 3600) { this.max = max; }

  at(t: number): Bucket {
    const t0 = Math.floor(t / 1000) * 1000;
    let b = this.map.get(t0);
    if (!b) {
      b = empty(t0);
      this.map.set(t0, b);
      // A Map beszúrási sorrendben iterál, és az idő csak előre halad:
      // az első kulcs a legrégebbi.
      if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as number);
    }
    return b;
  }

  list(): Bucket[] { return [...this.map.values()].sort((a, b) => a.t0 - b.t0); }
  clear(): void { this.map.clear(); }
}
