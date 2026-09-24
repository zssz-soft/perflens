/** A PerfLens magyar szövegei — a FORRÁS szótár.
 *
 *  Az `en.ts` ennek a típusát kapja (`Messages`): egy hiányzó vagy rossz
 *  aláírású fordítást a tsc fog meg. A sablonok függvények, mert a
 *  mondatrend nyelvenként más. A számokat a hívó kerekíti. */

export const hu = {
  units: { count: 'db', perSec: '/s', perMin: '/perc', ms: 'ms', pct: '%' },

  panel: {
    /** A panel.html `data-i18n` elemei. */
    static: {
      waiting: 'várakozás',
      waitingMeta: 'Várakozás az ügynökre… (a popupban engedélyezd az origint, és töltsd újra a lapot)',
      backToLive: 'Vissza élőre',
      save: 'Mentés',
      load: 'Betöltés',
      timeline: 'Idősor — másodpercenként (legfeljebb az utolsó 120 s)',
      findingsHeading: 'Leletek',
      legendIntro: 'A lelet lánca adatrétegenként:',
      legendLoaf: 'LoAF (böngésző)',
      legendView: 'nézet (komponens, DOM)',
      legendApp: 'alkalmazás (worker, store).',
      legendNote: 'A lánc bizonyítékot mutat, nem okot — az okot A/B mérés igazolja.',
      viewsHeading: 'Nézetek — melyik komponens és melyik terület dolgozott?',
      rawCounters: 'Nyers számlálók',
    },
    modeLive: 'élő',
    modeLoaded: 'visszatöltött',
    modeDetached: 'leválasztva',
    detached: 'A kiterjesztés újratöltődött vagy frissült — zárd be és nyisd újra a DevTools-t.',
    events: (n: number) => `${n} esemény`,
    reportsDropped: (n: number) => `${n} jelentés eldobva`,
    eventsDropped: (n: number) => `${n} esemény kiesett a pufferből`,
    findings: (n: number) => `Leletek (${n})`,
    loadError: (why: string) => `A fájl nem tölthető be: ${why}`,
    notPainted: 'nem rajzolt',
  },

  /** A lapba ágyazott dashboard (beágyazott mód). A panel szövegeit
   *  újrahasznosítja; itt csak ami nála nincs. */
  embed: {
    live: 'Élő',
    pause: 'Szünet',
    evaluate: 'Kiértékelés',
    collapse: 'Összecsukás',
    expand: 'Kinyitás',
    close: 'Bezárás',
    paused: 'szünet',
    /** A 12.1 és a 19.10 kimondva, a felületen is: a szabálymotor a panelen
     *  fut, nem a mért lapon — beágyazva ezért kézi, egyszeri. */
    cost: 'Ez a nézet a MÉRT lapon fut, tehát maga is főszál-munkát okoz: mérés alatt csukd össze — csukva nem rajzol és nem is időzít. A szabálymotor nem fut élőben, a „Kiértékelés” indítja, egyszer.',
    rulesIdle: 'A leletek élőben nem futnak — a „Kiértékelés” megnézi őket.',
    noAgent: 'Nincs PerfLens-ügynök a lapon (window.__perfLens). Töltsd be az ügynököt a dev buildben, vagy használd a kiterjesztést.',
  },

  dashboard: {
    severity: { critical: 'KRITIKUS', warn: 'FIGYELEM', info: 'INFÓ' },
    peak: (value: string) => `csúcs ${value}`,
    whatIsIt: (title: string) => `${title}: mit jelent?`,
    tipFoot: 'Egy oszlop = 1 másodperc. A nagy szám az utolsó teljes másodperc, a csúcs a látható ablak maximuma.',
    barInfo: 'tájékoztató: nincs főszál-bizonyíték',
    noFindings: 'Nincs lelet. (A „quiet" állapot is eredmény — a szabályok nem riasztanak ok nélkül.)',
    layer: (layer: string) => `adatréteg: ${layer}`,
    views: {
      components: (runs: number, ms: number) => `Komponensek — ${runs} nézet-futás, összesen ${ms} ms (Angular-profil, fejlesztői build: a sorrend megbízható, az abszolút idő élesben kisebb)`,
      noComponents: 'A profiler-horog települt, de komponens-esemény nem jött — minden idő a keretrendszeré. Valószínűleg ennél az Angular-verziónál mások a (belső) profiler-események.',
      noProfile: 'Nincs komponens-profil: az Angular profiler-horga csak fejlesztői buildben él (pl. ng serve). A DOM-területek minden buildben látszanak.',
      cols: { component: 'komponens', ms: 'saját idő (ms)', checks: 'ellenőrzés', part: 'legdrágább rész' },
      dom: (n: number) => `DOM-területek — ${n} változás (hol változott a képernyő)`,
      domCols: { area: 'terület', changes: 'változás' },
      empty: 'Még nincs nézet-adat.',
    },
    cause: {
      probable: (text: string) => `Valószínű ok: ${text}`,
      possible: (text: string) => `Lehetséges ok: ${text}`,
    },
  },

  /** A dashboard sávjai (dashboard/bands.ts). Az `info` az info-ikon súgója,
   *  soronként egy bekezdés. */
  bands: {
    busy: {
      title: 'Főszál-foglaltság', unit: '%', question: 'Blokkolva van a főszál?',
      info: 'A másodpercben indult hosszú (50 ms fölötti) feladatok összideje százalékban: 500 ms = 50 %. A rövid feladatokat szabvány API nem jelenti, így a valódi foglaltság ennél több is lehet.\n'
        + 'Szaggatott vonal: 50 %, fölötte piros. Lelet csak akkor lesz belőle, ha az 5 másodperces átlag is átlépi; egy kiugró másodperc nem elég.',
    },
    longtasks: {
      title: 'Hosszú feladat', unit: 'db', question: 'Vannak hosszú feladatok?',
      info: 'Hány 50 ms-nál hosszabb főszál-feladat indult a másodpercben (Long Tasks API). Amíg egy ilyen fut, a lap nem reagál és nem rajzol.\n'
        + 'Minden oszlop piros: már egy hosszú feladat is lelet.',
    },
    frames: {
      title: 'Kiesett képkocka', unit: 'db', question: 'Akad a képernyő?',
      info: 'BECSLÉS a requestAnimationFrame-hívások közti résekből: egy N képkocka hosszú rés N − 1 kiesést jelent. A képkocka-időt a közelmúltból tanulja (60 Hz-en 16,7 ms, 120 Hz-en 8,3 ms). A 250 ms fölötti rés szünet (rejtett fül, alvó gép), nem kiesés.\n'
        + 'Piros: a résben hosszú feladat futott, vagy legalább 3 képkocka esett ki.\n'
        + 'Narancs: tájékoztató, a főszálon nincs nyoma. Nem a JS blokkolt; gyanúsított a szemétgyűjtés, a kompozitor, egy másik fül vagy a rendszer.',
    },
    ws: {
      title: 'WS-üzenet', unit: '/s', question: 'Milyen sűrűn jönnek az élő események?',
      info: 'Beérkező WebSocket-üzenetek másodpercenként: a főszálon nyitott és a műszerezett worker socketjei együtt. Műszerezés nélkül a worker socketjei nem látszanak.\n'
        + 'Nincs küszöbe: ez a terhelés, amihez a többi sáv csúcsait mérni lehet.',
    },
    worker: {
      title: 'Worker → főszál', unit: '/s', question: 'Hány üzenet megy a főszálra?',
      info: 'A workerből (vagy MessagePortról) a főszálra érkező üzenetek másodpercenként. Minden üzenet egy külön főszál-feladat.\n'
        + 'Szaggatott vonal: 60/s, nagyjából képkockánként egy üzenet. Fölötte piros: ennél sűrűbben küldeni fölösleges, a képernyő úgysem frissül gyorsabban.',
    },
    store: {
      title: 'Store-írás', unit: '/s', question: 'Többet írunk, mint amennyit festeni lehet?',
      info: 'Store-írások másodpercenként, az app-tudatos adapter felületéről (adapter nélkül, idegen oldalon mindig 0).\n'
        + 'Szaggatott vonal: az adott másodperc képkockaszáma (ha nincs, 60). Fölötte piros: több az írás, mint a képkocka, a köztes állapotokat senki nem látja, csak számolni kell őket.',
    },
    inp: {
      title: 'Leglassabb interakció', unit: 'ms', question: 'Drága munka követi az interakciót?',
      info: 'A másodpercben indult leglassabb interakció (kattintás, billentyű, koppintás) ideje az Event Timing API szerint: a bemenettől a következő kirajzolásig, a kezelő futásával együtt. A 16 ms alattiak nem látszanak.\n'
        + '100 ms fölött már lelet (figyelmeztetés). Szaggatott vonal: 200 ms, fölötte kritikus és piros.',
    },
    pipeline: {
      title: 'WS → render p95', unit: 'ms', question: 'Mennyi idő alatt ér a képernyőre a friss adat? (a mérés kezdete óta)',
      info: 'A WebSocket-üzenet beérkezésétől a kirajzolásig eltelt idő 95. percentilise, az app-tudatos adapter felületéről (adapter nélkül, idegen oldalon 0).\n'
        + 'KUMULÁLT: a mérés kezdete óta számolt p95, nem másodpercenkénti, ezért lassan mozdul, és egy régi csúcs sokáig benne marad.\n'
        + 'Szaggatott vonal: 100 ms, fölötte piros.',
    },
  },

  rules: {
    longTask: {
      title: (ms: number) => `Hosszú feladat: ${ms} ms`,
      facts: { duration: 'task hossza (ms)', blocking: 'blokkoló rész (ms)' },
      hint: 'Nézd meg, mi futott ebben a feladatban — a LoAF-lépések megmutatják a belépési pontot.',
    },
    busy: {
      title: (pct: number, seconds: number) => `A főszál ${pct}%-ban foglalt ${seconds} s alatt`,
      facts: { pct: 'foglaltság (%)', longTasks: 'hosszú task' },
      hint: 'Ebben az ablakban a felület akadozik. Nézd meg a hosszú feladatokat és a velük egy időben érkező üzeneteket.',
    },
    slowInteraction: {
      title: (name: string, ms: number) => `Lassú interakció (${name}): ${ms} ms`,
      facts: { latency: 'latencia (ms)', event: 'esemény' },
      hint: 'A felhasználó ennyit várt a visszajelzésre. Nézd meg, mi futott a kezelőben és utána.',
    },
    inputDelay: {
      title: (ms: number) => `Bemeneti késés: ${ms} ms`,
      facts: { delay: 'késés (ms)', event: 'esemény' },
      hint: 'A kezelő el sem indulhatott — a főszál foglalt volt. Ez NEM a kezelő lassúsága: nézd meg, mi futott előtte.',
    },
    workerBurst: {
      title: (n: number, ms: number) => `${n} worker-üzenet ${ms} ms alatt`,
      facts: { messages: 'üzenet', mainMs: 'főszál-idő (ms)' },
      hint: 'Képkockánként egynél több üzenet úgysem látszik a képernyőn. Nézd meg, összevonja-e a worker a küldést.',
      rateTitle: (n: number) => `${n} worker-üzenet/s`,
      rateFacts: { rate: 'üzenet/s' },
      rateHint: 'Tartósan több üzenet, mint képkocka. Nézd meg a worker küldési ütemét.',
    },
    storeChurn: {
      title: (writes: number, frames: number) => `${writes} store-írás, ${frames} képkocka`,
      facts: { writes: 'store-írás/s', frames: 'képkocka/s' },
      hint: 'Amit nem lehet kifesteni, azt fölösleges beírni. Nézd meg, összevonja-e a híd a kötegeket (NODE 27).',
      hypothesis: 'a store gyakrabban íródik, mint ahogy a képernyő frissülni tud',
    },
    wsBurst: {
      title: (n: number, ms: number) => `WS-csúcs (${n} üzenet/s) után ${ms} ms-os feladat`,
      facts: { peak: 'WS-üzenet a csúcs másodpercében', average: 'előző 10 s átlaga', task: 'task hossza (ms)' },
      hint: 'Nézd meg, a csúcs üzeneteit egyenként vagy összevonva dolgozza-e fel a lap.',
      hypothesis: 'az élő események csúcsa utáni szinkron feldolgozás',
    },
    interactionThenWork: {
      title: (name: string, ms: number) => `${name} után ${ms} ms-os feladat`,
      unnamed: 'interakció',
      facts: { interaction: 'interakció (ms)', task: 'task hossza (ms)' },
      hint: 'Nézd meg, mit indít el ez az interakció szinkronban.',
      hypothesis: 'az interakció kezelője vagy az általa indított munka blokkolja a főszálat',
    },
    droppedFrames: {
      title: (n: number, gapMs: number) => `${n} kiesett képkocka (${gapMs} ms rés)`,
      facts: { dropped: 'kiesett képkocka', gap: 'rés (ms)', evidence: 'főszál-bizonyíték' },
      evidenceTask: (ms: number) => `hosszú feladat, ${ms} ms`,
      evidenceNone: 'nincs',
      hintTask: 'A résben hosszú feladat futott — a lánc megmutatja, mi indította.',
      hintNone: 'A főszálon NEM volt hosszú feladat (a LoAF is csak 50 ms fölött jelez): a rés nem a JS blokkolásából jön. Gyanúsított a szemétgyűjtés, a kompozitor, egy másik fül vagy a rendszer — ezt csak trace mutatja meg (17. fejezet).',
      hypothesis: 'a képkocka nem a főszál blokkolása miatt maradt ki',
    },
    pipelineSlow: {
      title: (ms: number) => `WS → render p95: ${ms} ms`,
      facts: { p95: 'p95 (ms), a mérés kezdete óta' },
      hint: 'A friss odds ennyi idő alatt jut a képernyőre. Nézd meg a köteg-várakozás és a főszál sávját.',
    },
    /** Az összevont rátaszabály-lelet (engine.ts). */
    merged: {
      title: (title: string, n: number, seconds: number) => `${title} — ${n}×, ${seconds} s-on át`,
      facts: { count: 'előfordulás', duration: 'időtartam (s)' },
    },
  },

  enrich: {
    invoker: (label: string) => `kiváltója: ${label}`,
    script: (ms: number) => `${ms} ms JavaScript-futás`,
    rest: (ms: number) => `a képkocka többi része (render, elrendezés, tétlen): ${ms} ms`,
    anonymous: 'névtelen függvény',
    top: (ms: number, where: string, file: string) => `ebből ${ms} ms: ${where}${file ? ` — ${file}` : ''}`,
    workerBefore: (n: number) => `${n} worker-üzenet a lelet előtti 500 ms-ban és alatta`,
    wsPage: (n: number) => `${n} WS-üzenet a lapon ugyanebben az ablakban`,
    storeWrites: (n: number) => `${n} store-írás ebben a másodpercben`,
    wsWorker: (n: number) => `${n} WS-üzenet a workerben ebben a másodpercben`,
    viewRuns: (ms: number, runs: number) => `${ms} ms nézet-frissítés (${runs} futás, Angular-profil — fejlesztői build)`,
    component: (name: string, ms: number, checks: number, part: string, partMs: number) =>
      `ebből ${ms} ms: ${name}${checks ? ` (${checks}× ellenőrizve)` : ''}${part ? ` — főleg ${part}: ${partMs} ms` : ''}`,
    dom: (n: number, where: string) => `${n} DOM-változás${where ? `; a legtöbb: ${where}` : ''}`,
  },

  session: {
    notJson: 'Nem JSON.',
    unknownSchema: (got: string, want: string) => `Ismeretlen séma: ${got} (várt: ${want}).`,
    incomplete: 'Hiányos munkamenet.',
  },

  diff: {
    metrics: {
      worstTask: 'Leghosszabb feladat', longTasks: 'Hosszú feladatok', busy: 'Főszál-foglaltság', inp: 'INP',
      dropped: 'Kiesett képkocka', pipelineP95: 'WS → render p95', workerIn: 'Worker → főszál üzenet',
      store: 'Store-írás', storePerBatch: 'Store-írás kötegenként', critical: 'Kritikus lelet',
    },
    otherPage: (a: string, b: string) => `más oldal: ${a} → ${b}`,
    otherMode: (a: string, b: string) => `más mód: ${a} → ${b} (az app-tudatos metrikák csak az egyikben vannak)`,
    otherLength: (a: number, b: number) => `eltérő hossz: ${a} s → ${b} s (a darabszámok percre vetítve kapuznak)`,
    otherLoad: (a: number, b: number) => `eltérő terhelés: ${a} → ${b} WS-üzenet/s — a különbség részben a bemenetről szól, nem a kódról`,
    otherView: (a: string, b: string) => `más nézet: ${a} → ${b}`,
    otherAgent: (a: string, b: string) => `más ügynök-verzió: ${a} → ${b}`,
    /** Egyforma szélesek: a két sor URL-je egymás alá kerül. */
    base: 'alap: ',
    next: 'új:   ',
    warning: (w: string) => `FIGYELEM: ${w}`,
    regressed: (n: number) => `TELJESÍTMÉNY-REGRESSZIÓ (${n} metrika a küszöb fölött)`,
    noRegression: 'Nincs regresszió a küszöbök szerint.',
    threshold: 'küszöb',
    allMetrics: 'Minden metrika:',
    percentPoints: 'pp',
    verdict: { improved: '↑ jobb', regressed: '↓ ROSSZABB', stable: '· stabil', 'n/a': '  n/a' },
  },

  popup: {
    unusable: 'Ezen a lapon nem használható.',
    enabled: 'Bekapcsolva ezen az originen.',
    disabled: 'Kikapcsolva.',
    disable: 'Kikapcsolás',
    enable: 'Bekapcsolás ezen az originen',
    note: 'Engedélyezés után a lap újratöltődik: az ügynöknek az alkalmazás ELŐTT kell betöltődnie. A mérés a DevTools „PerfLens” paneljén látszik — ha a panel már nyitva volt, zárd be és nyisd újra a DevTools-t.',
  },

  cli: {
    usage: 'Használat: node tools/perflens-diff.mts --base=alap.json --new=uj.json [--json]',
    unreadable: (why: string) => `Nem olvasható munkamenet: ${why}`,
  },
};

export type Messages = typeof hu;
