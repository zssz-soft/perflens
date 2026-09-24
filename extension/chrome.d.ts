/** A kiterjesztés által HASZNÁLT `chrome.*` API-k szűk leírása.
 *
 *  Nem a `@types/chrome` — az új függőség lenne, a PerfLens pedig függőség
 *  nélküli. Csak az van itt, amit a kód ténylegesen hív; ha új API kell,
 *  ide kerül. FIGYELEM: ez a deklaráció a `perf-lens/` egész
 *  típusellenőrzésében látszik, ezért azt, hogy a MAG ne használjon
 *  `chrome.*`-ot, nem a tsc, hanem a határőr (`tools/perflens-boundary.mjs`)
 *  őrzi. */
declare namespace chrome {
  interface Ev<F> { addListener(f: F): void; removeListener(f: F): void }
  namespace runtime {
    /** Érvénytelenített kontextusban `undefined` — ebből tudjuk, hogy a
     *  kiterjesztés újratöltődött alattunk. */
    const id: string | undefined;
    interface Port {
      name: string;
      sender?: { tab?: { id?: number } };
      postMessage(m: unknown): void;
      disconnect(): void;
      onMessage: Ev<(m: any) => void>;
      onDisconnect: Ev<() => void>;
    }
    function connect(info: { name: string }): Port;
    function sendMessage(m: unknown): Promise<any>;
    const onConnect: Ev<(p: Port) => void>;
    const onMessage: Ev<(m: any, sender: unknown, reply: (r?: unknown) => void) => boolean | void>;
  }
  namespace tabs {
    interface Tab { id?: number; url?: string }
    function query(q: { active?: boolean; currentWindow?: boolean; url?: string }): Promise<Tab[]>;
    function reload(id: number): Promise<void>;
    const onRemoved: Ev<(tabId: number) => void>;
  }
  namespace storage {
    const local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> };
  }
  namespace permissions {
    function request(p: { origins: string[] }): Promise<boolean>;
    function remove(p: { origins: string[] }): Promise<boolean>;
    function contains(p: { origins: string[] }): Promise<boolean>;
    const onAdded: Ev<(p: { origins?: string[] }) => void>;
    const onRemoved: Ev<(p: { origins?: string[] }) => void>;
  }
  namespace scripting {
    interface RegisteredContentScript {
      id: string; matches?: string[]; js?: string[]; runAt?: 'document_start' | 'document_end' | 'document_idle';
      world?: 'MAIN' | 'ISOLATED'; allFrames?: boolean; persistAcrossSessions?: boolean;
    }
    function registerContentScripts(s: RegisteredContentScript[]): Promise<void>;
    function unregisterContentScripts(f?: { ids: string[] }): Promise<void>;
    function getRegisteredContentScripts(f?: { ids: string[] }): Promise<RegisteredContentScript[]>;
  }
  namespace devtools {
    namespace panels { function create(title: string, iconPath: string, pagePath: string): void; const themeName: string }
    namespace inspectedWindow { const tabId: number }
  }
}
