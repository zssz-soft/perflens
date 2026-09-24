import type { PerfLensSession } from './session.ts';
import { t, type Messages } from './i18n/index.ts';

/** Két munkamenet összevetése és regresszió-kapu (27-es doksi 15.8 — a
 *  feladat 8. célja). A `tools/measurement/compare.mts` mintájára: metrikánként
 *  küszöb, és ahol lehet, UGYANAZ a szám, mint a mérési naplóé — de a
 *  munkamenet-séma más (11.4), ezért nem ugyanaz a kód.
 *
 *  Két szabály, ami nélkül a különbség nem a kódról szólna:
 *   1. A darabszámokat percre vetítve kapuzzuk — két eltérő hosszú munkamenet
 *      nyers darabszáma félrevezet.
 *   2. A WS-üzenetráta BEMENET, nem teljesítmény: ha a két munkamenet
 *      terhelése eltér, azt kimondjuk (`comparability`), mint a compare.mts
 *      `isComparable`-je. */

export interface MetricDef {
  key: string;
  /** Felirat; ha nincs, a szótárból (`diff.metrics[key]`). */
  label?: string;
  /** A mértékegység kulcsa a szótárban (`units`) — a felirat nyelvenként más. */
  unit: keyof Messages['units'];
  /** Mennyit romolhat, mielőtt a kapu piros (a rosszabbik irányba). */
  limit: { abs?: number; pct?: number };
  /** Kijelzéshez: a nyers érték mellé (pl. darab mellé a perces ráta). */
  raw?: (s: PerfLensSession) => number | null;
  get(s: PerfLensSession): number | null;
}

const perMin = (n: number, s: PerfLensSession) => (s.durationMs > 0 ? n / (s.durationMs / 60_000) : 0);
const perSec = (n: number, s: PerfLensSession) => (s.durationMs > 0 ? n / (s.durationMs / 1000) : 0);
const appAware = (s: PerfLensSession) => s.context.mode === 'app-aware';
const r1 = (n: number) => Math.round(n * 10) / 10;

export const METRICS: MetricDef[] = [
  { key: 'worstTask', unit: 'ms', limit: { abs: 20 }, get: (s) => s.summary.longTaskMaxMs },
  { key: 'longTasks', unit: 'perMin', limit: { abs: 3 }, raw: (s) => s.summary.longTaskCount, get: (s) => r1(perMin(s.summary.longTaskCount, s)) },
  { key: 'busy', unit: 'pct', limit: { abs: 5 }, get: (s) => s.summary.mainThreadBusyPct },
  { key: 'inp', unit: 'ms', limit: { abs: 20 }, get: (s) => (s.summary.interactions ? s.summary.inp : null) },
  { key: 'dropped', unit: 'perMin', limit: { abs: 10 }, raw: (s) => s.summary.droppedFrames, get: (s) => r1(perMin(s.summary.droppedFrames, s)) },
  { key: 'pipelineP95', unit: 'ms', limit: { abs: 15 }, get: (s) => (appAware(s) ? s.summary.app.pipelineP95 : null) },
  { key: 'workerIn', unit: 'perSec', limit: { pct: 20 }, get: (s) => (s.summary.workerIn ? r1(perSec(s.summary.workerIn, s)) : null) },
  { key: 'store', unit: 'perSec', limit: { pct: 20 }, get: (s) => (appAware(s) ? r1(perSec(s.summary.app.storeUpdates, s)) : null) },
  // a 13.3 önköltség-mérésének legstabilabb jele: a csővezeték főszál-költsége
  { key: 'storePerBatch', unit: 'ms', limit: { abs: 0.05, pct: 10 },
    get: (s) => (appAware(s) && s.summary.app.storeUpdates ? Math.round((s.summary.app.storeMs / s.summary.app.storeUpdates) * 1000) / 1000 : null) },
  { key: 'critical', unit: 'count', limit: { abs: 0 }, get: (s) => s.findings.filter((f) => f.severity === 'critical').length },
];

export type Verdict = 'improved' | 'regressed' | 'stable' | 'n/a';
export interface MetricDiff { key: string; label: string; unit: string; base: number | null; next: number | null; baseRaw?: number | null; nextRaw?: number | null; delta: number | null; limit: string; verdict: Verdict }

/** A küszöb: a nagyobbik az abszolút és a relatív közül (0,05 ms vagy 10%). */
function allowed(def: MetricDef, base: number): number {
  const a = def.limit.abs ?? 0, p = def.limit.pct !== undefined ? Math.abs(base) * def.limit.pct / 100 : 0;
  return def.limit.abs !== undefined && def.limit.pct !== undefined ? Math.max(a, p) : def.limit.abs !== undefined ? a : p;
}

export function diffSessions(base: PerfLensSession, next: PerfLensSession, metrics: MetricDef[] = METRICS) {
  const tx = t();
  const rows: MetricDiff[] = metrics.map((m) => {
    const b = m.get(base), n = m.get(next);
    const label = m.label ?? (tx.diff.metrics as Record<string, string>)[m.key] ?? m.key;
    const unit = tx.units[m.unit];
    const absUnit = m.unit === 'pct' ? ` ${tx.diff.percentPoints}` : unit ? ` ${unit}` : '';
    const limit = [m.limit.abs !== undefined ? `+${m.limit.abs}${absUnit}` : '', m.limit.pct !== undefined ? `+${m.limit.pct}%` : ''].filter(Boolean).join(' / ');
    if (b === null || n === null) return { key: m.key, label, unit, base: b, next: n, delta: null, limit, verdict: 'n/a' };
    const delta = Math.round((n - b) * 1000) / 1000;
    const verdict: Verdict = delta > allowed(m, b) ? 'regressed' : delta < -allowed(m, b) ? 'improved' : 'stable';
    return { key: m.key, label, unit, base: b, next: n, baseRaw: m.raw?.(base), nextRaw: m.raw?.(next), delta, limit, verdict };
  });
  return { rows, comparability: comparability(base, next), passed: !rows.some((r) => r.verdict === 'regressed') };
}

/** Mi tesz két munkamenetet NEM közvetlenül összevethetővé — nem tiltja,
 *  csak kimondja (a compare.mts `isComparable`-jének mintájára). */
export function comparability(a: PerfLensSession, b: PerfLensSession): string[] {
  const out: string[] = [];
  const tx = t().diff;
  const path = (u: string) => { try { const x = new URL(u); return x.host + x.pathname; } catch { return u; } };
  if (path(a.context.url) !== path(b.context.url)) out.push(tx.otherPage(path(a.context.url), path(b.context.url)));
  if (a.context.mode !== b.context.mode) out.push(tx.otherMode(a.context.mode, b.context.mode));
  const len = b.durationMs / Math.max(1, a.durationMs);
  if (len < 0.8 || len > 1.25) out.push(tx.otherLength(Math.round(a.durationMs / 1000), Math.round(b.durationMs / 1000)));
  const load = (s: PerfLensSession) => perSec(s.summary.wsMessages + s.summary.worker.wsMessages, s);
  const la = load(a), lb = load(b);
  if (Math.max(la, lb) > 1 && Math.abs(lb - la) / Math.max(la, lb) > 0.2) out.push(tx.otherLoad(r1(la), r1(lb)));
  if (a.context.viewport !== b.context.viewport || a.context.dpr !== b.context.dpr) out.push(tx.otherView(`${a.context.viewport}@${a.context.dpr}`, `${b.context.viewport}@${b.context.dpr}`));
  if (a.context.agentVersion !== b.context.agentVersion) out.push(tx.otherAgent(a.context.agentVersion, b.context.agentVersion));
  return out;
}

/** A kért alakú szöveges jelentés (a feladat 8. pontja). */
export function formatDiff(base: PerfLensSession, next: PerfLensSession, d: ReturnType<typeof diffSessions>): string {
  const tx = t().diff;
  // A darab egysége angolul üres: ott a szám mögött nem maradhat szóköz.
  const u = (v: number, unit: string) => (unit ? `${v}${unit.startsWith('/') ? '' : ' '}${unit}` : String(v));
  const fmt = (v: number | null, raw: number | null | undefined, unit: string) =>
    v === null ? '—' : raw !== undefined && raw !== null ? `${raw} (${u(v, unit)})` : u(v, unit);
  const regressed = d.rows.filter((r) => r.verdict === 'regressed');
  const lines: string[] = [];
  lines.push(`${tx.base}${base.label} — ${base.context.url}, ${Math.round(base.durationMs / 1000)} s, ${base.context.mode}`);
  lines.push(`${tx.next}${next.label} — ${next.context.url}, ${Math.round(next.durationMs / 1000)} s, ${next.context.mode}`);
  for (const w of d.comparability) lines.push(tx.warning(w));
  lines.push('');
  lines.push(regressed.length ? tx.regressed(regressed.length) : tx.noRegression);
  for (const r of regressed) {
    lines.push('', `${r.label}:`, `  ${fmt(r.base, r.baseRaw, r.unit)} → ${fmt(r.next, r.nextRaw, r.unit)}   (${tx.threshold} ${r.limit})`);
  }
  lines.push('', tx.allMetrics);
  const w = Math.max(...d.rows.map((r) => r.label.length));
  for (const r of d.rows) {
    const delta = r.delta === null ? '' : `${r.delta > 0 ? '+' : ''}${r.delta}`;
    lines.push(`  ${r.label.padEnd(w)}  ${fmt(r.base, r.baseRaw, r.unit).padStart(16)} → ${fmt(r.next, r.nextRaw, r.unit).padEnd(16)} ${delta.padStart(8)}  ${tx.verdict[r.verdict]}${r.verdict !== 'n/a' ? `  [${tx.threshold} ${r.limit}]` : ''}`);
  }
  return lines.join('\n');
}
