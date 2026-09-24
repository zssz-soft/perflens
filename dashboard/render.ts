import type { Bucket } from '../core/metrics/buckets.ts';
import type { Finding } from '../core/rules/finding.ts';
import type { Summary } from '../core/recorder.ts';
import { FRAMEWORK, componentOf } from '../core/collectors/views.ts';
import { BANDS, type Band } from './bands.ts';
import { t, withUnit, type Messages } from '../core/i18n/index.ts';

/** A dashboard rajza (27-es doksi 15.6). Könyvtár nélkül, SVG-vel.
 *
 *  BIZTONSÁG: minden szöveg `textContent`-tel kerül ki — a jelentés a mért
 *  lapból jön, és a lap szövege soha nem lesz HTML (core/report.ts). Nincs
 *  `innerHTML` ebben a fájlban. */

const SVG = 'http://www.w3.org/2000/svg';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const svg = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** Legfeljebb ennyi másodpercet mutat a sáv (a legfrissebbeket)… */
export const WINDOW_S = 120;
/** …de legalább ennyit: egy friss, néhány másodperces munkamenet ne a
 *  szélesség tizedén zsúfolódjon (a 120 s-os fix tengelyen így tett). */
export const MIN_SPAN_S = 30;

export function renderBands(host: HTMLElement, buckets: readonly Bucket[], marker?: number, findings: readonly Finding[] = []): void {
  const shown = buckets.slice(-WINDOW_S);
  const t0 = shown[0]?.t0 ?? 0;
  const span = Math.max(MIN_SPAN_S, shown.length ? (shown[shown.length - 1].t0 - t0) / 1000 + 1 : 0);
  const W = 600, H = 34;
  const barW = W / span;
  host.replaceChildren(...BANDS.map((band) => renderBand(band, shown, t0, W, H, barW, marker, findings)));
}

/** A küszöb fölötti oszlop szintje. Ha a sávhoz szabály tartozik, a vödör
 *  másodpercét átfedő leletei döntenek: csak tájékoztató lelet → `info`
 *  (narancs — pl. kiesett képkocka főszál-bizonyíték nélkül: nem a JS
 *  blokkolt); figyelmeztető vagy kritikus → `alarm` (piros). Szabály nélkül,
 *  vagy ha még nincs lelet, a küszöb átlépése piros, mint eddig. */
function levelOf(band: Band, b: Bucket, findings: readonly Finding[]): 'info' | 'alarm' {
  if (!band.ruleId) return 'alarm';
  const hits = findings.filter((f) => f.ruleId === band.ruleId && f.t < b.t0 + 1000 && f.t + f.windowMs >= b.t0);
  if (!hits.length) return 'alarm';
  return hits.every((f) => f.severity === 'info') ? 'info' : 'alarm';
}

function renderBand(band: Band, shown: readonly Bucket[], t0: number, W: number, H: number, barW: number, marker?: number, findings: readonly Finding[] = []): HTMLElement {
  const values = shown.map((b) => band.value(b));
  const max = Math.max(1, ...values.map((v) => (band.limit ? Math.max(v, 0) : v)), ...shown.map((b) => (band.limit ? band.limit(b) * 1.25 : 0)));
  const last = shown.length > 1 ? values[values.length - 2] : values[values.length - 1] ?? 0;   // az utolsó TELJES másodperc
  const peak = values.length ? Math.max(...values) : 0;
  const tx = t();
  const text = tx.bands[band.id];
  const peakText = tx.dashboard.peak(withUnit(peak, text.unit));

  const row = el('div', 'band');
  row.dataset.band = band.id;
  const head = el('div', 'band-head');
  head.append(bandTitle(text), el('span', 'band-q', text.question));
  const nums = el('div', 'band-nums');
  const cur = el('span', 'band-cur', `${last}`); cur.dataset.current = String(last);
  const pk = el('span', 'band-peak', peakText); pk.dataset.peak = String(peak);
  nums.append(cur, el('span', 'band-unit', text.unit), pk);

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'band-chart', role: 'img', 'aria-label': `${text.title}: ${peakText}` });
  shown.forEach((b, i) => {
    const v = values[i];
    if (v <= 0) return;
    const h = Math.max(1.5, (v / max) * (H - 2));
    const over = band.limit ? v > band.limit(b) : false;
    const level = over ? levelOf(band, b, findings) : null;
    const r = svg('rect', { x: ((b.t0 - t0) / 1000) * barW, y: H - h, width: Math.max(1, barW - 1), height: h, class: level === 'info' ? 'bar info' : level ? 'bar over' : 'bar' });
    const tip = svg('title', {});
    tip.textContent = `${Math.round((b.t0 - t0) / 1000)} s: ${withUnit(v, text.unit)}${level === 'info' ? ` — ${tx.dashboard.barInfo}` : ''}`;
    r.append(tip);
    chart.append(r);
  });
  if (band.limit && shown.length) {
    const y = H - (band.limit(shown[shown.length - 1]) / max) * (H - 2);
    if (y > 0 && y < H) chart.append(svg('line', { x1: 0, x2: W, y1: y, y2: y, class: 'limit' }));
  }
  if (marker !== undefined && marker >= t0) {
    const x = ((marker - t0) / 1000) * barW;
    chart.append(svg('line', { x1: x, x2: x, y1: 0, y2: H, class: 'marker' }));
  }
  row.append(head, nums, chart);
  return row;
}

/** A sáv címe az info-ikonnal. A súgó CSS-buborék (hover és billentyűzet-
 *  fókusz), nem `title`: az késve és tördeletlenül jelenne meg. */
function bandTitle(text: Messages['bands'][Band['id']]): HTMLElement {
  const tx = t().dashboard;
  const title = el('span', 'band-title', text.title);
  const icon = el('span', 'band-info', 'i');
  icon.tabIndex = 0;
  icon.setAttribute('aria-label', tx.whatIsIt(text.title));
  const help = el('span', 'band-tip');
  help.setAttribute('role', 'tooltip');
  for (const p of text.info.split('\n')) help.append(el('span', '', p));
  help.append(el('span', 'band-tip-foot', tx.tipFoot));
  icon.append(help);
  title.append(icon);
  return title;
}

/** Az `open` a lenyitott leletek azonosítói. Az élő panel 200 ms-onként
 *  újrarajzol; enélkül minden lenyitott lelet azonnal visszacsukódott, és a
 *  lánc olvashatatlan volt. A hívó tartja meg rajzolások között. */
export function renderFindings(host: HTMLElement, findings: readonly Finding[], t0: number, onPick: (f: Finding) => void, open: Set<string> = new Set()): void {
  const tx = t().dashboard;
  if (!findings.length) { host.replaceChildren(el('p', 'empty', tx.noFindings)); return; }
  host.replaceChildren(...findings.map((f) => {
    const card = el('details', `finding ${f.severity}`);
    card.dataset.rule = f.ruleId;
    card.open = open.has(f.id);
    const sum = el('summary');
    sum.append(el('span', 'sev', tx.severity[f.severity]), el('span', 'ftitle', f.title), el('span', 'ftime', `${((f.t - t0) / 1000).toFixed(1)} s`));
    // Szinkronban, a kattintásnál (a `toggle` esemény aszinkron: egy közbeeső
    // újrarajzolás visszanyitotta volna az épp becsukott leletet). A billentyű
    // (Enter, Space) is `click`-et küld a summary-n.
    sum.addEventListener('click', () => { if (card.open) open.delete(f.id); else open.add(f.id); onPick(f); });
    card.append(sum);
    const body = el('div', 'fbody');
    if (f.steps.length) {
      const chain = el('ol', 'chain');
      for (const s of f.steps) { const li = el('li', `step ${s.layer}`, s.text); li.title = tx.layer(s.layer); chain.append(li); }
      body.append(chain);
    }
    const facts = el('table', 'facts');
    for (const [k, v] of Object.entries(f.facts)) { const tr = el('tr'); tr.append(el('td', '', k), el('td', 'v', String(v))); facts.append(tr); }
    body.append(facts);
    if (f.hypothesis) body.append(el('p', 'hyp', tx.cause[f.hypothesis.confidence](f.hypothesis.text)));
    body.append(el('p', 'hint', `► ${f.hint}`));
    card.append(body);
    return card;
  }));
}

/** A nézet-összesítés: komponensenként a saját idő (Angular-profil) és
 *  területenként a DOM-változás. A régebbi munkamenetben nincs ilyen mező. */
export function renderViews(host: HTMLElement, summary: Partial<Pick<Summary, 'views' | 'dom'>>): void {
  const tx = t().dashboard.views;
  const out: HTMLElement[] = [];
  const views = summary.views;
  if (views?.top.length) {
    const comps = new Map<string, { ms: number; checks: number; part: [string, number] | null }>();
    for (const v of views.top) {
      if (v.label === FRAMEWORK) continue;
      const name = componentOf(v.label);
      let c = comps.get(name);
      if (!c) comps.set(name, (c = { ms: 0, checks: 0, part: null }));
      c.ms += v.ms;
      if (v.label === name) c.checks += v.count;
      else if (!c.part || v.ms > c.part[1]) c.part = [v.label.slice(name.length + 1), v.ms];
    }
    out.push(el('p', 'views-cap', tx.components(views.runs, views.runMs)));
    // Futás van, de minden idő a keretrendszeré: a horog települt, a
    // komponens-események viszont nem jönnek (más Angular-verzió).
    if (!comps.size) out.push(el('p', 'views-cap', tx.noComponents));
    else out.push(table([tx.cols.component, tx.cols.ms, tx.cols.checks, tx.cols.part],
      [...comps.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12)
        .map(([name, c]) => [name, Math.round(c.ms * 10) / 10, c.checks, c.part ? `${c.part[0]} (${Math.round(c.part[1] * 10) / 10} ms)` : ''])));
  } else if (summary.dom) {
    out.push(el('p', 'views-cap', tx.noProfile));
  }
  if (summary.dom?.top.length) {
    out.push(el('p', 'views-cap', tx.dom(summary.dom.changes)));
    out.push(table([tx.domCols.area, tx.domCols.changes], summary.dom.top.slice(0, 10)));
  }
  host.replaceChildren(...(out.length ? out : [el('p', 'empty', tx.empty)]));
}

function table(head: string[], rows: (string | number)[][]): HTMLElement {
  const tb = el('table', 'views');
  const tr = el('tr');
  for (const h of head) tr.append(el('th', '', h));
  tb.append(tr);
  for (const r of rows) {
    const row = el('tr');
    r.forEach((v, i) => row.append(el('td', typeof v === 'number' && i > 0 ? 'v' : '', String(v))));
    tb.append(row);
  }
  return tb;
}
