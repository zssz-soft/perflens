import { validReport, type RelayHello } from '../core/report.ts';

/** ISOLATED world továbbító (27-es doksi 5.1). A lap nem látja a JS-
 *  környezetét; itt van `chrome.runtime`, a MAIN worldben nincs.
 *
 *  Feladata: bejelentkezni az ügynöknél (csak ekkor kezd jelenteni — relay
 *  nélkül az ügynök nem küld semmit), ellenőrizni a jelentést, és ütemkorláttal
 *  továbbadni a háttérnek. */

const MAX_PER_SEC = 5;
/** A kiterjesztés újratöltése után a MÁR INJEKTÁLT relay árván marad: a
 *  `chrome.runtime` érvénytelen, és minden jelentés hibát dobna a LAP
 *  konzoljára, másodpercenként. Ilyenkor csendben leállunk — az új
 *  regisztráció a lap következő betöltésekor lép be. */
let dead = false;
let port: chrome.runtime.Port | null = null;
let windowStart = 0;
let inWindow = 0;
let dropped = 0;

const alive = (): boolean => { try { return !!chrome.runtime?.id; } catch { return false; } };

const connect = () => {
  if (!alive()) { dead = true; return; }
  try {
    port = chrome.runtime.connect({ name: 'relay' });
    port.onDisconnect.addListener(() => { port = null; if (!alive()) dead = true; });
  } catch {
    dead = true;
    port = null;
  }
};

window.addEventListener('message', (e: MessageEvent) => {
  if (dead || e.source !== window) return;
  const data = e.data as { source?: string };
  if (data?.source !== 'perflens-agent') return;
  const now = performance.now();
  if (now - windowStart > 1000) { windowStart = now; inWindow = 0; }
  if (++inWindow > MAX_PER_SEC || !validReport(e.data)) { dropped++; return; }
  if (!port) connect();
  if (!port) return;
  try { port.postMessage({ type: 'report', report: e.data, dropped }); } catch { port = null; if (!alive()) dead = true; }
});

// Bejelentkezés: az ügynök `document_start`-ban fut, ahogy mi is — a
// sorrend nem garantált, ezért párszor megismételjük.
const hello: RelayHello = { v: 1, source: 'perflens-relay', type: 'hello' };
for (const ms of [0, 50, 250, 1000]) setTimeout(() => window.postMessage(hello, location.origin), ms);
