// Takt dla karty w tle: przeglądarki spowalniają timery wątku głównego w
// ukrytej karcie (Chrome nawet do raz na minutę), a timery Web Workera nie.
// Worker tylko odlicza; całą pracę wykonuje strona po otrzymaniu "tick".
let timer = null;
self.onmessage = (event) => {
  const ms = Number(event.data?.intervalMs);
  if (timer) clearInterval(timer);
  timer = Number.isFinite(ms) && ms > 0 ? setInterval(() => self.postMessage("tick"), ms) : null;
};
