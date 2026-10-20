// Dodatkowe logo dla bake-logos.cjs -- dopełniają listę logo. Każde przechodzi
// przez prawdziwy edytor, a wynik zapisu trafia do logos.baked.json.
// Logo rysunkowe i obrazkowe pochodzą z plików DEMO (data/demo.cjs): jedno
// pełne logo rysunkowe do edytora, reszta to poprawny układ kropek.
// bake-logos.cjs obsługuje też { mode: "DRAW", source } i { mode: "IMAGE", svg }.
module.exports = [
  { mode: "TEXT", age: 4, names: { pl: "Wakacje 2026", en: "Summer 2026", uk: "Літо 2026" }, text: { pl: "WAKACJE", en: "SUMMER", uk: "SUMMER" } },
  { mode: "TEXT", age: 7, names: { pl: "Rodzinny turniej", en: "Family tournament", uk: "Сімейний турнір" }, text: { pl: "RODZINA", en: "FAMILY", uk: "FAMILY" } },
  { mode: "TEXT", age: 9, names: { pl: "Firma XYZ", en: "XYZ Company", uk: "Компанія XYZ" }, text: { pl: "XYZ 2026", en: "XYZ 2026", uk: "XYZ 2026" } },
  { mode: "TEXT", age: 20, names: { pl: "Quiz czwartkowy", en: "Thursday quiz", uk: "Четверговий квіз" }, text: { pl: "QUIZ!", en: "QUIZ!", uk: "QUIZ!" } },
];
