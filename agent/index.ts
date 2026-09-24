import { installAgent } from './install.ts';

/** GENERIC belépési pont — bármelyik oldalra (27-es doksi 6. fejezet).
 *
 *  Csak szabvány API-kra épülő gyűjtők: LoAF, longtask, Event Timing,
 *  képkockák, DOM, worker- és WS-csomagolók, plusz az Angular nézet-profil
 *  ott, ahol az Angular fejlesztői módban fut. Alkalmazás-specifikus tudás
 *  NINCS benne — a `?perflens=on` itt nem kapcsol app-tudatos módot, mert
 *  nincs adapter, amit hívhatna.
 *
 *  Ebből lesz a `dist/agent.js`: ezt tölti a kiterjesztés és a füstteszt,
 *  és ez az, amit DevTools-snippetként is be lehet illeszteni.
 *
 *  App-tudatos módhoz készíts e mellé egy saját belépési pontot, ami az
 *  adapteredet adja át: `installAgent({ app: watchMyApp })`. */

installAgent();
