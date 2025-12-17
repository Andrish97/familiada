# Guide API – Familiada Display (GRA/QR)

Ten dokument opisuje **całe API sterowania stroną display**: tryby globalne (`GRA`, `QR`), tryby dużego wyświetlacza (`LOGO`, `ROUNDS`, `FINAL`, `WIN`), komendy tekstowe (backend → `handleCommand("...")`), oraz przykłady do testów w konsoli.

> Założenia:
> - Po starcie masz globalnie:
>   - `window.app` (globalny tryb `GRA/QR` + kontroler QR)
>   - `window.scene` (zwrócone z `createScene()`)
>   - `window.handleCommand(line)` (router globalny: QR/GRA)
> - Tryb `GRA` to “gra” (SVG scenografia + wyświetlacze).
> - Tryb `QR` to czarny ekran + dwa kody QR.

---

## 1) Dwa poziomy sterowania

### A) Globalne (APP)

To jest **tryb strony**:
- `GRA` – pokazuje scenografię (SVG + wyświetlacze)
- `QR` – czarny ekran + 2 kody QR
- `BLACK_SCREEN` – czarny ekran (domyślny)

Sterujesz:
- przez JS: `app.setMode("GRA")`, `app.setMode("QR")`
- przez komendy tekstowe: `MODE GRA`, `MODE QR`, albo `APP MODE GRA/QR`

### B) “Wewnątrz gry” (scene)

To są tryby **dużego wyświetlacza**:
- `LOGO`
- `ROUNDS`
- `FINAL`
- `WIN`

Sterujesz:
- przez JS: `scene.api.mode.set("ROUNDS")` itd.
- przez tekst: `handleCommand("MODE ROUNDS")` itd. (w trybie GRA)

---

## 2) API obiektowe (JS)

### 2.1 Globalne `app`

#### `app.setMode("GRA" | "QR")`
Przełącza ekran.

#### `app.qr.setHost(url)` / `app.qr.setBuzzer(url)`
Ustawia linki do QR.
- Samo ustawienie URL nie musi przełączać ekranu.
- Komenda `QR HOST ... BUZZER ...` ustawia i przełącza na `QR`.

---

### 2.2 `scene.api.mode`

#### `scene.api.mode.get() -> "LOGO" | "ROUNDS" | "FINAL" | "WIN"`
Zwraca aktualny tryb dużego wyświetlacza.

#### `await scene.api.mode.set(mode, { animIn? })`
Przełącza tryb dużego wyświetlacza i wykonuje “init” dla trybu.
- `animIn` domyślnie działa na **całym dużym wyświetlaczu 30×10**, chyba że podasz `area` (zwykle tego nie robisz na poziomie `mode.set`, ale można).

Przykład:
```js
await scene.api.mode.set("ROUNDS", { animIn: { type:"edge", dir:"top", ms:6 } });
```

---

### 2.3 `scene.api.big` (low-level, do zabaw / debug)

#### `scene.api.big.put(col, row, ch, color?)`
Wstawia symbol `ch` do kafla (kolumna, rząd) na dużym wyświetlaczu (1-based).

#### `scene.api.big.clear()`
Czyści cały duży wyświetlacz.

#### `scene.api.big.clearArea(c1,r1,c2,r2)`
Czyści fragment.

#### Animacje
- `await scene.api.big.animIn({ type, dir|axis, ms, area? })`
- `await scene.api.big.animOut({ type, dir|axis, ms, area? })`

Parametry:
- `type: "edge" | "matrix" | "rain"`
- dla `edge`: `dir: "left" | "right" | "top" | "bottom"`
- dla `matrix i rain`: `axis: "down" | "up" | "right" | "left"`
- `ms`: opóźnienie kroku (mniejsze = szybciej)
- `area`: `{c1,r1,c2,r2}` – jeśli chcesz animować tylko fragment

---

### 2.4 `scene.api.small` (małe wyświetlacze)

#### Trzy “potrójne” 5×7 (cyfry)
- `scene.api.small.topDigits("123")`
- `scene.api.small.leftDigits("045")`
- `scene.api.small.rightDigits("999")`

Zasady:
- przyjmują tylko cyfry; znaki nie-cyfrowe → spacja.

#### Dwa podłużne (95×7) – tekst do 15 znaków
- `scene.api.small.long1("FAMILIADA")`
- `scene.api.small.long2("SUMA 000")`

Zasady:
- maks 15 symboli
- środkowanie w “polu” z przerwą 1 kolumny między literami

---

### 2.5 `scene.api.logo` (LOGO, wysokość 5)

LOGO rysuje się w obszarze:
- **rząd 3..7** (5 wierszy)
- **kolumna 1..30**

#### `await scene.api.logo.load("./logo_familiada.json")`
Wczytuje plik z layoutem logo.

#### `scene.api.logo.set(json)`
Ustawia JSON logo z obiektu w JS.

#### `scene.api.logo.draw()`
Rysuje logo (bez animacji).

#### `await scene.api.logo.show(animIn?)`
Przełącza na LOGO, rysuje, potem robi animację wejścia tylko dla obszaru logo (3..7).

#### `await scene.api.logo.hide(animOut?)`
Animuje wyjście tylko dla obszaru logo.

##### Format `logo_familiada.json`
```json
{
  "layers": [
    {
      "color": "main",
      "rows": [
        "..............................",
        "..............................",
        "..............................",
        "..............................",
        ".............................."
      ]
    }
  ]
}
```

Ważne:
- `rows` ma **5 stringów**
- każdy string ma **30 znaków**
- spacja `" "` = pusto
- `color`: `"main" | "top" | "left" | "right"` (mapuje na kolory świecenia)

---

### 2.6 `scene.api.win`

#### `await scene.api.win.set("01234", { animOut?, animIn? })`
Wyświetla liczbę 5-cyfrową na dużym wyświetlaczu.

Obszar WIN:
- rząd **2..8** (7 wierszy)
- kolumna **1..30**

Właściwości:
- centrowanie poziome (cyfry mogą być węższe)
- pion zawsze: rzędy 2..8

---

### 2.7 `scene.api.rounds` (ROUNDS) — Opcja A (osobne settery)

ROUNDS layout:
- rzędy rund: **2..6**
- numer rundy: kol **5**
- tekst: kol **7..23** (17)
- punkty: kol **24..25** (2)
- `SUMA` label: kol **18..21**, rząd **8**
- suma value: kol **23..25**, rząd **8**
- “X” komórki: `1A/2A/3A/1B/2B/3B` (obszary 3×3 kafle)

#### `await scene.api.rounds.setText(i, "TEKST", { animOut?, animIn? })`
Animuje i zmienia **tylko tekst** w rundzie `i` (1..5). Inne pola bez zmian.

#### `await scene.api.rounds.setPts(i, "10", { animOut?, animIn? })`
Animuje i zmienia **tylko punkty** w rundzie `i` (1..5). Inne pola bez zmian.

#### `await scene.api.rounds.setSuma("120", { animOut?, animIn? })`
Aktualizuje sumę (pole 3 znaki).

#### `scene.api.rounds.setX("2A", true|false)`
Rysuje/usuwa 3×3 X (w środku jest ⧗).

---

### 2.8 `scene.api.final` (FINAL) — Opcja A

FINAL layout:
- rzędy: **2..6**
- lewy tekst: kol **1..11**
- A: kol **13..14**
- B: kol **17..18**
- prawy tekst: kol **20..30**
- `SUMA` label: kol **11..14**, rząd **8**
- suma value: kol **16..18**, rząd **8**

#### `await scene.api.final.setLeft(i, "TEKST", { animOut?, animIn? })`
Zmienia tylko lewy tekst.

#### `await scene.api.final.setA(i, "12", { animOut?, animIn? })`
Zmienia tylko A (2 znaki).

#### `await scene.api.final.setB(i, "34", { animOut?, animIn? })`
Zmienia tylko B (2 znaki).

#### `await scene.api.final.setRight(i, "TEKST", { animOut?, animIn? })`
Zmienia tylko prawy tekst.

#### `await scene.api.final.setSuma("999", { animOut?, animIn? })`
Zmienia sumę (3 znaki).

---

## 3) Komendy tekstowe (backend → `handleCommand("...")`)

Komendy są tekstowe (jednolinijkowe). Backend może wysyłać dokładnie takie linie, a frontend je dekoduje.

### 3.1 Globalne

#### Przełącz ekran strony
- `MODE QR`
- `MODE GRA`
- `MODE BLACK_SCREEN` alias `MODE BLACK`
- `APP MODE QR`
- `APP MODE GRA`
- `APP MODE BLACK_SCREEN` alias `APP MODE BLACK`

#### Ustaw QR (i przełącz na QR)
- `QR HOST "https://..." BUZZER "https://..."`

---

### 3.2 GRA (komendy sceny)

#### Małe wyświetlacze
- `TOP 123`
- `LEFT 045`
- `RIGHT 999`
- `LONG1 "FAMILIADA"`
- `LONG2 "SUMA 000"`

#### Duży – tryb
- `MODE LOGO`
- `MODE ROUNDS`
- `MODE FINAL`
- `MODE WIN`

Z animacją wejścia całego dużego:
- `MODE ROUNDS ANIMIN edge top 8`
- `MODE FINAL ANIMIN matrix down 16`

#### LOGO
- `LOGO LOAD "./logo_familiada.json"`
- `LOGO DRAW`
- `LOGO SHOW ANIMIN edge left 8`
- `LOGO HIDE ANIMOUT matrix right 14`

#### WIN
- `WIN 01234`
- `WIN 01234 ANIMOUT edge right 6 ANIMIN matrix down 18`

#### ROUNDS (Opcja A)
- `RTXT 2 "NOWA ODPOWIEDZ" ANIM edge left 6`
- `RPTS 2 25 ANIM matrix down 18`
- `RSUMA 120 ANIM matrix right 20`
- `RX 2A ON`
- `RX 2A OFF`

#### FINAL (Opcja A)
- `FL 1 "ALFA" ANIM edge left 6`
- `FA 1 12`
- `FB 1 34`
- `FR 1 "BETA" ANIM matrix right 14`
- `FSUMA 999 ANIM matrix down 16`

W `ANIM`:
- animacja jest użyta jako “out + in” dla tego pola (tylko ten fragment ekranu).

---

## 4) Komendy do konsoli (copy/paste test-pack)

Wszystko poniżej możesz wklejać do konsoli DevTools.

### 4.1 Szybki sanity check – global
```js
app.setMode("BLACK_SCREEN"); // czarny ekran
app.setMode("GRA");          // wraca scenografia
app.setMode("QR");           // QR
app.setMode("BLACK");        // alias

```

### 4.2 QR
```js
handleCommand('QR HOST "https://example.com/host" BUZZER "https://example.com/buzzer"');
```

Powrót:
```js
handleCommand('MODE GRA');
```

### 4.3 Małe wyświetlacze
```js
handleCommand('TOP 123');
handleCommand('LEFT 045');
handleCommand('RIGHT 999');
handleCommand('LONG1 "FAMILIADA"');
handleCommand('LONG2 "SUMA 000"');
```

### 4.4 ROUNDS – pełny pokaz
```js
handleCommand('MODE ROUNDS ANIMIN matrix down 10');

handleCommand('RTXT 1 "PIERWSZA" ANIM edge left 4');
handleCommand('RPTS 1 10 ANIM edge right 4');

handleCommand('RTXT 2 "DRUGA" ANIM matrix right 10');
handleCommand('RPTS 2 25 ANIM matrix down 10');

handleCommand('RTXT 3 "TRZECIA" ANIM edge top 4');
handleCommand('RPTS 3 05 ANIM edge bottom 4');

handleCommand('RSUMA 120 ANIM matrix right 12');

handleCommand('RX 2A ON');
handleCommand('RX 2B ON');
```

Wyłącz X:
```js
handleCommand('RX 2A OFF');
handleCommand('RX 2B OFF');
```

### 4.5 FINAL – pełny pokaz
```js
handleCommand('MODE FINAL ANIMIN edge top 6');

handleCommand('FL 1 "ALFA" ANIM edge left 4');
handleCommand('FA 1 12');
handleCommand('FB 1 34');
handleCommand('FR 1 "BETA" ANIM edge right 4');

handleCommand('FL 2 "GAMMA" ANIM matrix down 10');
handleCommand('FA 2 01');
handleCommand('FB 2 99');
handleCommand('FR 2 "DELTA" ANIM matrix right 10');

handleCommand('FSUMA 999 ANIM matrix down 12');
```

### 4.6 WIN – liczba 5-cyfrowa
```js
handleCommand('MODE WIN ANIMIN edge left 6');
handleCommand('WIN 01234 ANIMOUT edge right 4 ANIMIN matrix down 10');
handleCommand('WIN 98765 ANIMOUT matrix right 10 ANIMIN edge left 4');
```

### 4.7 LOGO (z pliku)
```js
handleCommand('LOGO LOAD "./logo_familiada.json"');
handleCommand('LOGO SHOW ANIMIN matrix down 12');
```

Schowaj:
```js
handleCommand('LOGO HIDE ANIMOUT edge right 6');
```

---
