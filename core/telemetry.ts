/** A worker → lap telemetria alakja (27-es doksi 8.3).
 *
 *  NEM az alkalmazás portján megy, hanem egy külön
 *  `BroadcastChannel('perflens')`-en: az app üzenet-kontraktusához nem érünk.
 *
 *  A worker KUMULATÍV számlálókat küld (`tot`, a worker indulása óta) és az
 *  előző küldés óta eltelt ablakot (`win`). A vödrökhöz az ablak kell, a
 *  pontos összesítéshez a kumulatív: két `flush`-válasz különbsége
 *  milliszekundumra illeszthető a lap mérési ablakához — a másodperces
 *  ütemmel ez nem menne. */

export const CHANNEL = 'perflens';

/** Amit az ADAPTER mond egy kimenő worker-üzenetről (8.3). A mag nem tudja,
 *  mi az a köteg — a `describeOutbound` fordítja le neki; `null` válasz azt
 *  jelenti: ez az üzenet nem köteg, csak az `out`-ba számolódik.
 *
 *  Azért ITT él és nem az adapterben, mert a `worker/hooks.ts` generic kód: a
 *  csomagolóknak a KONTRAKTUS kell, nem az alkalmazás-tudás (4.1). */
export interface OutboundInfo { entries: number; deltas: number; queueMs: number }

export interface WorkerCounters {
  wsMessages: number; wsBytes: number;
  /** A WS `onmessage` kezelő ideje: parse + patch + sorba állítás. */
  handlerMs: number;
  parseMs: number; parses: number;
  /** A főszál felé küldött üzenetek — minden porton külön számolva. */
  out: number;
  /** Ezt a négyet az ADAPTER tölti (`OutboundInfo`): kimenő kötegek, a
   *  bennük lévő bejegyzések és összevont delták, és a köteg-várakozás
   *  (legkorábbi érkezés → küldés). Adapter nélkül mind nulla marad. */
  batches: number; batchEntries: number; batchDeltas: number; queueMs: number;
}

export interface WorkerSummary {
  v: 1;
  type: 'perflens:worker';
  /** A worker-példány azonosítója — induláskor sorsolva. */
  id: string;
  url: string;
  scope: 'shared' | 'dedicated';
  /** A küldés ideje, EPOCH ms (a lap `clock.ts`-szel váltja át). */
  t: number;
  reason: 'tick' | 'flush';
  tot: WorkerCounters;
  win: WorkerCounters & { handlerMaxMs: number; queueMaxMs: number };
  /** DevTools-sávhoz (15.2): [epochKezdet, hossz, fajta] hármasok;
   *  fajta 1 = WS-kezelő, 2 = köteg-várakozás. Korlátos. */
  spans: number[];
  spansDropped: number;
}

export type FlushRequest = { v: 1; type: 'perflens:flush' };

export const zeroCounters = (): WorkerCounters => ({
  wsMessages: 0, wsBytes: 0, handlerMs: 0, parseMs: 0, parses: 0, out: 0,
  batches: 0, batchEntries: 0, batchDeltas: 0, queueMs: 0,
});

export function diffCounters(a: WorkerCounters, b: WorkerCounters): WorkerCounters {
  const out = zeroCounters();
  for (const k of Object.keys(out) as (keyof WorkerCounters)[]) out[k] = a[k] - b[k];
  return out;
}
