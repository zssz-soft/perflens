/** Adatvédelmi segédek (27-es doksi 18. fejezet). Külön modul, mert a
 *  worker-csomagolás is használja — a rögzítő többi része nélkül. */

/** Query és fragment le — ott ül a legtöbb véletlen token (cache-buster,
 *  munkamenet-azonosító). */
export function cleanUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

/** Csak rövid, fix alakú címke mehet a pufferbe — tartalom soha. Egy üzenet
 *  `type` mezője akkor lesz címke, ha azonosítónak néz ki. */
export function safeLabel(data: unknown): string {
  if (data && typeof data === 'object' && 'type' in data) {
    const t = (data as { type: unknown }).type;
    if (typeof t === 'string' && /^[\w.:-]{1,32}$/.test(t)) return t;
  }
  return data === null ? 'null' : typeof data;
}
