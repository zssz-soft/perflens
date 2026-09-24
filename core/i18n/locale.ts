/** Nyelvválasztás — külön fájlban, szótár NÉLKÜL: az ügynök a mért lapon
 *  fut, és csak ezt kéri (a DevTools-sávok nevéhez), a szótárakat nem. Ami
 *  a lapra kerül, az a mért számot rontja. */

export type Locale = 'hu' | 'en';

/** A böngésző (`navigator.language`) vagy a rendszer (`LANG`) nyelvi
 *  címkéjéből: magyar, ha `hu`-val kezdődik (`hu`, `hu-HU`, `hu_HU.UTF-8`),
 *  minden más angol. */
export const localeFor = (tag: string | null | undefined): Locale => (/^hu(?![a-z])/i.test(tag ?? '') ? 'hu' : 'en');
