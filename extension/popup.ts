/** A popup: be/ki az aktuális fül ORIGINJÉN (27-es doksi 5.3, 18. fejezet).
 *  A host-engedélyt itt kérjük — `chrome.permissions.request` felhasználói
 *  gesztust kíván, és a böngésző saját párbeszédet mutat. */

import { locale, localeFor, setLocale, t } from '../core/i18n/index.ts';

const $ = (id: string) => document.getElementById(id)!;

// A nyelv a böngészőé, mint a panelen.
setLocale(localeFor(navigator.language));
document.documentElement.lang = locale();
const tx = t().popup;
$('note').textContent = tx.note;

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = '';
  try { origin = new URL(tab?.url ?? '').origin; } catch { /* nem webes lap */ }
  if (!origin.startsWith('http')) { $('origin').textContent = tx.unusable; return; }
  $('origin').textContent = origin;

  const render = async () => {
    const st = await chrome.runtime.sendMessage({ type: 'status', origin }) as { enabled: boolean };
    $('state').textContent = st.enabled ? tx.enabled : tx.disabled;
    const btn = $('toggle') as HTMLButtonElement;
    btn.hidden = false;
    btn.textContent = st.enabled ? tx.disable : tx.enable;
    btn.onclick = async () => {
      if (!st.enabled) {
        const u = new URL(origin);
        const pattern = `${u.protocol}//${u.hostname}/*`;
        // A Chrome párbeszéde BEZÁRHATJA a popupot, és akkor az alábbi sorok
        // már nem futnak le. Ezért a regisztrációt és a lap újratöltését a
        // háttér végzi a `permissions.onAdded`-ben; ez itt csak az az eset,
        // amikor az engedély már megvan (nincs párbeszéd), vagy a popup
        // mégis életben marad.
        const already = await chrome.permissions.contains({ origins: [pattern] });
        const ok = already || await chrome.permissions.request({ origins: [pattern] });
        if (!ok) return;
        await chrome.runtime.sendMessage({ type: 'enable', origin });
        if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
      } else {
        await chrome.runtime.sendMessage({ type: 'disable', origin });
        if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
      }
      render();
    };
  };
  render();
})();
