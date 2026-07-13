# Draft: Manual — Ustawienia rozgrywki + aktualizacja Panelu sterowania

Plik do recenzji przed implementacją.
Formatowanie: **pogrubienie**, _kursywa_, UWAGA (= m-warn), NOTATKA (= m-note).
Nagłówki: H2 (=== sekcja główna), H3 (--- podsekcja).

---

## ZAKŁADKA: Ustawienia rozgrywki (nowa)

Strona Ustawień rozgrywki pozwala skonfigurować grę na spokojnie — zanim wejdziesz do Panelu sterowania i zaczniesz rozgrywkę na żywo. Wszystko, co tu ustawisz, jest zapisane do gry i zostanie automatycznie wczytane przez Panel sterowania.

Otworzysz ją ze strony **Moje gry** przyciskiem **Ustawienia rozgrywki**  przy wybranej grze.

---

### Drużyny

Wpisz nazwy drużyn. Te nazwy będą wyświetlane na tablicy podczas rozgrywki oraz na urządzeniu prowadzącego. Możesz je też zmienić na początku
UWAGA Jeśli nie wpiszesz nic - zostaną wyświetlone domyślne wartości **Drużyna A** i **Drużyna B**. 

---

### Wygląd

=== Kolory

Ustalasz tu kolory czterech elementów:

- **Kolor drużyny A** i **kolor drużyny B** — kolory elementów tablicy zależnych od drużyn.
- **Kolor tła tablicy** — główne tło wyświetlacza.
- **Kolor kropek** — kolor kropek wyświetlaczy punktowych na tablicy.

Kolory zmieniają się na podglądzie natychmiast po wybraniu. Kliknij pole koloru, żeby otworzyć okno wyboru.

=== Motyw

Wybierz motyw wizualny tablicy. Motyw wpływa na styl graficzny całego wyświetlacza. Domyślny motyw to **Klasyczny**.

=== Logo

Jeśli masz stworzone własne logo (z narzędzia **Moje logo**), możesz wybrać je dla tej gry. Logo pojawia się na ekranie startowym i końcowym. Jeśli nie wybierzesz nic — wyświetlane jest domyślne logo Familiad.online.

NOTATKA Przycisk **Przywróć domyślne** w sekcji Wygląd resetuje kolory, motyw i logo do wartości domyślnych.

---

### Dźwięk

W tej sekcji konfigurujesz dźwięki używane podczas rozgrywki. Każda kategoria dźwiękowa (np. **Poprawna odpowiedź**, **Błędna odpowiedź**, **Intro**, **Przejście rundy**, **Odsłanianie**) ma własne ustawienia.

=== Wariant dźwięku

Przy każdej kategorii możesz wybrać **wariant** z listy:

- Dostępne są warianty predefiniowane (np. **Klasyczny**)
- Opcja **Własny** pozwala załadować własny plik audio (MP3, WAV, OGG) — po wybraniu jej pojawia się przycisk **Wybierz plik**

=== Własny plik audio

Po kliknięciu **Wybierz plik** wskazujesz plik z dysku. W tabeli przy danej kategorii pojawia się etykieta z nazwą pliku. 

Aby usunąć własny plik użyj przycisku **X** przy pliku.
Jeśli chcesz wrócić do wariantu predefiniowanego — zmień wariant na inny niż **Własny**, 

UWAGA: Własny plik audio jest zapisywany w chmurze razem z grą i będzie dostępny na każdym urządzeniu, na którym uruchomisz tę grę.

=== Głośność

Przy każdej kategorii jest suwak głośności (0–100%). Zmiany są zapisywane i wczytywane automatycznie przy każdej rozgrywce.

=== Przycisk odtwarzania (▶)

Obok każdej kategorii jest mały przycisk odtwarzania. Kliknij go, żeby usłyszeć wybrany dźwięk z ustawioną głośnością. Ponowne kliknięcie (■) zatrzymuje odtwarzanie.

NOTATKA Przycisk **Przywróć domyślne** w sekcji Dźwięk resetuje wszystkie warianty do **Klasycznego**, głośności do **100%** oraz usuwa wszystkie własne pliki audio (z chmury i lokalnie). UWAGA Operacja jest nieodwracalna — pliki trzeba wgrać ponownie.

### Pytania

=== Finał

Przełącznik **Czy gra zawiera finał?** decyduje, czy gra zakończy się etapem finałowym. Gdy finał jest **wyłączony**, rozgrywka kończy się po rundach zasadniczych. Gdy jest **włączony** — dostępne stają się dodatkowe opcje wyboru pytań finałowych.

=== Tryb pytań do rund

- **Losuj** — pytania do rund zostaną wylosowane automatycznie przy starcie rozgrywki. Nie musisz nic wybierać — system sam dobierze pytania z puli.
- **Wybierz** — możesz ręcznie ustalić kolejność pytań spośród dostępnych.

=== Tryb pytań do finału (gdy finał jest włączony)

- **Losuj** — 5 pytań finałowych zostanie wylosowanych automatycznie (z pominięciem pytań użytych w rundach). Losowanie odbywa się przy wejściu do kroku Podsumowanie w Panelu sterowania.
- **Wybierz** — w Panelu sterowania (krok Ustawienia → Finał) możesz wybrać dokładnie 5 pytań ręcznie i je zatwierdzić.

=== Dodatkowe ustawienia

Tu dopasowujesz parametry rozgrywki do swojego formatu. Opcje nie zmieniają zasad gry, tylko jej progi i tempo.

- **Mnożniki rund** — wpisywane po przecinku (np. `1,1,1,2,3`). Bank każdej rundy jest mnożony przez odpowiadający mnożnik. To odpowiada klasycznemu podwajaniu/potrajaniu w kolejnych etapach. Jeśli rozgrywka trwa dalej, to do wszystkich kolejnych nieuwzględnionych rund zostanie zastosowany ostatni mnożnik.
- **Cel rozgrywki** — liczba punktów, po której osiągnięciu jedna z drużyn może zakwalifikować się do finału (klasycznie: 300). Jeśli żadna drużyna nie osiągnie progu przed wyczerpaniem pytań — rundy kończą się naturalnie.
- **Cel finału** — liczba punktów do zdobycia w finale, żeby wygrać nagrodę główną (klasycznie: 200).
- **Zakończenie gry** — co wyświetlacz pokazuje po zakończeniu rozgrywki:
  - **Logo** — ekran z logo
  - **Punkty** — wynik końcowy drużyny zwycięskiej.
  - **Kwota wygranej** — obliczona kwota nagrody (dla rozgrywek z nagrodami pieniężnymi)
- **Mnożnik nagrody** — jeśli w finale drużyna nie osiągnęła celu, nagroda to punkty zdobyte w całej rozgrywce pomnożone przez ten współczynnik (klasycznie: ×3).
- **Kwota nagrody głównej** — kwota dodawana do nagrody, gdy drużyna osiągnie cel finału (klasycznie: 25 000).

NOTATKA: Dodatkowe ustawienia mają rozsądne wartości domyślne odpowiadające klasycznej Familiadzie. Dla większości rozgrywek nie musisz ich zmieniać.

=== Zapis ustawień

Zmiany są zapisywane po kliknięciu tylko **Zapisz wszytko**. Nie ma automatycznego zapisu przy samej zmianie — pamiętaj o kliknięciu przycisku przed wyjściem.

=== Przywróć domyślne (Ustawienia)

Przycisk **Przywróć domyślne** na górze strony resetuje całość ustawień do wartości domyślnych.
UWAGA: Ta czynność jest nieodwracalna, jeśli wciśniesz przypadkiem i zatwierdzisz, trzeba będzie zmieniać wszystko od nowa (w tym wgrywanie plików dźwiękowych).

---

## ZAKŁADKA: Panel sterowania — zmieniana część (sekcja „2) Ustawienia")

Poniżej **zastępuję obecną sekcję „2) Ustawienia"** nową wersją. Reszta zakładki (Wstęp, Kto co widzi, 1) Urządzenia, 3) Rundy, 4) Finał) pozostaje bez zmian.

---

### 2) Ustawienia

Gdy urządzenia są online, przechodzisz do podsumowania ustawień. Wszystkie opcje (kolory, dźwięk, parametry gry) możesz wcześniej skonfigurować na stronie **Ustawień rozgrywki** — Panel sterowania wczyta je automatycznie.

=== Nazwy drużyn

Są to napisy widoczne na wyświetlaczu, na urządzeniu prowadzącego i w wynikach. Jeśli nie wpiszesz nic w **Ustawieniach rozgrywki** to zostana wczytane domyślne wartości: **Drużyna A** i **Drużyna B**

=== Wygląd

- **Kolory** — kolory drużyn, tła i kropek.
- **Motyw** — styl wizualny tablicy.
- **Logo** — logo wyświetlane w trakcie rozgrywki.

=== Dźwięk

- Przy każdej kategorii dźwiękowej widzisz aktualny **wariant** (np. Klasyczny lub nazwę własnego pliku).
- Suwak **głośności** pozwala dostosować poziom każdego dźwięku.
- Przycisk **▶** pozwala odsłuchać dźwięk przed rozgrywką.

NOTATKA: Jeśli zmienisz poziom głośności tutaj to zostanie on zmieniony tylko dla tej konkretnej rozgrywki, przy ponownym uruchomieniu rozgrywki zostaną wczytane wartości nadane w **Ustawieniach rozgrywki**.

=== Finał

Tu zobaczysz tylko potwierdzenie czy rozgrywka ma finał.

=== Finał

Jeśli finał jest i wybrano tryb **Ręcznie** — tutaj zobaczysz wybrane przez Ciebie 5 pytań finałowych. Przy trybie **Losowe** zobaczysz wylosowane pytania finałowe.

=== Rundy: kolejność pytań

Jeśli wybrano tryb **Kolejność** dla pytań rund — tutaj będzie widoczna kolejność pytań które zostaną użyte podczas rozgrywki zasadniczej. Przy trybie **Losowe** zobaczysz wylosowane pytania rund.

NOTATKA: Zawsze możesz wcisnąć przycisk **Zmień ustawienia**, po czym otworzy się okienko ustawień, dokładniej patrz w zakładce **Ustawienia rozgrywki**.

Gdy wszystko się zgadza — kliknij **Gotowe — przejdź do rund**, żeby rozpocząć rozgrywkę.

---

_Koniec draftu. Po zatwierdzeniu: implementacja w pl.js, en.js, uk.js + odblokowanie zakładki w manual.html._
