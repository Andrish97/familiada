# Motywy wyświetlacza

## Decyzje — 2026-10-25

Użytkownik zaakceptował podgląd v7 i polecił wdrożenie.

- Zachowane sześć wyświetlaczy treści, ich rozmiary i geometria kropek.
- Pięć nowych konstrukcji: Skrzydła, Radar, Kaseton, Wstęga i Most.
  Kontrolki to odpowiednio paski pod nazwami, pierścienie, listwy,
  świetlne krawędzie oraz wsporniki. Bez osobnych kontrolek „GRA”.
- Domyślne tło jest opcjonalną metadaną motywu. Wybór innego motywu
  ustawia jego domyślne tło, o ile je ma. Wczytanie gry i ponowne wybranie
  tego samego motywu zachowują zapisany kolor. Kolory A/B i kropek bez zmian.
- Modern nie używa koloru tła. Jego kolory pochodzą z drużyn; przejęcie
  kontroli zachowuje płynne przejście. Poziome kreski są nieruchome.
- Dwie szczeliny w Modern: przebiegi wychodzą spod małego górnego licznika,
  rozchodzą się symetrycznie w dół. Około trzech kolorowych odcinków
  na owalu, oddzielonych czernią. Połowa owalu pokonywana w 18 s;
  wzór powtarza się co 12 s. Ograniczony ruch zatrzymuje dekoracyjne animacje.
- Klasyczny pozostaje domyślnym motywem. Nowe motywy mają czytelny ciemny
  wariant Prowadzącego. Wspólny rejestr i etykiety PL/EN/UK.
- Pierwsze propozycje Neon/Studio/Złoty oraz falowanie poziomych pasków
  zostały odrzucone i nie są częścią wdrożenia.

## Korekta odstępu longów — 2026-10-26

Zlecenie użytkownika: rozsunąć longi w nowych motywach poza Kasetonem,
ponieważ ich zewnętrzne ramki nachodziły na siebie. Skrzydła, Radar,
Wstęga i Most: oba longi odsunięte symetrycznie na zewnątrz wraz z ramkami
i bezpośrednio przypisanymi kontrolkami. Po doprecyzowaniu użytkownika
odsunięcie zmniejszone: Skrzydła po 16 jednostek SVG, pozostałe po 10,
żeby została niewielka szczelina między obudowami. Treść oraz
rozmiar siatki kropek zachowane. Kaseton, Modern i Classic bez zmiany układu.

## Osobne motywy Prowadzącego — 2026-10-26

Po pytaniu o Prowadzącego użytkownik zlecił osobne wersje pięciu motywów.
Skrzydła: kanciaste ramki i boczne akcenty. Radar: zaokrąglone ramki
z pierścieniami. Kaseton: proste, podwójne mosiężne obramowania. Wstęga:
łukowe obramowania. Most: stalowe obramowania i konstrukcja kratownicy.
Kolory oprawy pochodzą z wybranego tła, akcenty i zasłona z kolorów drużyn.
Treści, kolory statusów, przewijanie, orientacja i gest odsłaniania bez zmian.
Host nadal pokazuje wyłącznie tytuł/pytanie i odpowiedzi — bez wskaźników
kontroli drużyn ani nowych informacji o grze. Podglądy rzeczywistej strony
przed publikacją, w pionie, poziomie i z aktywną zasłoną.

## Stan — wdrożone 2026-10-26

Pięć nowych motywów oraz zaakceptowana animacja Modern są na produkcji.
Classic pozostaje domyślny. Wskazówki i etykiety zaktualizowane w PL/EN/UK.
Zrzuty sześciu motywów 1400 px i ustawień 390/1440 px we wszystkich językach.

- Bramka brancha 40246237871: 2/2 ✓ — scena Display i zapis ustawień.
- Pages 40246463317 ✓ — motywy. Produkcyjny zapis ustawień
  40246531710 ✓ — domyślne tła pięciu motywów, niezmienione A/B,
  własne tło po przeładowaniu i wyłączony wybór tła w Modern.
- Kontrola Display ujawniła niezależny błąd guardu startu: zewnętrzny
  moduł statystyk Cloudflare, blokowany przez CSP, wywoływał retry strony.
  Guard reaguje teraz wyłącznie na moduły z własnej domeny. CSP bez zmian.
  Import sceny w teście używa tej samej wersji URL co entrypoint strony;
  test czeka na gotowość podglądu. Diagnostyka zachowana w specu.
- Regresja guardu unit oraz motywy/wersje/konflikty: 14/14 ✓.
  Bramka Display po poprawce 40247766872 ✓, Pages 40247875596 ✓.
- Końcowa kontrola produkcyjna Display 40247923010: 1/1 ✓ — wszystkie
  siedem motywów, geometria i treść sześciu paneli, kierunek i ruch
  szczelin, zatrzymanie przy ograniczonym ruchu, rzeczywisty kolor
  kontrolki drużyny, brak przeładowań wywołanych zewnętrznym modułem.

Wcześniejsze diagnostyczne próby Display (40246843691, 40247144128,
40247368747) nie były zielone; zamyka je poprawka guardu i końcowy przebieg.

2026-10-26: korekta odstępu longów — bramka Display 40248868515 ✓.
Pięć oddzielnych motywów Hosta — bramka 40249758651 ✓. Unit 28/28 ✓,
po synchronizacji main wersje/motywy/konflikty 10/10 ✓. Zmiany main
w modułach Display/Host to wyłącznie wersje zasobów; zmiany Realtime
zachowane. Podglądy pokazane, Wskazówki i zrzuty PL/EN/UK gotowe.
Następnie Pages i wspólna punktowa kontrola Display/Host.
