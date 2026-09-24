/** Kerekítés és percentilis — BETŰ SZERINT a `shared/perf-harness.ts`
 *  definíciói szerint (27-es doksi 4.2).
 *
 *  Nem importáljuk onnan (a `perf-lens/` és a `shared/` között nincs import),
 *  hanem újraírjuk — és a drift-őr (`tools/perflens-smoke.mjs`) ugyanabban a
 *  futásban veti össze a két műszer számait. Ha valaki az egyiket
 *  megváltoztatja, a füstteszt szól. */

/** Egy tizedesre — a harness `round`-ja. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Alsó-index percentilis RENDEZETT tömbön — a harness `percentile`-je.
 *  Szándékosan nem interpolál: így a két műszer ugyanazt az elemet adja. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return round1(sorted[idx]);
}

/** Nem spread-alapú max: hosszú futásnál a `Math.max(...arr)` túllépné az
 *  argumentum-limitet (a harness ugyanezért kerüli). */
export const maxOf = (a: readonly number[]): number => a.reduce((m, v) => (v > m ? v : m), -Infinity);
