import { readFileSync } from 'node:fs';
import { parseSession } from '../core/session.ts';
import { diffSessions, formatDiff } from '../core/diff.ts';
import { localeFor, setLocale, t } from '../core/i18n/index.ts';

/** Két PerfLens-munkamenet összevetése és regresszió-kapu (27-es doksi
 *  15.8). A munkamenetet a panel „Mentés" gombja írja; a formátum
 *  `perflens/1` (11.4).
 *
 *      node tools/diff.mts --base=alap.json --new=uj.json [--json]
 *
 *  Kilépőkód: 1, ha bármelyik metrika a küszöb fölött romlott (CI-kapu,
 *  a `compare.mts` mintájára); 2, ha a fájl nem olvasható. */

// A kimenet nyelve a rendszeré (a panelen a böngészőé): `hu*` → magyar, más → angol.
setLocale(localeFor(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG));

const get = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const basePath = get('base'), newPath = get('new');
if (!basePath || !newPath) {
  console.error(t().cli.usage);
  process.exit(2);
}
let base, next;
try {
  base = parseSession(readFileSync(basePath, 'utf-8'));
  next = parseSession(readFileSync(newPath, 'utf-8'));
} catch (e) {
  console.error(t().cli.unreadable((e as Error).message));
  process.exit(2);
}
const d = diffSessions(base, next);
console.log(process.argv.includes('--json') ? JSON.stringify(d, null, 2) : formatDiff(base, next, d));
process.exit(d.passed ? 0 : 1);
