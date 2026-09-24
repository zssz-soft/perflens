/** Óratartományok (27-es doksi 11.1, 17.4/5).
 *
 *  Minden PerfEvent `t` mezője a LAP óráján van (`performance.now()` skála,
 *  ms). A többi kontextus más órán jár, és ide kell átváltani:
 *    - `worker-epoch`: a worker `performance.timeOrigin + performance.now()`
 *      bélyege — ahogy a `ws.worker.ts` ma is küldi az `arrivedAt`-ot;
 *    - `trace`: a CDP trace és a CPU-profil µs-os, monoton órája (17. fejezet,
 *      az MVP-ben még nem használt).
 *
 *  A függvények TISZTÁK: az órát paraméterként kapják, nem maguk olvassák —
 *  így tesztelhetők, és ugyanaz a kód fut lapon, workerben és Node-ban. */

export type ClockDomain = 'page' | 'worker-epoch' | 'trace';

/** Egy tartomány és a lap órája közti eltolás, a munkamenetbe írva. */
export interface ClockSync {
  domain: Exclude<ClockDomain, 'page'>;
  thread?: number;
  offsetMs: number;
}

/** Ennél régebbi bélyeget nem fogadunk el — a `perf-harness.toPageClock`
 *  ugyanezt a korlátot használja, a két műszer így ugyanúgy dönt. */
export const MAX_AGE_MS = 5000;

/** Ennyivel „a jövőbe" mutató bélyeg még NEM hiba: a worker és a lap
 *  `timeOrigin`-ja kontextusonként külön számítódik (a SharedWorker a
 *  Chrome-ban külön folyamatban is futhat). Mérve (15.5, Chromium 151): a
 *  worker órája medián 0–0,15 ms-mal jár előrébb, a körút-aszimmetriával
 *  együtt legfeljebb ~4 ms. Egy gyorsan kézbesített üzenet bélyege így
 *  tört milliszekundummal a jövőben lehet — ez az órák eltérése, nem
 *  hibás adat. */
export const FUTURE_TOLERANCE_MS = 5;

/** Worker-epoch → lap-óra.
 *
 *  Ugyanaz a képlet és ugyanaz a védőkorlát, mint a `perf-harness.ts`
 *  `toPageClock()`-jában: egy hibás vagy hiányzó bélyegből NEGATÍV latencia
 *  lenne, ezért inkább a mostra esünk vissza, mint hogy csendben szépítsük a
 *  számot. A `clamped` jelzi, ha ez történt — a harness ezt nem mondja meg,
 *  a PerfLens igen (a panel kiírja, hány bélyeget kellett visszavágni). */
export function epochToPage(epochMs: number | undefined, timeOrigin: number, now: number): { t: number; clamped: boolean } {
  if (epochMs === undefined) return { t: now, clamped: false };
  const t = epochMs - timeOrigin;
  // A számérték minden esetben ugyanaz, mint a harnessé (a jövő → most);
  // csak a JELZÉS különbözik: a tűrésen belüli órakülönbség nem hiba.
  if (t > now) return { t: now, clamped: t > now + FUTURE_TOLERANCE_MS };
  if (t < now - MAX_AGE_MS) return { t: now, clamped: true };
  return { t, clamped: false };
}

/** Lap-óra → epoch — a worker felé küldött bélyegekhez. */
export function pageToEpoch(pageMs: number, timeOrigin: number): number {
  return timeOrigin + pageMs;
}
