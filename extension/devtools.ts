// A DevTools-panel regisztrálása (27-es doksi 5.3): a panel a fül DevTools-ával
// együtt él — egy 60 másodperces élő megfigyelés a popupban lehetetlen volna.
//
// A `devtools.html` a kiterjesztés GYÖKERÉBEN van, nem almappában: a
// `panels.create` harmadik paraméterét a Chrome a gyökérhez képest oldja fel,
// de van olyan implementáció, amelyik a DevTools-laphoz képest — almappából a
// kettő szétválna, és a panel üresen jönne fel. Gyökérből a kettő ugyanaz.
// A füstteszt ellenőrzi (manifest-konzisztencia).
chrome.devtools.panels.create('PerfLens', '', 'panel.html');
