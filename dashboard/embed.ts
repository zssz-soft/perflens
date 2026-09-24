import type { Bucket } from '../core/metrics/buckets.ts';
import type { PerfEvent } from '../core/event.ts';
import type { Finding } from '../core/rules/finding.ts';
import type { Summary, SourceRef, ThreadInfo } from '../core/recorder.ts';
import { evaluate } from '../core/rules/engine.ts';
import { buildSession } from '../core/session.ts';
import { renderBands, renderFindings, renderViews } from './render.ts';
import { DASHBOARD_CSS } from './style.ts';
import { locale, localeFor, setLocale, t } from '../core/i18n/index.ts';
import { cleanUrl } from '../core/privacy.ts';

/** A dashboard A LAPBA ÁGYAZVA — kiterjesztés nélkül (27-es doksi 15.6).
 *
 *  Miért van: a devtools-panel egy kicsomagolt kiterjesztést kíván, és azt
 *  céges, felügyelt Chrome-ban a policy tilthatja („Fejlesztői mód"). Ez a
 *  nézet csak FORRÁS: a gazda app dev buildjébe kerül, engedély nélkül.
 *
 *  Amit a panelhez képest FELAD, és miért:
 *   - A szabálymotor a panelen fut, nem a mért lapon (12.1, engine.ts). Itt
 *     ezért NEM fut élőben: a „Kiértékelés" indítja, egyszer — vagy a
 *     mentés, ami a `buildSession`-ben amúgy is értékel.
 *   - A rajz maga is főszál-munka a mért lapon (19.10). Ezért csukva
 *     semmit nem tesz: nincs időzítő, nincs rajz. Csak nyitva ketyeg, 1 Hz.
 *
 *  Amit MEGTART: ugyanazok a sávok, ugyanaz a rajzoló (`render.ts`), és
 *  ugyanaz a munkamenet-JSON (`perflens/1`) — tehát a panel be tudja
 *  tölteni, és a `perflens-diff` regresszió-kapunak is jó.
 *
 *  A gazda laphoz nem nyúl: shadow DOM-ban él (a CSS nem szivárog se be, se
 *  ki), és az ügynököt a NYILVÁNOS globálisán át olvassa. Importtal nem
 *  hivatkozik az `agent/`-re — a határőr ezt tiltja is (4.1/5b). */

/** Amit az ügynökből használunk (`window.__perfLens`). Szándékosan itt
 *  deklarált alak, nem import: a dashboard nem függhet a gazdától. */
interface AgentApi {
  version: string;
  appAware: boolean;
  start(): void;
  stop(): Summary;
  snapshot(): Summary;
  buckets(): Bucket[];
  events(sinceSeq?: number): PerfEvent[];
  threads(): ThreadInfo[];
  sources(): SourceRef[];
}

export interface EmbedHandle {
  /** Kinyitja (és élőre teszi, ha `live`). */
  open(): void;
  /** Összecsukja — ezzel minden időzítő megszűnik. */
  collapse(): void;
  /** Egy kiértékelés + rajz, most. */
  refresh(): void;
  /** Munkamenet-JSON letöltése (`perflens/1`). */
  save(): void;
  /** Leszedi a DOM-ról, és leállít mindent. */
  destroy(): void;
}

export interface EmbedOptions {
  /** Ide teszi a keretet; alapból a `document.body`. */
  parent?: HTMLElement;
  /** Nyitva induljon-e. Alapból NEM: a mérést ne zavarja, aki csak
   *  betöltötte. */
  open?: boolean;
  /** A mentett munkamenet címkéje (fájlnév). */
  label?: string;
}

const PERIOD_MS = 1000;

/** @returns `null`, ha nincs ügynök a lapon (ilyenkor egy rövid üzenetet
 *  ír a konzolra — a lap DOM-ját nem szemeteli tele). */
export function mountPerfLens(opts: EmbedOptions = {}): EmbedHandle | null {
  const found = (window as unknown as { __perfLens?: AgentApi }).__perfLens;
  setLocale(localeFor(navigator.language));
  const tx = () => t().embed;
  if (!found) {
    console.warn(`[PerfLens] ${tx().noAgent}`);
    return null;
  }
  // Külön, nem opcionális kötés: a `save()` függvénydeklaráció hívható lenne
  // a szűkítés előtt is, ezért a `found` narrowingja oda nem ér el.
  const api: AgentApi = found;

  // ── keret ────────────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.dataset.perflens = 'embed';
  // A gazda lap stílusa ne érje el, és a miénk se szivárogjon ki.
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = DASHBOARD_CSS;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const panel = el('div', 'pl-panel pl-collapsed');
  panel.lang = locale();
  const head = el('div', 'pl-head');
  const dot = el('span', 'pl-dot');
  const meta = el('div', 'pl-meta', 'PerfLens');
  const btnEval = el('button', undefined, tx().evaluate);
  const btnLive = el('button', undefined, tx().live);
  const btnSave = el('button', undefined, t().panel.static.save);
  const btnFold = el('button', undefined, tx().expand);
  const btnClose = el('button', undefined, '×');
  btnClose.title = tx().close;
  head.append(dot, el('strong', undefined, 'PerfLens'), meta, btnEval, btnLive, btnSave, btnFold, btnClose);

  const body = el('div', 'pl-body');
  const note = el('p', 'pl-note', tx().cost);
  const bands = el('div');
  const findingsH = el('h2', 'pl-h', t().panel.static.findingsHeading);
  const findingsBox = el('div');
  const viewsH = el('h2', 'pl-h', t().panel.static.viewsHeading);
  const viewsBox = el('div');
  const raw = el('details', 'pl-raw');
  raw.append(el('summary', undefined, t().panel.static.rawCounters));
  const countersBox = el('div');
  raw.append(countersBox);
  body.append(note, bands, findingsH, findingsBox, viewsH, viewsBox, raw);

  panel.append(head, body);
  root.append(style, panel);
  (opts.parent ?? document.body).append(host);

  // ── állapot ──────────────────────────────────────────────────────────
  let collapsed = true;
  let live = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let findings: Finding[] = [];
  let marker: number | undefined;
  /** Futott-e már kiértékelés. Nem a `findings.length` dönt: egy lefutott,
   *  NULLA leletet adó kiértékelés más, mint a „még meg sem néztük". */
  let evaluated = false;
  let lastEvents = 0;
  const openFindings = new Set<string>();

  function draw(withRules: boolean): void {
    const summary = api.snapshot();
    const buckets = api.buckets();
    // Élő rajzhoz az ESEMÉNYEKET nem kérjük le: a teljes tömb másolása
    // másodpercenként a mért lap költsége lenne (19.10), és a sávokhoz,
    // a nézetekhez és a számlálókhoz nem is kell. A szabálymotor és a
    // mentés kéri — ott a költség arányos, és nem folyamatos.
    if (withRules) {
      const events = api.events();
      lastEvents = events.length;
      findings = evaluate({ buckets, events, sources: api.sources() });
      evaluated = true;
    }
    meta.textContent = `${cleanUrl(location.href)} · ${Math.round(summary.elapsedMs / 1000)} s`
      + `${lastEvents ? ` · ${t().panel.events(lastEvents)}` : ''}${live ? '' : ` · ${tx().paused}`}`;
    renderBands(bands, buckets, marker, findings);
    const t0 = buckets[0]?.t0 ?? 0;
    findingsH.textContent = t().panel.findings(findings.length);
    if (!evaluated) findingsBox.replaceChildren(el('p', 'empty', tx().rulesIdle));
    else renderFindings(findingsBox, findings, t0, (f) => { marker = f.t; renderBands(bands, buckets, marker, findings); }, openFindings);
    renderViews(viewsBox, summary);
    renderCounters(summary);
  }

  function renderCounters(s: Summary): void {
    const rows: [string, number][] = [
      ['longTaskCount', s.longTaskCount], ['longTaskMaxMs', s.longTaskMaxMs], ['mainThreadBusyPct', s.mainThreadBusyPct],
      ['loafCount', s.loafCount], ['inp', s.inp], ['interactions', s.interactions],
      ['frames', s.frames], ['droppedFrames', s.droppedFrames], ['pausedMs', s.pausedMs],
      ['wsMessages', s.wsMessages], ['wsBytes', s.wsBytes], ['workerIn', s.workerIn], ['workerOut', s.workerOut],
      ['workers', s.workers], ['worker.wsMessages', s.worker.wsMessages], ['worker.batches', s.worker.batches],
      ['app.storeUpdates', s.app.storeUpdates], ['app.pipelineP95', s.app.pipelineP95],
      ['eventsDropped', s.eventsDropped],
    ];
    const table = el('table', 'pl-counters');
    for (const [k, val] of rows) {
      const tr = el('tr');
      const a = el('td', undefined, k);
      const b = el('td', 'v', String(val));
      tr.append(a, b); table.append(tr);
    }
    countersBox.replaceChildren(table);
  }

  /** Csukva NINCS időzítő: a mért lapon a nem látható dashboard ne kerüljön
   *  semmibe (19.10). */
  function retime(): void {
    clearInterval(timer);
    timer = undefined;
    if (!collapsed && live) timer = setInterval(() => draw(false), PERIOD_MS);
  }

  const setFold = (next: boolean) => {
    collapsed = next;
    panel.classList.toggle('pl-collapsed', collapsed);
    btnFold.textContent = collapsed ? tx().expand : tx().collapse;
    if (!collapsed) draw(false);
    retime();
  };
  const setLive = (next: boolean) => {
    live = next;
    panel.classList.toggle('pl-live', live);
    btnLive.textContent = live ? tx().pause : tx().live;
    if (live && collapsed) { setFold(false); return; }   // a setFold rajzol és időzít is
    retime();
    if (!collapsed) draw(false);
  };

  btnFold.addEventListener('click', () => setFold(!collapsed));
  btnLive.addEventListener('click', () => setLive(!live));
  btnEval.addEventListener('click', () => { if (collapsed) setFold(false); draw(true); });
  btnSave.addEventListener('click', () => save());
  btnClose.addEventListener('click', () => destroy());

  function save(): void {
    const v = { summary: api.snapshot(), buckets: api.buckets(), events: api.events(), sources: api.sources() };
    // A `buildSession` maga értékel (12.1: a mentés pillanatában) — a
    // visszatöltő ugyanazt kapja, mint a panelből mentett munkamenet.
    const session = buildSession({
      label: opts.label,
      context: {
        url: cleanUrl(location.href), userAgent: navigator.userAgent,
        viewport: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio,
        mode: api.appAware ? 'app-aware' : 'generic', agentVersion: api.version,
      },
      summary: v.summary, buckets: v.buckets, events: v.events,
      threads: api.threads(), sources: v.sources,
    });
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(session)], { type: 'application/json' }));
    a.href = url;
    a.download = `${session.label}.json`;
    a.click();
    // A visszavonás NEM lehet szinkron a click után: a böngésző ilyenkor még
    // nem kezdte el olvasni a blobot, és a letöltés megszakadhat.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function destroy(): void {
    clearInterval(timer);
    timer = undefined;
    host.remove();
  }

  if (opts.open) setFold(false);

  return {
    open: () => setFold(false),
    collapse: () => setFold(true),
    refresh: () => draw(true),
    save,
    destroy,
  };
}
