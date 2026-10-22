# „Postaw kawę” — plan (2026-10-22)

Prośba użytkownika: Familiada zostaje bezpłatna, ale kto chce, może dobrowolnie
wesprzeć twórcę („kawa bez benefitów”). Branch: `ccr-c9e1b7c4-8uoses`.
FAQ wdraża ta sesja; podręcznik — treść poniżej, wdraża druga sesja (decyzja użytkownika 2026-10-22).

## Decyzje

- **2026-10-22** — wsparcie dobrowolne, bez żadnych korzyści w aplikacji; tekst mówi
  to wprost.
- **2026-10-22** — w stopce ikonka (filiżanka) obok „Kontakt”; kliknięcie otwiera okno
  z wyjaśnieniem i linkiem (nie bezpośredni link).
- **2026-10-22** — dodatkowo sekcja w FAQ strony głównej i rozdział na końcu podręcznika.
- **2026-10-22** — link: `https://buycoffee.to/familiada.online` (konto projektu, opis podpisany imieniem; cena kawy wg użytkownika).
- **2026-10-22** — podręcznik: treść przygotowuje ta sesja, wdraża druga sesja (E13).

## Krok 1 — stopka i okno (zrobione na branchu, commit „Postaw kawę: filiżanka…”)

- Ikona `coffee` (`web/assets/icons/communication/coffee.svg`, rejestr w `icons.js`).
- `web/shared/js/core/support-modal.js`: `SUPPORT_URL` (pusty = brak przycisku),
  `ensureSupportEntryPoint()` (wołane z `contact-modal.js`, grupa `.footer-actions`
  z Kontaktem), `openSupportModal()` (`choiceModal`: Zamknij / Postaw kawę, link
  w nowej karcie, notka o zewnętrznym serwisie).
- Telefon: sama ikona (wysokość stopki bez zmian przy 360/390 px); komputer: ikona + napis.
- Teksty `support.*` PL/EN/UK; sceny `support-footer`, `support-footer-home`, `support-modal`.

## Krok 2 — FAQ na stronie głównej (zrobione na branchu)

Miejsce: `web/index.html` (sekcja `#faq`), teksty `home.faq.*` w `web/shared/translation/{pl,en,uk}.js`.

1. **Dopisek do q1** „Czy Familiada Online jest bezpłatna?”:
   „Tak, w pełni bezpłatna — i tak zostanie. Możesz tworzyć gry, zbierać ankiety
   i prowadzić rozgrywkę bez żadnych opłat.” (bez linku — odsyła do nowej sekcji).
2. **Nowa kategoria na końcu FAQ** `home.faq.cat6` „Wsparcie projektu”, po „Rozgrywce
   na żywo”:
   - **q31** „Jak mogę wesprzeć Familiadę?” — „Jeśli lubisz korzystać z Familiady,
     możesz postawić twórcy kawę — filiżanka w stopce każdej strony. To dobrowolny
     gest, który pomaga rozwijać serwis.”
   - **q32** „Czy wsparcie daje dodatkowe funkcje?” — „Nie. Wszystkie funkcje są
     dostępne dla każdego bez opłat. Wsparcie niczego nie odblokowuje — jest po prostu
     podziękowaniem.”
3. **Przycisk w odpowiedzi q31**: pod tekstem przycisk „Postaw kawę” (ikona `coffee`),
   który otwiera **to samo okno** co stopka (`openSupportModal`), zamiast linku
   wprost — jeden adres i jedno wyjaśnienie. `faq-a` jest ustawiane przez `data-i18n`
   (tekst), więc przycisk jako osobny element obok `<p>`, nie w tłumaczeniu.
   Bez `SUPPORT_URL` przycisk ukryty (jak w stopce).
4. **Dane strukturalne**: statyczny JSON-LD `FAQPage` w `web/index.html` (dla
   robotów) uzupełnić o q31–q32 i nowy tekst q1; `updateStructuredFaq()` w
   `web/home/js/index.js` i tak buduje go z DOM po zmianie języka.
5. Testy: `tests/unit/indexAudit.test.js` — dopisać sprawdzenie q31/q32 w 3 językach
   (bez obietnic korzyści: brak „premium”/„odblokuj”). Zrzut sceny `home`
   (`fullPage`) + nowa scena `home-faq-support` z rozwiniętą q31.

## Krok 3 — podręcznik: rozdział 21 (do wdrożenia przez sesję podręcznika)

Decyzja użytkownika 2026-10-22: treść przygotowana tutaj, wdraża ją druga sesja (E13).
Stopka, okno i FAQ są już na branchu `ccr-c9e1b7c4-8uoses` — ikona `coffee` istnieje
w `icons.js`, więc `<i class="ico" data-icon="coffee"></i>` działa w treści.

**Co zrobić:**
1. W `web/manual/content/{pl,en,uk}.js`, klucz `help`: dopisać poniższy fragment
   **na końcu**, po „20. Słownik pojęć” (po ostatnim `</ul>`, przed zamykającym `` ` ``).
2. Struktura (id `r21`, `r21-1`, `r21-2`, odnośnik `#r19-6`, przyciski `m-btn`) jest
   identyczna w 3 językach — wymóg `tests/unit/controlRelease.test.js`.
3. `docs/podrecznik-plan.md`: w części III dopisać „### 21. O projekcie i wsparcie”
   (21.1 Familiada jest bezpłatna; 21.2 Postaw kawę — przycisk w stopce, okno, zewnętrzny
   serwis, brak korzyści), a w „Decyzjach wdrożeniowych” karta `help` = rozdz. 19–21.
4. Słownik (20) bez nowego hasła. Zrzut: nowa scena
   `{ id: "manual-support", category: "Podręcznik", title: "Podręcznik — O projekcie i wsparcie (rozdz. 21)", path: "/manual/?tab=help#r21", sources: page("manual"), ready: "#tab-help .m-toc", settle: 800 }`.
5. Napisy przycisków muszą zgadzać się z aplikacją: stopka `support.footerBtn`
   („Postaw kawę” / „Buy me a coffee” / „Пригостити кавою”), przycisk w oknie
   `support.go` („Postaw kawę” / „Buy a coffee” / „Пригостити кавою”), Kontakt —
   `common.contactBtn`.

**Opis rozdziału:** krótki, bez nacisku. 21.1 — serwis jest i zostanie bezpłatny, wszystkie
funkcje dla każdego (gość i konto zarejestrowane), bez płatnych wersji. 21.2 — gdzie jest
przycisk (stopka obok Kontaktu, na telefonie sama filiżanka), dwa kroki (okno → nowa karta
`buycoffee.to`, tam kwota i płatność), notka: wsparcie dobrowolne, bez żadnych funkcji
ani korzyści; uwagi i pomysły przez Kontakt (19.6).

### PL

```html
<h2 class="m-ch" id="r21">21. O projekcie i wsparcie</h2>

<h3 class="m-h2" id="r21-1">21.1 Familiada jest bezpłatna</h3>
<p class="m-p">Familiada Online jest i zostanie bezpłatna. Wszystkie funkcje opisane w tym podręczniku są dostępne dla każdego bez opłat — zarówno na koncie gościa, jak i na koncie zarejestrowanym. Nie ma płatnych wersji ani funkcji dostępnych tylko dla wybranych.</p>

<h3 class="m-h2" id="r21-2">21.2 Postaw kawę</h3>
<p class="m-p">Jeśli lubisz korzystać z Familiady i chcesz wesprzeć jej dalszy rozwój, możesz postawić twórcy kawę. Przycisk <span class="m-btn"><i class="ico" data-icon="coffee"></i>Postaw kawę</span> znajdziesz w stopce stron serwisu, obok przycisku <span class="m-btn">Kontakt</span>. Na telefonie widać samą filiżankę.</p>
<ol class="m-ol">
<li>Kliknij <span class="m-btn"><i class="ico" data-icon="coffee"></i>Postaw kawę</span>. Otworzy się okno z krótkim wyjaśnieniem.</li>
<li>Kliknij <span class="m-btn"><i class="ico" data-icon="coffee"></i>Postaw kawę</span> w oknie. W nowej karcie otworzy się zewnętrzny serwis <span class="m-code">buycoffee.to</span>, w którym wybierasz kwotę i sposób płatności.</li>
</ol>
<div class="m-note"><p class="m-p">Wsparcie jest dobrowolne i nie daje żadnych dodatkowych funkcji ani korzyści w serwisie — jest po prostu podziękowaniem. Uwagi i pomysły na rozwój możesz przesłać przez formularz kontaktu (<a class="m-ref" href="#r19-6">rozdział 19.6</a>).</p></div>
```

### EN

```html
<h2 class="m-ch" id="r21">21. About the project and support</h2>

<h3 class="m-h2" id="r21-1">21.1 Familiada is free</h3>
<p class="m-p">Familiada Online is free and will stay free. Every feature described in this manual is available to everyone at no cost — on a guest account and on a registered account alike. There are no paid versions and no features reserved for a few.</p>

<h3 class="m-h2" id="r21-2">21.2 Buy me a coffee</h3>
<p class="m-p">If you enjoy using Familiada and would like to support its further development, you can buy the creator a coffee. You will find the <span class="m-btn"><i class="ico" data-icon="coffee"></i>Buy me a coffee</span> button in the footer of the service pages, next to the <span class="m-btn">Contact</span> button. On a phone only the cup is shown.</p>
<ol class="m-ol">
<li>Click <span class="m-btn"><i class="ico" data-icon="coffee"></i>Buy me a coffee</span>. A window with a short explanation opens.</li>
<li>Click <span class="m-btn"><i class="ico" data-icon="coffee"></i>Buy a coffee</span> in the window. The external service <span class="m-code">buycoffee.to</span> opens in a new tab, where you choose the amount and payment method.</li>
</ol>
<div class="m-note"><p class="m-p">Support is voluntary and gives no extra features or benefits in the service — it is simply a thank-you. You can send feedback and ideas through the contact form (<a class="m-ref" href="#r19-6">chapter 19.6</a>).</p></div>
```

### UK

```html
<h2 class="m-ch" id="r21">21. Про проєкт і підтримку</h2>

<h3 class="m-h2" id="r21-1">21.1 Familiada безкоштовна</h3>
<p class="m-p">Familiada Online є і залишиться безкоштовною. Усі функції, описані в цьому посібнику, доступні кожному без оплати — як на гостьовому, так і на зареєстрованому акаунті. Немає платних версій чи функцій лише для обраних.</p>

<h3 class="m-h2" id="r21-2">21.2 Пригостити кавою</h3>
<p class="m-p">Якщо вам подобається користуватися Familiada і ви хочете підтримати її подальший розвиток, можете пригостити автора кавою. Кнопку <span class="m-btn"><i class="ico" data-icon="coffee"></i>Пригостити кавою</span> ви знайдете у футері сторінок сервісу, поруч із кнопкою <span class="m-btn">Контакт</span>. На телефоні видно лише чашку.</p>
<ol class="m-ol">
<li>Натисніть <span class="m-btn"><i class="ico" data-icon="coffee"></i>Пригостити кавою</span>. Відкриється вікно з коротким поясненням.</li>
<li>Натисніть <span class="m-btn"><i class="ico" data-icon="coffee"></i>Пригостити кавою</span> у вікні. У новій вкладці відкриється зовнішній сервіс <span class="m-code">buycoffee.to</span>, де ви обираєте суму і спосіб оплати.</li>
</ol>
<div class="m-note"><p class="m-p">Підтримка добровільна і не дає жодних додаткових функцій чи переваг у сервісі — це просто подяка. Зауваження та ідеї можна надіслати через форму контакту (<a class="m-ref" href="#r19-6">розділ 19.6</a>).</p></div>
```

## Kolejność wdrożenia (cykl z CLAUDE.md)

1. Link od użytkownika → `SUPPORT_URL`.
2. Kroki 2–3 na branchu, unit, zrzuty (390/1400 px).
3. E2E z kodu brancha (`serveBranchCode`) — nowy spec `support-modal.spec.js`:
   filiżanka w stopce (strona główna, Moje gry), brak na ekranach urządzeń, okno
   otwiera się z stopki i z FAQ, „Postaw kawę” otwiera nową kartę z `SUPPORT_URL`
   (bez wchodzenia na serwis), podręcznik `?tab=help#r21`. Bez kont na stałe i bez
   `@mailbox` — może iść razem z innymi lekkimi specami.
4. Pages (push na `main`) → te same testy kontrolne na produkcji → wpis w Dzienniku.

Bez migracji i bez przerwy technicznej (zmiana jawna, zgodna wstecz).
