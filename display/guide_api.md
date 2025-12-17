# Guide API – Familiada Display (GRA / QR / BLACK_SCREEN)

Ten dokument opisuje **aktualny i kompletny stan API** sterowania stroną display.
Nie zawiera założeń „na przyszłość” ani skrótów – tylko to, co faktycznie istnieje
i jak działa w obecnym kodzie.

---

## 1. Poziomy sterowania

System ma **dwa niezależne poziomy sterowania**:

### 1.1 Globalny (APP)
Steruje **całą stroną**.

Dostępne tryby:
- `GRA` – ekran gry (SVG + wyświetlacze)
- `QR` – czarny ekran + dwa kody QR
- `BLACK_SCREEN` – czarny ekran (bez QR)
  - alias: `BLACK`

Globalny tryb **nie wie nic** o LOGO / ROUNDS / FINAL / WIN.

### 1.2 Lokalny (SCENE)
Steruje **dużym wyświetlaczem** w trybie `GRA`.

Tryby dużego wyświetlacza:
- `LOGO`
- `ROUNDS`
- `FINAL`
- `WIN`

---

## 2. Obiekty globalne (runtime)

Po starcie strony dostępne są:

- `window.app`
- `window.scene`
- `window.handleCommand(line)`

---

## 3. Globalne API (`app`)

### 3.1 `app.setMode(mode)`

```js
app.setMode("GRA");
app.setMode("QR");
app.setMode("BLACK_SCREEN");
app.setMode("BLACK"); // alias
```

Efekt:
- `GRA` → pokazuje scenę gry
- `QR` → pokazuje QR overlay
- `BLACK_SCREEN` → czarny ekran

### 3.2 QR

```js
app.qr.setHost(url);
app.qr.setBuzzer(url);
```

Komenda tekstowa (ustawia i przełącza na QR):
```text
QR HOST "https://..." BUZZER "https://..."
```

---

## 4. API sceny (`scene.api`)

### 4.1 Tryb dużego wyświetlacza

```js
await scene.api.mode.set("ROUNDS", { animIn });
scene.api.mode.get(); // LOGO | ROUNDS | FINAL | WIN
```

Zmiana trybu **zawsze czyści cały duży ekran**.

---

## 5. Animacje

### 5.1 Typy animacji

| type    | opis |
|--------|------|
| `edge` | kafle pojawiają się po kolei od krawędzi |
| `matrix` | wipe całymi kaflami |
| `rain` | „cyfrowy deszcz” – piksele w paczkach |

### 5.2 Parametry wspólne

```js
{
  type: "edge" | "matrix" | "rain",
  dir?: "left" | "right" | "top" | "bottom",
  axis?: "up" | "down" | "left" | "right",
  ms?: number,
  area?: { c1,r1,c2,r2 },
  opts?: { density?, jitter? }
}
```

### 5.3 Uwagi o `rain`

- `rain` nie startuje z jednej strony
- rzędy / kolumny pojawiają się z różnych stron
- piksele wjeżdżają porcjami
- `density` kontroluje wielkość paczki
- `jitter` kontroluje chaos kolejności

---

## 6. Duży wyświetlacz (`scene.api.big`)

```js
scene.api.big.put(col, row, ch, color);
scene.api.big.clear();
scene.api.big.clearArea(c1,r1,c2,r2);

await scene.api.big.animIn(anim);
await scene.api.big.animOut(anim);
```

---

## 7. Małe wyświetlacze (`scene.api.small`)

### 7.1 Potrójne cyfry (5×7)

```js
scene.api.small.topDigits("123");
scene.api.small.leftDigits("045");
scene.api.small.rightDigits("999");
```

- zawsze od lewej do prawej
- tylko cyfry

### 7.2 Długie panele (95×7)

```js
scene.api.small.long1("FAMILIADA");
scene.api.small.long2("SUMA 120");
```

- max 15 znaków
- centrowane

---

## 8. LOGO (`scene.api.logo`)

Obszar:
- kolumny 1..30
- rzędy 3..7

```js
await scene.api.logo.load("./logo_familiada.json");
scene.api.logo.draw();
await scene.api.logo.show({ type:"rain", axis:"down", ms:40 });
await scene.api.logo.hide({ type:"edge", dir:"right", ms:10 });
```

---

## 9. WIN

```js
await scene.api.win.set("01234", {
  animOut:{ type:"edge", dir:"right", ms:6 },
  animIn:{ type:"matrix", axis:"down", ms:18 }
});
```

---

## 10. ROUNDS

```js
RTXT 2 "ODPOWIEDZ" ANIM edge left 6
RPTS 2 25 ANIM matrix down 18
RSUMA 120 ANIM matrix right 20
RX 2A ON
```

---

## 11. FINAL

```js
FL 1 "ALFA" ANIM edge left 6
FA 1 12
FB 1 34
FR 1 "BETA" ANIM matrix right 14
FSUMA 999 ANIM matrix down 16
```

---

## 12. Zasady

- `MODE GRA / QR / BLACK_SCREEN` → globalne
- `MODE LOGO / ROUNDS / FINAL / WIN` → lokalne (tylko w GRA)
- brak domyślnych animacji
- wszystko sterowane jawnie

---
