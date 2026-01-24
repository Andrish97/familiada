# FAMILIADA — uniwersalny modal UI

Ten dokument opisuje **jeden spójny wzorzec modala** używany w projekcie FAMILIADA (jak w `builder.css`: `importOverlay`, `exportBaseOverlay`). Jest to **instrukcja techniczna + szablon**, przeznaczona do kopiowania i adaptacji.

---

## 1. Założenia

* Modal składa się zawsze z **overlay** (przyciemnione tło) oraz **karty modala**.
* Styl opiera się **wyłącznie** na istniejących klasach:

  * `.overlay`, `.modal`
  * `.mTitle`, `.mSub`
  * `.importRow`, `.importMsg`
  * `.btn`, `.btn sm`, `.btn sm gold`
  * `.inp`, `.importTa`
* Nowe klasy służą wyłącznie do **układu**, nie do stylowania wizualnego.

---

## 2. Minimalny szkielet HTML (obowiązkowy)

```html
<div class="overlay" id="XYZOverlay" style="display:none;">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="XYZTitle">

    <div class="mTitle" id="XYZTitle">Tytuł modala</div>
    <div class="mSub" id="XYZSub">Krótki opis: co robimy i co się stanie.</div>

    <!-- BODY -->
    <div class="XYZBody">
      <!-- zawartość modala -->
    </div>

    <!-- STOPKA -->
    <div class="importRow">
      <button class="btn sm gold" id="XYZOk" type="button">Zapisz</button>
      <button class="btn sm" id="XYZCancel" type="button">Zamknij</button>
      <div class="importMsg" id="XYZMsg">—</div>
    </div>

  </div>
</div>
```

### Elementy obowiązkowe

* `div.overlay` — blokuje tło i centruje modal
* `div.modal` — karta modala
* `.mTitle` — jednoznaczny tytuł
* `.mSub` — opis działania
* `.importRow` — stopka z akcjami
* `.importMsg` — komunikaty statusu

---

## 3. Rozszerzony szablon (zalecany)

```html
<div class="overlay" id="uniOverlay" style="display:none;">
  <div class="modal uni-modal" role="dialog" aria-modal="true" aria-labelledby="uniTitle">

    <div class="uni-head">
      <div class="mTitle" id="uniTitle">Tytuł</div>
      <button class="btn sm" id="uniClose" type="button" aria-label="Zamknij">✕</button>
    </div>

    <div class="mSub" id="uniSub">Opis czynności wykonywanej w modalu.</div>

    <div class="uni-body">

      <div class="uni-block">
        <div class="uni-label">Nazwa</div>
        <input class="inp uni-inp" type="text" placeholder="Wpisz nazwę" />
        <div class="uni-hint">Maksymalnie 40 znaków.</div>
      </div>

      <div class="uni-block">
        <div class="uni-label">Wybierz element</div>
        <div class="basePickList">
          <div class="basePickItem">
            <input type="radio" />
            <div class="nm">ELEMENT A</div>
            <div class="meta">info</div>
          </div>
        </div>
      </div>

      <div class="uni-block">
        <div class="uni-label">Opis</div>
        <textarea class="importTa uni-ta" placeholder="Treść..."></textarea>
      </div>

    </div>

    <div class="importRow uni-foot">
      <button class="btn sm gold">Zapisz</button>
      <button class="btn sm">Zamknij</button>
      <div class="importMsg">—</div>
    </div>

  </div>
</div>
```

---

## 4. CSS — minimalne dodatki

Dodać **na końcu `builder.css`**:

```css
/* ===== Uniwersalny modal – dodatki layoutowe ===== */

.uni-modal{
  width: min(720px, 94vw);
}

.uni-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}

.uni-body{
  margin-top:14px;
  display:flex;
  flex-direction:column;
  gap:14px;
}

.uni-block{
  display:flex;
  flex-direction:column;
  gap:8px;
}

.uni-label{
  font-size:11px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
  opacity:.85;
}

.uni-hint{
  font-size:12px;
  opacity:.75;
}

.uni-inp{
  width:100%;
}

.uni-ta{
  min-height:140px;
}

.uni-foot{
  margin-top:14px;
  padding-top:12px;
  border-top:1px solid rgba(255,255,255,.12);
}
```

---

## 5. Typowe warianty modala

### 5.1. Modal formularza (rename / ustawienia)

* BODY zawiera tylko `.uni-block` z `input`
* Główna akcja: **Zapisz**
* Anulowanie: **Zamknij**

### 5.2. Modal wyboru (picker)

* BODY zawiera `.basePickList`
* Wiersze `.basePickItem`
* Status pokazuje aktualny wybór

### 5.3. Modal potwierdzenia (tak / nie)

* BODY puste
* Cała informacja w `.mSub`
* Przyciski:

  * `.btn sm gold` — akcja nieodwracalna (Usuń)
  * `.btn sm` — Anuluj

---

## 6. Zasady UX (obowiązujące)

* Jeden modal = **jedna decyzja użytkownika**
* Główna akcja zawsze wyróżniona (`.gold`)
* Komunikaty zawsze w `.importMsg`
* Modal nie powinien zmieniać kontekstu tła
* Zamknięcie musi być możliwe:

  * przyciskiem
  * ikoną ✕
  * (opcjonalnie) klawiszem ESC

---

## 7. Checklist przed użyciem

* [ ] overlay ma `display:none` i jest otwierany programowo
* [ ] użyte są `.mTitle` i `.mSub`
* [ ] stopka to `.importRow` + `.importMsg`
* [ ] brak nowych stylów wizualnych (tylko layout)
* [ ] modal mieści się w `92vh`

---

**Ten plik jest wzorcem referencyjnym.**
Każdy nowy modal w projekcie powinien być oparty dokładnie na tym układzie.
