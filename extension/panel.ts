import type { AgentReport } from '../core/report.ts';
import type { Bucket } from '../core/metrics/buckets.ts';
import type { PerfEvent } from '../core/event.ts';
import type { Finding } from '../core/rules/finding.ts';
import { evaluate } from '../core/rules/engine.ts';
import { buildSession, parseSession, type PerfLensSession, type SessionContext } from '../core/session.ts';
import { renderBands, renderFindings, renderViews } from '../dashboard/render.ts';
import { locale, localeFor, setLocale, t } from '../core/i18n/index.ts';

/** A DevTools-panel — a valós idejű dashboard (27-es doksi 15.6).
 *
 *  Két mód: ÉLŐ (a háttérből jövő jelentések) és VISSZATÖLTÖTT (egy mentett
 *  munkamenet-JSON). A szabálymotor ITT fut, nem a mért lapon (12.1).
 *
 *  Minden szöveg `textContent`-tel kerül ki (dashboard/render.ts). A panel
 *  DevTools nélkül is megnyitható (`panel.html?tab=<id>`) — a füstteszt így
 *  olvassa ki; ugyanezért van egy `window.__panel` tesztfelület. */

const cr = (globalThis as unknown as { chrome?: typeof chrome }).chrome;
const tabId = cr?.devtools?.inspectedWindow?.tabId ?? Number(new URLSearchParams(location.search).get('tab'));
if (cr?.devtools?.panels?.themeName === 'dark' || (!cr?.devtools && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');

// A nyelv a böngészőé: magyar böngészőben magyar, minden másban angol. A
// HTML magyar szövege csak az első pillanatra kell (`data-i18n`).
setLocale(localeFor(navigator.language));
document.documentElement.lang = locale();
const staticText = t().panel.static;
for (const e of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  const key = e.dataset.i18n as keyof typeof staticText;
  if (key in staticText) e.textContent = staticText[key];
}

const MAX_EVENTS = 20_000;
interface State {
  session: string; url: string; context: SessionContext | null;
  summary: AgentReport['summary'] | null;
  buckets: Map<number, Bucket>; events: PerfEvent[];
  threads: AgentReport['threads']; sources: AgentReport['sources']; dropped: number;
}
const empty = (session = '', url = ''): State => ({ session, url, context: null, summary: null, buckets: new Map(), events: [], threads: [], sources: [], dropped: 0 });
let live: State = empty();
let loaded: PerfLensSession | null = null;
let findings: Finding[] = [];
/** Az utolsó szabály-értékelés ideje; -Infinity = még soha. (0-val a frissen
 *  megnyitott panel — ahol a performance.now() még 1000 alatt van — az első
 *  másodpercben egyáltalán nem értékelt: a leletlista üres maradt.) */
let lastEval = -Infinity;
let marker: number | undefined;
/** A lenyitott leletek — az újrarajzolás ne csukja vissza őket. */
const openFindings = new Set<string>();

const $ = (id: string) => document.getElementById(id)!;

// ── rajz ────────────────────────────────────────────────────────────────

let scheduled = false;
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; render(); }, 200);
}

function view() {
  if (loaded) return { summary: loaded.summary, buckets: loaded.buckets, events: loaded.events, sources: loaded.sources, url: loaded.context.url, label: loaded.label, dropped: 0 };
  return { summary: live.summary, buckets: [...live.buckets.values()].sort((a, b) => a.t0 - b.t0), events: live.events, sources: live.sources, url: live.url, label: live.session.slice(0, 8), dropped: live.dropped };
}

function render(): void {
  const v = view();
  if (!v.summary) return;
  const s = v.summary;
  const tx = t().panel;
  $('mode').textContent = loaded ? tx.modeLoaded : tx.modeLive;
  $('mode').className = loaded ? 'mode' : 'mode live';
  $('live').hidden = !loaded;
  $('meta').textContent = `${v.url} · ${v.label} · ${Math.round(s.elapsedMs / 1000)} s · ${tx.events(v.events.length)}${v.dropped ? ` · ${tx.reportsDropped(v.dropped)}` : ''}${s.eventsDropped ? ` · ${tx.eventsDropped(s.eventsDropped)}` : ''}`;

  // A szabálymotor legfeljebb másodpercenként — a panel is főszál.
  if (loaded) findings = loaded.findings;
  else if (performance.now() - lastEval > 1000) { findings = evaluate(v); lastEval = performance.now(); }

  renderBands($('bands'), v.buckets, marker, findings);
  const t0 = v.buckets[0]?.t0 ?? 0;
  $('findings-h').textContent = tx.findings(findings.length);
  renderFindings($('findings'), findings, t0, (f) => { marker = f.t; renderBands($('bands'), v.buckets, marker, findings); }, openFindings);
  renderViews($('views'), s);
  renderCounters(s);
}

function renderCounters(s: import('../core/recorder.ts').Summary & { clampedStamps?: number }): void {
  const rows: [string, number][] = [
    ['longTaskCount', s.longTaskCount], ['longTaskMaxMs', s.longTaskMaxMs], ['mainThreadBusyPct', s.mainThreadBusyPct],
    ['loafCount', s.loafCount], ['inp', s.inp], ['interactions', s.interactions], ['frames', s.frames], ['droppedFrames', s.droppedFrames], [`pausedMs (${t().panel.notPainted})`, s.pausedMs],
    ['wsMessages', s.wsMessages], ['wsBytes', s.wsBytes], ['workerIn', s.workerIn], ['workerOut', s.workerOut],
    ['workers', s.workers], ['worker.wsMessages', s.worker.wsMessages], ['worker.batches', s.worker.batches], ['worker.batchDeltas', s.worker.batchDeltas],
    ['app.storeUpdates', s.app.storeUpdates], ['app.pipelineP95', s.app.pipelineP95],
    ['eventsDropped', s.eventsDropped], ['clampedStamps', s.clampedStamps ?? 0],
  ];
  const table = document.createElement('table'); table.className = 'counters';
  for (const [k, val] of rows) {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = k;
    const b = document.createElement('td'); b.className = 'v'; b.textContent = String(val); b.dataset.key = k;
    tr.append(a, b); table.append(tr);
  }
  $('counters').replaceChildren(table);
}

// ── élő kapcsolat ──────────────────────────────────────────────────────

type StateMsg = { session: string; url: string; summary: AgentReport['summary'] | null; buckets: Bucket[]; events: PerfEvent[]; threads: AgentReport['threads']; sources: AgentReport['sources']; dropped: number; context?: SessionContext };

/** A kiterjesztés újratöltése (chrome://extensions ↻, frissítés) után a MÁR
 *  NYITOTT panel-lap életben marad, de a `chrome.runtime`-ja érvénytelen: minden
 *  hívás „Extension context invalidated"-et dob. Az újracsatlakozási hurok
 *  ilyenkor 500 ms-onként termelte a hibát. Ehelyett abbahagyjuk, és
 *  megmondjuk, mit kell tenni. */
const alive = (): boolean => { try { return !!cr?.runtime?.id; } catch { return false; } };

function detached(): void {
  $('mode').textContent = t().panel.modeDetached;
  $('mode').className = 'mode';
  $('meta').textContent = t().panel.detached;
}

function connect(): void {
  if (!alive()) { detached(); return; }
  let port: chrome.runtime.Port;
  try {
    port = cr!.runtime.connect({ name: `panel:${tabId}` });
  } catch {
    detached();
    return;
  }
  port.onMessage.addListener((m: { type: string; state?: StateMsg | null; report?: AgentReport; dropped?: number }) => {
    if (m.type === 'state' && m.state) {
      live = { ...empty(m.state.session, m.state.url), summary: m.state.summary, events: m.state.events.slice(-MAX_EVENTS), threads: m.state.threads, sources: m.state.sources, dropped: m.state.dropped, context: m.state.context ?? null };
      for (const b of m.state.buckets) live.buckets.set(b.t0, b);
    } else if (m.type === 'report' && m.report) {
      const r = m.report;
      if (live.session !== r.session) live = empty(r.session, r.url);
      live.summary = r.summary; live.context = r.context; live.threads = r.threads; live.dropped = m.dropped ?? 0;
      for (const b of r.buckets) live.buckets.set(b.t0, b);
      live.events.push(...r.events);
      if (live.events.length > MAX_EVENTS) live.events.splice(0, live.events.length - MAX_EVENTS);
      if (r.sourcesFrom === live.sources.length) live.sources.push(...r.sources);
    }
    if (!loaded) schedule();
  });
  // MV3: a háttér elaltatható — újracsatlakozunk, és a teljes állapotot kérjük.
  // De csak amíg a kiterjesztés-kontextus él (lásd `alive`).
  port.onDisconnect.addListener(() => { if (alive()) setTimeout(connect, 500); else detached(); });
}

// ── mentés / betöltés ──────────────────────────────────────────────────

function currentSession(): PerfLensSession | null {
  if (loaded) return loaded;
  if (!live.summary || !live.context) return null;
  return buildSession({
    context: live.context, summary: live.summary, buckets: [...live.buckets.values()].sort((a, b) => a.t0 - b.t0),
    events: live.events, threads: live.threads, sources: live.sources,
  });
}

function load(json: string): void {
  try {
    loaded = parseSession(json);
    marker = undefined;
    $('error').hidden = true;
    render();
  } catch (e) {
    $('error').textContent = t().panel.loadError((e as Error).message);
    $('error').hidden = false;
  }
}

$('save').addEventListener('click', () => {
  const s = currentSession();
  if (!s) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(s)], { type: 'application/json' }));
  a.download = `${s.label}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('load').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) load(await file.text());
});
$('live').addEventListener('click', () => { loaded = null; marker = undefined; render(); });

// A füstteszt felülete: a mentés és a visszatöltés gomb nélkül is elérhető,
// és egy „ujjlenyomat" — ugyanaz a rajz ugyanazt adja.
(window as unknown as { __panel: unknown }).__panel = {
  render: () => { lastEval = -Infinity; render(); },
  session: () => currentSession(),
  load: (json: string) => load(json),
  fingerprint: () => ({
    bands: [...document.querySelectorAll<HTMLElement>('[data-band]')].map((b) => `${b.dataset.band}:${b.querySelector<HTMLElement>('[data-peak]')?.dataset.peak}`),
    findings: [...document.querySelectorAll<HTMLElement>('.finding')].map((f) => `${f.dataset.rule}:${f.querySelector('.ftitle')?.textContent}`),
  }),
};

connect();
