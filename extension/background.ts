import type { AgentReport } from '../core/report.ts';
import type { Bucket } from '../core/metrics/buckets.ts';
import type { PerfEvent } from '../core/event.ts';

/** A kiterjesztés háttere (MV3 service worker) — 27-es doksi 5.1.
 *
 *  1. Engedélyezés: a popup kérésére az adott ORIGINRE (és csak arra)
 *     regisztrálja az ügynököt (MAIN world) és a relayt (ISOLATED),
 *     `document_start`-ra. Nincs `<all_urls>`.
 *  2. Fülenkénti munkamenet-tár: a relay jelentéseit összefésüli, és a
 *     csatlakozott panelnek továbbítja. Új betöltés (új `session`) = új tár.
 *
 *  MV3-ban a service worker elaltatható; a panel ezért a saját másolatát is
 *  tartja (ld. panel.ts), és újracsatlakozáskor a teljes állapotot kéri. */

interface TabState {
  session: string; url: string;
  context: AgentReport['context'] | null;
  summary: AgentReport['summary'] | null;
  buckets: Map<number, Bucket>;
  events: PerfEvent[];
  threads: AgentReport['threads'];
  sources: AgentReport['sources'];
  dropped: number;
}
const MAX_EVENTS = 20_000;
const tabs = new Map<number, TabState>();
const panels = new Map<number, Set<chrome.runtime.Port>>();

const fresh = (session: string, url: string): TabState =>
  ({ session, url, context: null, summary: null, buckets: new Map(), events: [], threads: [], sources: [], dropped: 0 });

function merge(tabId: number, r: AgentReport, dropped: number): TabState {
  let s = tabs.get(tabId);
  if (!s || s.session !== r.session) { s = fresh(r.session, r.url); tabs.set(tabId, s); }
  s.summary = r.summary;
  s.context = r.context;
  for (const b of r.buckets) s.buckets.set(b.t0, b);
  s.events.push(...r.events);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  s.threads = r.threads;
  if (r.sourcesFrom === s.sources.length) s.sources.push(...r.sources);
  s.dropped = dropped;
  return s;
}

const snapshotOf = (s: TabState) => ({
  session: s.session, url: s.url, context: s.context, summary: s.summary, buckets: [...s.buckets.values()].sort((a, b) => a.t0 - b.t0),
  events: s.events, threads: s.threads, sources: s.sources, dropped: s.dropped,
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'relay') {
    const tabId = port.sender?.tab?.id;
    if (tabId === undefined) return;
    port.onMessage.addListener((m: { type: string; report: AgentReport; dropped: number }) => {
      if (m?.type !== 'report') return;
      const before = tabs.get(tabId)?.session;
      const s = merge(tabId, m.report, m.dropped);
      for (const p of panels.get(tabId) ?? []) {
        p.postMessage(before === s.session ? { type: 'report', report: m.report, dropped: m.dropped } : { type: 'state', state: snapshotOf(s) });
      }
    });
  } else if (port.name.startsWith('panel:')) {
    const tabId = Number(port.name.slice(6));
    const set = panels.get(tabId) ?? new Set();
    set.add(port); panels.set(tabId, set);
    const s = tabs.get(tabId);
    port.postMessage({ type: 'state', state: s ? snapshotOf(s) : null });
    port.onDisconnect.addListener(() => set.delete(port));
  }
});
chrome.tabs.onRemoved.addListener((tabId) => { tabs.delete(tabId); panels.delete(tabId); });

// ── engedélyezés originenként ─────────────────────────────────────────

/** Chrome match-mintában a port NEM szerepelhet: a `http://127.0.0.1/*`
 *  minden portra illik. Ezért originből csak séma + hoszt marad. */
export const patternOf = (origin: string) => { const u = new URL(origin); return `${u.protocol}//${u.hostname}/*`; };

async function enabledPatterns(): Promise<string[]> {
  return ((await chrome.storage.local.get('patterns')).patterns as string[] | undefined) ?? [];
}

async function sync(patterns: string[]): Promise<void> {
  await chrome.storage.local.set({ patterns });
  const ids = ['perflens-agent', 'perflens-relay'];
  const existing = (await chrome.scripting.getRegisteredContentScripts({ ids })).map((s) => s.id);
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing });
  if (!patterns.length) return;
  await chrome.scripting.registerContentScripts([
    { id: 'perflens-agent', matches: patterns, js: ['agent.js'], runAt: 'document_start', world: 'MAIN', allFrames: false, persistAcrossSessions: true },
    { id: 'perflens-relay', matches: patterns, js: ['relay.js'], runAt: 'document_start', world: 'ISOLATED', allFrames: false, persistAcrossSessions: true },
  ]);
}

/** A host-engedélyt a popup kéri (ahhoz felhasználói gesztus kell), a
 *  REGISZTRÁCIÓ viszont itt történik — lásd `permissions.onAdded`. */
async function enable(origin: string): Promise<string[]> {
  return enablePattern(patternOf(origin));
}

async function enablePattern(p: string): Promise<string[]> {
  const list = await enabledPatterns();
  if (!list.includes(p)) list.push(p);
  await sync(list);
  return list;
}

/** A Chrome engedély-párbeszéde BEZÁRJA a popupot, és ezzel megöli azt a
 *  JS-környezetet, ami a párbeszéd után regisztrálna: az engedély megvan, a
 *  content scriptek viszont nem kerülnek be, és a panel örökké „várakozás"-t
 *  mutat. Ezért a regisztráció ide, a háttérbe került, az engedély
 *  megadására reagálva — a popup túlélésétől függetlenül lefut.
 *
 *  Az érintett fülek újratöltése is itt van: az ügynöknek az alkalmazás
 *  ELŐTT kell betöltődnie (`document_start`), tehát a már megnyitott lapot
 *  újra kell tölteni. */
chrome.permissions.onAdded.addListener((p) => {
  void (async () => {
    for (const origin of p.origins ?? []) {
      if (!origin.startsWith('http')) continue;
      await enablePattern(origin.endsWith('/*') ? origin : patternOf(origin));
      const host = origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
      for (const t of await chrome.tabs.query({})) {
        try { if (t.id !== undefined && t.url && new URL(t.url).hostname === host) await chrome.tabs.reload(t.id); } catch { /* nem webes lap */ }
      }
    }
  })();
});

chrome.permissions.onRemoved.addListener((p) => {
  void (async () => {
    for (const origin of p.origins ?? []) {
      const pattern = origin.endsWith('/*') ? origin : patternOf(origin);
      await sync((await enabledPatterns()).filter((x) => x !== pattern));
    }
  })();
});
async function disable(origin: string): Promise<string[]> {
  const p = patternOf(origin);
  const list = (await enabledPatterns()).filter((x) => x !== p);
  await sync(list);
  await chrome.permissions.remove({ origins: [p] }).catch(() => {});
  return list;
}

chrome.runtime.onMessage.addListener((m: { type: string; origin: string }, _s, reply) => {
  if (m?.type === 'enable') enable(m.origin).then(reply, (e) => reply({ error: String(e) }));
  else if (m?.type === 'disable') disable(m.origin).then(reply, (e) => reply({ error: String(e) }));
  else if (m?.type === 'status') enabledPatterns().then((l) => reply({ enabled: l.includes(patternOf(m.origin)), patterns: l }));
  else return false;
  return true;
});

// A füstteszt a service workerben hívja — ugyanaz az út, mint a popupé.
(globalThis as unknown as { perflens: unknown }).perflens = { enable, disable, enabledPatterns };
