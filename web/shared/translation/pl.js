const pl = {
  meta: {
    lang: "pl",
    label: "Polski",
    icon: "flag-pl",
  },
  common: {
    genericError: "Wystąpił błąd.",
    manualLabel: "Wskazówki",
    contactBtn: "Kontakt",
    modalBack: "Wstecz",
    languageLabel: "Język",
    backToLogin: "Wróć do logowania",
    goToPanel: "Przejdź do panelu",
    back: "Wstecz",
    next: "Dalej",
    yes: "Tak",
    no: "Nie",
    open: "Otwórz",
    copy: "Kopiuj",
    done: "Gotowe",
    loading: "Ładowanie…",
    authEntry: "Zaloguj / Załóż konto",
    logout: "Wyloguj",
    cancel: "Anuluj",
    dash: "-",
    modal: {
      confirmTitle: "Potwierdź",
      confirmText: "Na pewno?",
      confirmOk: "Tak",
      confirmCancel: "Nie",
      alertTitle: "Informacja",
      alertOk: "OK",
      promptTitle: "Wpisz",
      promptText: "Podaj wartość:",
      promptOk: "Zapisz",
      promptCancel: "Anuluj",
      closeLabel: "Zamknij",
    },
    fullscreen: "Pełny ekran",
    a2hsTitle: "Pełny ekran na iPhone",
    a2hsHost:
      "W Safari nie da się wymusić prawdziwego pełnego ekranu. Użyj <b>Udostępnij</b> → <b>Do ekranu początkowego</b>, a potem uruchom jako aplikację.",
    a2hsBuzzer:
      "W Safari nie da się wymusić prawdziwego pełnego ekranu. Użyj <b>Udostępnij</b> → <b>Do ekranu początkowego</b>.",
    a2hsOk: "OK",
    fullscreenUnavailable: "Brak dostępnego Fullscreen API.",
    rating: {
      modal: {
        title: "Jak oceniasz system?",
        sub: "Twoja opinia pomaga nam ulepszać Familiadę Online. Ocena jest anonimowa, a komentarz widoczny tylko dla administratorów.",
        commentPlaceholder: "Dodaj opcjonalny komentarz...",
        later: "Później",
        never: "Nie pytaj więcej",
        send: "Wyślij ocenę",
        error: "Wystąpił błąd podczas wysyłania oceny. Spróbuj ponownie.",
        thanksTitle: "Dziękujemy za ocenę!",
        thanksSub: "To dla nas bardzo ważne. Miłej gry!",
      },
      account: {
        title: "Twoja ocena systemu",
        hint: "Twoja dotychczasowa ocena i komentarz.",
        stars: "Gwiazdki:",
        comment: "Komentarz:",
        notRated: "Nie wystawiono jeszcze oceny.",
      },
    },
    footer: {
      left: "© {year} Familiada — system do gry na żywo",
      contactBtn: "Kontakt",
    },
  },
  contact: {
    modal: {
      title: "Napisz do nas",
      email: "Twój e-mail",
      ticket: "Numer zgłoszenia (opcjonalnie)",
      subject: "Temat",
      message: "Wiadomość",
      submit: "Wyślij",
      successTitle: "Wysłano!",
      ticketLabel: "Numer zgłoszenia:",
      addedTo: "Dodano do zgłoszenia:",
      ticketPlaceholder: "np. 2026-0001",
      errEmail: "Podaj poprawny adres e-mail.",
      errMessage: "Wiadomość jest za krótka (min. 5 znaków).",
      errSubject: "Podaj temat.",
      attachments: "Załączniki (opcjonalnie, maks. 5 plików, 5 MB każdy)",
      chooseFiles: "Wybierz pliki",
    },
  },
  deviceGuard: {
    title: "Niedostępne na telefonie",
    message: "Ta strona potrzebuje większego ekranu. Przełącz się na komputer albo tablet.",
    rotateTitle: "Obróć tablet",
    rotateMessage: "Ta strona działa w poziomie. Obróć tablet — strona pojawi się sama.",
    narrowTitle: "Za wąskie okno",
    narrowMessage: "Poszerz okno przeglądarki, żeby korzystać z tej strony.",
    back: "Wróć",
  },
  guestGuard: {
    title: "Niedostępne w koncie gościa",
    message: "Ta sekcja jest dostępna tylko dla zarejestrowanych użytkowników. Zaloguj się lub załóż konto, aby korzystać z udostępniania, subskrypcji i Centrum ankiet.",
    back: "Wróć do moich gier",
    login: "Zaloguj / Załóż konto",
  },
  resourceLock: {
    title: "Zajęte w innym miejscu",
    back: "Wróć",
    goneTitle: "Zasób został usunięty",
    goneMessage: "To, co próbujesz otworzyć, zostało w międzyczasie usunięte gdzie indziej.",
    forbiddenTitle: "Utracono dostęp do edycji",
    forbiddenMessage: "Twoje uprawnienia do edycji tego zasobu zostały cofnięte w trakcie tej sesji.",
    // Wspólny komunikat dla gry — edytor, ustawienia (i docelowo ankieta/
    // control) wzajemnie się wykluczają dla tej samej gry, więc komunikat
    // rozróżnia tylko TYP zasobu, nie która konkretnie strona trzyma blokadę.
    gameMessage: "Ta gra jest właśnie używana w innej karcie lub przez inne urządzenie.",
    logoMessage: "To logo jest właśnie edytowane w innej karcie lub przez inne urządzenie.",
    // Zgłoszone: w Control/ustawieniach gry operator NIE wie, które
    // konkretnie logo jest zablokowane (gra może korzystać z dowolnego
    // logo z puli) — w odróżnieniu od logoMessage (edytor logo, gdzie
    // zawsze chodzi o jedno, wprost otwarte logo), ten komunikat celowo
    // NIE sugeruje jednego, konkretnego logo.
    logoInUseMessage: "Loga są właśnie edytowane lub zajęte w innym miejscu.",
    baseItemMessage: "Ten element bazy jest właśnie edytowany w innej karcie lub przez innego użytkownika.",
    // Cała pula logo użytkownika jest blokowana, gdy Control lub
    // game-settings.js mają aktywną którąkolwiek jego grę — niezależnie od
    // tego, czy TO logo jest przez nią referencowane.
    logoPoolBusyControl: "Nie możesz edytować ani usunąć logo, bo prowadzisz rozgrywkę.",
    logoPoolBusySettings: "Nie możesz edytować ani usunąć logo, bo zmieniasz ustawienia rozgrywki.",
  },
  guestInfo: {
    title: "Konto gościa",
    subtitle: "Zanim zaczniesz — kilka ważnych informacji:",
    warning1: "Twoje dane są zapisane <strong>tylko w tej przeglądarce</strong>. Wyczyszczenie historii (cookies) spowoduje utratę dostępu do konta.",
    warning2: "Konto zostanie <strong>usunięte po 5 dniach</strong> od ostatniego logowania.",
    migrateTitle: "Jak zachować swoje dane",
    step1: "Kliknij swoją nazwę użytkownika w prawym górnym rogu",
    step2: "Wybierz <em>Zaloguj\u00A0/\u00A0Załóż konto</em>",
    step3: "Podaj adres e-mail i hasło — zostaniesz zapytany o migrację danych",
    step4: "Po potwierdzeniu adresu e-mail wszystkie Twoje dane zostaną automatycznie przeniesione",
    ok: "Rozumiem",
  },
  guestReminder: {
    text: "Konto gościa zostanie usunięte za kilka dni. Zapisz swoje dane, zanim je stracisz.",
    link: "Migruj teraz",
    dismiss: "Nie pokazuj więcej",
    close: "Zamknij",
  },
    home: {
    title: "Familiada Online — system do prowadzenia gry na żywo",
    nav: {
      label: "Nawigacja sekcji",
      about: "O systemie",
      features: "Funkcje",
      forwhom: "Dla kogo",
      faq: "FAQ",
    },
    hero: {
      title: "Darmowa Familiada Online. Prawdziwy teleturniej na Twoim sprzęcie.",
      lead: "Najlepszy system do gry w Familiadę: zbierz odpowiedzi od uczestników w ankiecie, a potem poprowadź grę na żywo. Idealna gra na wesele, urodziny i imprezę firmową. Wszystko w przeglądarce.",
      ctaStart: "Zacznij tworzyć gry i prowadzić rozgrywkę",
      ctaStartTitle: "Rozpocznij tworzenie własnej Familiady",
      ctaMarketplace: "Przeglądaj Gry Społeczności",
      ctaMarketplaceTitle: "Przeglądaj gotowe zestawy pytań do Familiady",
      ctaConnectTitle: "Podłącz urządzenie do rozgrywki",
      note: "Dostępny tryb gościa — darmowa Familiada bez rejestracji.",
    },
    imageViewer: { open: "Powiększ obraz: {title}" },
    about: {
      title: "Familiada Online — darmowy generator pytań i gra na żywo",
      p1: "Nasz system pozwala zorganizować własną grę w stylu Familiada od początku do końca. To idealne rozwiązanie jako atrakcja na wesele, urodziny czy integrację. Generator pytań pozwala na tworzenie własnych baz lub korzystanie z gotowych zestawów.",
      p2: "Odpowiedzi uczestników zbierane są przez ankietę online — każdy bierze udział w ankiecie przez link lub kod QR ze swojego telefonu. Wyniki są automatycznie normalizowane do 100 punktów, dokładnie jak w prawdziwym teleturnieju.",
      p3Start: "Do prowadzenia gry wystarczą urządzenia, które już masz — rzutnik lub telewizor jako Wyświetlacz, tablet dla prowadzącego i telefon jako Przycisk do pojedynku. Możesz także skorzystać z",
      p3Link: "gotowych pytań do Familiady",
      p3End: "stworzonych przez naszą społeczność.",
    },
    tiles: {
      title: "Jak zorganizować Familiadę? (Krok po kroku)",
      t1: {
        alt: "Tworzenie nowej gry Familiada online - wybór trybu ankiety lub gry preparowanej",
        t: "Własny generator pytań i tryby gry",
        d: "Wybierz, jak chcesz zbierać odpowiedzi. Ankieta tekstowa i Punktacja zbierają wyniki od prawdziwych ludzi, a gra preparowana pozwala szybko wpisać własne pytania i punkty.",
      },
      t2: {
        alt: "Edytor pytań do Familiady - konfiguracja punktów i odpowiedzi",
        t: "Intuicyjna edycja pytań",
        d: "Dodawaj pytania, ustalaj liczbę odpowiedzi i konfiguruj strukturę gry. System zadba o to, by Twoja gra wyglądała profesjonalnie na każdym ekranie.",
      },
      t3: {
        alt: "Współpraca przy tworzeniu gry — subskrypcje i udostępnianie ankiet",
        t: "Subskrypcje i wspólne bazy pytań",
        d: "Korzystaj z subskrypcji, aby wspólnie pracować nad ankietami i bazami pytań. Idealne przy organizacji dużych wydarzeń firmowych czy wesel.",
      },
      t4: {
        alt: "Ankieta online z kodem QR - zbieranie odpowiedzi od gości",
        t: "Ankieta online i zbieranie głosów",
        d: "Pokaż kod QR gościom — mogą brać udział w ankiecie ze swoich telefonów bez instalacji aplikacji. Wyniki spływają na żywo, a system automatycznie normalizuje punkty do 100.",
      },
      t5: {
        alt: "Centrum ankiet: zarządzanie ankietami, podgląd postępu, udostępnianie linkiem lub QR.",
        t: "Centrum ankiet",
        d: "W jednym miejscu uruchamiasz i zamykasz ankiety, śledzisz postęp i udostępniasz ankiety subskrybentom. Wszystko gotowe zanim wejdziesz na salę.",
      },
      t6: {
        alt: "Panel sterowania operatora: otwieranie rund, odkrywanie odpowiedzi, punkty i błędy X.",
        t: "Panel sterowania (operator) — gra na żywo",
        d: "Operator otwiera rundy, odkrywa odpowiedzi, przyznaje punkty i zatwierdza błędy (X). Panel prowadzi przez kolejne etapy — nawet pierwszy raz nie zgubisz się w trakcie gry.",
      },
      t7: {
        alt: "Tablica dla widzów: pytanie, zakryte odpowiedzi odsłaniające się jedna po drugiej, bank punktów i błędy X.",
        t: "Tablica dla widzów (TV / rzutnik)",
        d: "To co widzą wszyscy na sali — pytanie, zakryte odpowiedzi które odsłaniają się jedna po drugiej, bank punktów i błędy X. Podłącz do telewizora lub rzutnika i masz prawdziwy teleturniej.",
      },
      t8: {
        alt: "Widok prowadzącego: treść pytania i podgląd odpowiedzi na tablecie lub telefonie.",
        t: "Widok prowadzącego (tablet / telefon)",
        d: "Prowadzący ma osobny ekran z treścią pytań i podglądem odpowiedzi — bez ryzyka przypadkowego kliknięcia w sterowanie grą.",
      },
      t9: {
        alt: "Przycisk do pojedynku: osobne urządzenie sygnalizujące, kto nacisnął pierwszy.",
        t: "Przycisk do pojedynku (osobne urządzenie)",
        d: "Osobny „przycisk\" daje sygnał kto nacisnął pierwszy w pojedynku. Żadnych sporów — ekran pokazuje zwycięzcę, gra toczy się dalej.",
      },
      t10: {
        alt: "Bazy pytań: wspólna biblioteka z folderami i tagami, udostępniana subskrybentom.",
        t: "Bazy pytań i współpraca",
        d: "Baza to wspólna biblioteka pytań do wielokrotnego użytku. Organizujesz ją w foldery i tagi, udostępniasz subskrybentom — i nie musisz za każdym razem zaczynać od zera.",
      },
      t11: {
        alt: "Menedżer pytań: foldery, kopiowanie, przenoszenie i wyszukiwanie jak w eksploratorze plików.",
        t: "Menedżer pytań jak eksplorator plików",
        d: "Zarządzasz pytaniami jak w Finder/Explorer: foldery, przenoszenie, kopiowanie, szybka selekcja i wyszukiwanie po nazwie oraz tagach.",
      },
      t12: {
        alt: "Edytor logo: tworzenie własnego logo wyświetlanego na tablicy podczas gry.",
        t: "Własne logo na wyświetlaczu",
        d: "Stwórz własne logo wyświetlane podczas rozgrywki — na ekranie startowym lub zakończenia. Napisy, proste grafiki lub importowany obraz.",
      },
    },
    forwhom: {
      title: "Dla kogo jest Familiada Online?",
      t1: { t: "Wydarzenia firmowe i integracje", d: "Familiada to sprawdzony format na integrację zespołu — angażuje wszystkich, rozśmiesza i nie wymaga żadnego doświadczenia od uczestników. Przygotuj grę przed wydarzeniem, zbierz odpowiedzi w ankiecie i poprowadź rozgrywkę na żywo." },
      t2: { t: "Animatorzy i wodzirejowie", d: "Prowadzisz wydarzenia zawodowo i potrzebujesz narzędzia które nie zawiedzie przed klientem. Panel operatora, osobny widok prowadzącego i tablica wyników działają niezależnie — każdy skupia się na swojej roli." },
      t3: { t: "Szkoły i konkursy wiedzy", d: "Nauczyciele i animatorzy używają systemu do prowadzenia konkursów klasowych i szkolnych. Ankieta zbiera odpowiedzi uczniów, a tablica wyników buduje napięcie podczas rozgrywki." },
      t4: { t: "Wesela i urodziny", d: "Familiada jako atrakcja na weselu lub urodzinach — goście odpowiadają w ankiecie przed imprezą, a gra na żywo bawi wszystkich przy stole. Wystarczy telefon, zero technikaliów dla gości." },
      t5: { t: "Konferencje i wydarzenia sceniczne", d: "Panel operatora i osobny widok prowadzącego pozwalają płynnie poprowadzić grę na dużej scenie. Tablica wyników działa na dowolnym ekranie — TV, rzutniku lub monitorze." },
      t6: { t: "Domy kultury i świetlice", d: "Cykliczna atrakcja dla społeczności lokalnej — na wieczorze gier, festynie lub spotkaniu integracyjnym. Nie wymaga żadnego specjalistycznego sprzętu ani przygotowania technicznego." },
      t7: { t: "Grupy znajomych", d: "Impreza urodzinowa, spotkanie przy stole, wieczór w większym gronie. Familiada angażuje wszystkich naraz — nawet tych którzy zwykle nie grają. Przygotuj grę preparowaną z gotowymi pytaniami i wszyscy mogą grać nie znając odpowiedzi z góry." },
      t8: { t: "Organizacje i stowarzyszenia", d: "Zebrania, integracje, wydarzenia dla wolontariuszy. Familiada to dobry sposób na rozluźnienie atmosfery i wciągnięcie wszystkich — niezależnie od wieku i doświadczenia z grami." },
    },
    faq: {
      title: "Najczęstsze pytania",
      cat1: "Ogólne",
      cat2: "Przygotowanie i ankieta",
      cat3: "Sprzęt i wymagania",
      cat4: "Rozgrywka na żywo",
      q1:  { q: "Czy Familiada Online jest bezpłatna?", a: "Tak, w pełni bezpłatna. Możesz tworzyć gry, zbierać ankiety i prowadzić rozgrywkę bez żadnych opłat." },
      q2:  { q: "Czy trzeba instalować aplikację?", a: "Nie. System działa w przeglądarce na każdym urządzeniu — komputerze, tablecie i telefonie. Żadnej instalacji, żadnej konfiguracji." },
      q3:  { q: "W jakich językach działa system?", a: "Interfejs jest dostępny po polsku, angielsku i ukraińsku. Język zmienia się automatycznie na podstawie ustawień przeglądarki lub ręcznego wyboru." },
      q4:  { q: "Czy trzeba zakładać konto?", a: "Nie. W trybie gościa możesz tworzyć gry, zbierać odpowiedzi i prowadzić rozgrywkę. Udostępnianie baz, subskrypcje i funkcje społecznościowe wymagają konta zarejestrowanego. Rejestracja odbywa się przez e-mail i hasło — bez logowania przez Google." },
      q5:  { q: "Co dokładnie znaczy tryb gościa?", a: "To tymczasowe konto tworzone bez podawania e-maila. Gry i pozostałe dane są zapisywane na serwerze, ale dostęp do konta jest powiązany z sesją w tej przeglądarce. Po wyczyszczeniu danych przeglądarki lub zmianie urządzenia nie odzyskasz tego dostępu. Nieaktywne konto gościa może zostać usunięte po 5 dniach." },
      q6:  { q: "Czy historia gier jest zapisywana?", a: "Tak. Gry gościa są zapisywane na serwerze, lecz dostęp do nich zależy od sesji tej przeglądarki i konto może wygasnąć po 5 dniach bez aktywności. Konto zarejestrowane pozwala logować się i korzystać ze swoich gier na różnych urządzeniach." },
      q7:  { q: "Ile czasu zajmuje przygotowanie gry?", a: "W grze preparowanej — wpisujesz pytania i odpowiedzi, gotowe w kilkanaście minut. W grze ankietowej dochodzi etap zbierania głosów, który trwa tyle ile zdecydujesz — godzinę, dzień, tydzień. Samo prowadzenie rozgrywki na żywo to zwykle od 20 minut wzwyż." },
      q8:  { q: "Czy mogę użyć własnych pytań?", a: "Tak. Możesz tworzyć pytania w edytorze, organizować je w bazach z folderami i tagami oraz używać wielokrotnie. Możesz też dodać gotową grę z katalogu Gry Społeczności do swojej biblioteki." },
      q9:  { q: "Czy jest limit pytań lub gier?", a: "Nie ma limitu gier ani pytań. Jedna gra preparowana może być używana wielokrotnie — jeśli masz kilka gotowych, możesz rozgrywać je jedną po drugiej bez ograniczeń." },
      q10: { q: "Ile odpowiedzi może być na tablicy?", a: "W grze preparowanej od 3 do 6 — wybierasz sam przy tworzeniu. W grze ankietowej zależy to od ankietowanych — system bierze najpopularniejsze odpowiedzi po normalizacji do 100 punktów." },
      q11: { q: "Czy można edytować pytania po zebraniu ankiety?", a: "Możliwości edycji są ograniczone — głosy są przypisane do konkretnych pytań i odpowiedzi. Jeśli potrzebujesz pełnej edycji, możesz wyeksportować wyniki ankiety i wgrać je jako grę preparowaną — wtedy możesz swobodnie modyfikować odpowiedzi i punkty." },
      q12: { q: "Ile osób może odpowiadać w ankiecie?", a: "Nie ma limitu — przez link lub kod QR mogą głosować dziesiątki lub setki osób jednocześnie." },
      q13: { q: "Czy uczestnicy mogą widzieć wyniki ankiety przed grą?", a: "Nie powinni — to kluczowe dla zabawy. Uczestnicy rozgrywki zgadują odpowiedzi ankietowanych, więc jeśli znają wyniki z góry, gra traci sens. Zadbaj żeby ankietowani i gracze to były różne grupy ludzi." },
      q14: { q: "Jak dokładnie działa normalizacja do 100 punktów?", a: "Po zebraniu głosów system przelicza każdą odpowiedź proporcjonalnie tak, żeby suma wynosiła 100. Jeśli 40% ankietowanych odpowiedziało 'pies' — na tablicy pojawia się 40 punktów. Mniej popularne odpowiedzi dostają mniej. Dokładnie jak w telewizji." },
      q15: { q: "Czy dane z ankiety można zobaczyć przed grą?", a: "Tak. Na stronie ankiety widzisz wyniki na bieżąco — które odpowiedzi zdobywają najwięcej głosów i jaki jest postęp zbierania. Ty decydujesz, kiedy zamknąć ankietę i przejść do gry." },
      q16: { q: "Ile urządzeń potrzebuję?", a: "Obowiązkowe są dwa: komputer z Panelem sterowania i Wyświetlacz (TV lub rzutnik). Widok prowadzącego na tablecie lub telefonie to wygodne ułatwienie, ale nie jest konieczny — rozgrywkę można prowadzić bezpośrednio z Panelu sterowania. Przycisk do pojedynku jest opcjonalny: zamiast niego można użyć przycisku fizycznego, a o pierwszeństwie decyduje operator." },
      q17: { q: "Czy urządzenia muszą być w tej samej sieci?", a: "Nie. Łączą się przez internet i mogą być w różnych sieciach — wygodniejsze niż rozwiązania oparte na Bluetooth czy lokalnym Wi‑Fi." },
      q18: { q: "Ile osób powinno być w drużynie?", a: "Gra zakłada dwie drużyny. Optymalna liczba to 3–6 osób w każdej — najlepiej równa po obu stronach. Poniżej 3 jest smutno, powyżej 6 niekomfortowo. Technicznie możliwe są nawet jednoosobowe drużyny." },
      q19: { q: "Ile trwa rozgrywka na żywo?", a: "Zależy od prowadzącego, liczby pytań i tempa gry. Minimalna rozgrywka to około 20 minut — możesz dowolnie regulować czas wybierając liczbę pytań i próg punktowy. Nie ma sztywnych ram czasowych." },
      q20: { q: "Czy można zagrać kilka gier pod rząd?", a: "Tak, bez ograniczeń. Jedna gra preparowana może być używana wielokrotnie, a jeśli masz kilka gotowych, możesz je rozgrywać jedną po drugiej." },
      q21: { q: "Czy można przerwać grę i wrócić do niej później?", a: "Nie. Jeśli zamkniesz Panel sterowania, rozgrywkę trzeba zacząć od nowa. Zaplanuj ją tak, aby odbyła się w jednym ciągłym bloku." },
      q22: { q: "Jak działają błędy X?", a: "Dokładnie jak w oryginalnej Familiadzie. Grająca drużyna może popełnić łącznie do 3 błędów — czyli odpowiedzi których nie ma na tablicy. Przy trzecim błędzie drużyna przeciwna ma szansę na przejęcie banku punktów jedną odpowiedzią." },
      q23: { q: "Jak wygląda finał?", a: "Klasyczny finał jak w telewizji. Zwycięska drużyna wybiera dwóch uczestników — jeden wychodzi, drugi szybko odpowiada na 5 pytań. Potem wraca pierwszy uczestnik, nie znając poprzednich odpowiedzi. Porównujemy wyniki z ankietą. Cel to 200 punktów łącznie — lub próg ustawiony przez operatora." },
      q24: { q: "Czy operator musi znać pytania z góry?", a: "Nie musi — pytania i odpowiedzi są widoczne w Panelu sterowania podczas rozgrywki. W praktyce operatorem najczęściej zostaje osoba, która przygotowała grę. System intuicyjnie prowadzi przez kolejne etapy, więc trudno się zgubić nawet za pierwszym razem." },
      q25: { q: "Czy operator może jednocześnie być prowadzącym?", a: "Technicznie tak — oba widoki działają na osobnych urządzeniach. Jednak system jest zaprojektowany z myślą o rozdzieleniu tych ról: operator skupia się na sterowaniu, prowadzący na publiczności i graczach. Łączenie ról jest możliwe, ale wpłynie na jakość prowadzenia gry." },
      q26: { q: "Co się dzieje gdy internet przestanie działać w trakcie gry?", a: "System wymaga stałego połączenia z internetem. Przy chwilowej utracie połączenia widoki mogą przestać się aktualizować. Zalecamy stabilne Wi‑Fi lub LTE dla wszystkich urządzeń biorących udział w rozgrywce." },
      q27: { q: "Czy można dostosować wygląd tablicy wyników?", a: "Możesz dostosować kolory drużyn i kolor tła tablicy dla każdej rozgrywki. Możesz też dodać własne logo. Pełna personalizacja układu nie jest dostępna — tablica ma stały styl wzorowany na oryginalnej Familiadzie." },
      q28: { q: "Czy mogę prowadzić grę zdalnie?", a: "Technicznie tak — każdy widok działa przez przeglądarkę. Ale sens jest ograniczony, bo Familiada to przede wszystkim teleturniej z atmosferą na żywo — operator, prowadzący i uczestnicy powinni być razem. Jeśli decydujesz się na grę zdalną, potrzebujesz dodatkowej wideorozmowy — to już we własnym zakresie." },
    },
    footer: {
      left: "© {year} Familiada — system do gry na żywo",
      privacy: "Polityka prywatności",
    },
  },
  auth: {
    emailNotConfirmed: "Potwierdź e-mail (link w skrzynce).",
    invalidCredentials: "Zły e-mail lub hasło.",
    unknownEmail: "Nie znam takiego e-maila lub konto nie istnieje.",
    unknownUsername: "Nie znam takiej nazwy użytkownika.",
    loginFailed: "Nie udało się zalogować.",
    tooManyRequests: "Za dużo prób. Spróbuj ponownie później.",
    errSecurityOnceEvery: "Ze względów bezpieczeństwa możesz poprosić o to tylko raz na {seconds} sekund.",
    errEmailRateLimitExceeded: "Przekroczono limit wysyłania e-maili. Spróbuj ponownie później.",
    linkInvalidOrExpired: "Link jest nieprawidłowy lub wygasł.",
    passwordMustDiffer: "Nowe hasło musi być inne niż poprzednie.",
    passwordTooShort: "Hasło jest za krótkie.",
    passwordTooShortMin: "Hasło musi mieć co najmniej {min} znaków.",
    userAlreadyRegistered: "Ten e-mail jest już zarejestrowany.",
    confirmEmailFirst: "Najpierw potwierdź e-mail.",
    enterUsername: "Podaj nazwę użytkownika.",
    usernameMin: "Nazwa użytkownika: min. 3 znaki.",
    usernameMax: "Nazwa użytkownika: max. 20 znaków.",
    usernameChars: "Dozwolone znaki: litery, cyfry, _ . -",
    usernameReservedGuest: "Prefiks guest_ jest zarezerwowany.",
    passwordHintMin: "min. 8 znaków",
    passwordHintLower: "mała litera",
    passwordHintUpper: "duża litera",
    passwordHintNumber: "cyfra",
    passwordHintSpecial: "znak specjalny",
    passwordRules: "Hasło musi zawierać: {hints}.",
  },
  index: {
    backHome: "Strona główna",
    intro: "Aby tworzyć gry i prowadzić rozgrywkę na żywo — zaloguj się. Nie masz konta? Zarejestruj się poniżej.",
    title: "Familiada — logowanie",
    statusChecking: "Sprawdzam sesję…",
    statusGuestSession: "Aktywna sesja gościa: {who}.",
    statusLoggedOut: "Niezalogowany.",
    btnLogin: "Zaloguj",
    btnRegister: "Zarejestruj",
    btnRegisterGuestEmail: "Wyślij link",
    btnToggleRegister: "Załóż konto",
    btnToggleLogin: "Mam konto",
    btnGuest: "Wejdź jako gość",
    placeholderLogin: "E-mail lub nazwa użytkownika",
    placeholderEmail: "E-mail",
    placeholderPassword: "Hasło",
    placeholderPasswordRepeat: "Powtórz hasło",
    btnForgot: "Przypomnij hasło",
    setupTitle: "Pierwsze logowanie",
    setupPrompt: "Ustaw nazwę użytkownika",
    setupSub: "Będzie widoczna w panelu oraz przy zaproszeniach.",
    setupGuestPrompt: "Zmień nazwę użytkownika",
    setupGuestSub: "Twoja obecna nazwa gościa (guest_…) jest tymczasowa. Ustaw własną nazwę.",
    placeholderUsername: "Nazwa użytkownika",
    btnUsernameSave: "Zapisz nazwę",
    passwordSetupTitle: "Dokończ rejestrację",
    passwordSetupPrompt: "Ustaw hasło",
    passwordSetupSub: "Użyj hasła zgodnego z zasadami bezpieczeństwa.",
    passwordNew: "Nowe hasło",
    passwordRepeat: "Powtórz nowe hasło",
    btnPasswordSave: "Zapisz hasło",
    errMissingLogin: "Podaj e-mail/nazwę użytkownika i hasło.",
    errPendingEmailChange: "Zmieniałeś adres e-mail. Zaloguj się nowym adresem.",
    errInvalidEmail: "Podaj poprawny e-mail.",
    errPasswordMismatch: "Hasła nie są takie same.",
    errPasswordMissing: "Podaj hasło.",
    statusRegistering: "Rejestruję…",
    statusCheckEmail: "Sprawdź e-mail (link aktywacyjny). Jeśli nie widzisz wiadomości, zajrzyj do folderu spam.",
    statusLoggingIn: "Loguję…",
    statusError: "Błąd.",
    errResetMissingLogin: "Podaj e-mail lub nazwę użytkownika do resetu.",
    statusResetSending: "Wysyłam link resetu…",
    statusResetSent: "Wysłano link resetu hasła. Jeśli nie widzisz wiadomości, zajrzyj do folderu spam.",
    statusSavingUsername: "Zapisuję nazwę…",
    errUsernameTaken: "Ta nazwa użytkownika jest już zajęta.",
    errNoSession: "Brak aktywnej sesji.",
    resetCooldown: "Ponowna wysyłka możliwa za {time}.",
    errResetCooldown: "Link już został wysłany. Spróbuj ponownie za {time}.",
    guestExpired: "Sesja gościa wygasła po okresie braku aktywności. Wejdź ponownie jako gość.",
    guestDeletedByInactivity: "Twoje konto gościa zostało usunięte z powodu braku aktywności. Możesz utworzyć nowe konto gościa lub zarejestrować się.",
    guestMigrateTitle: "Przenieść konto gościa?",
    guestMigrateText: "Wykryto aktywne konto gościa. Czy chcesz przenieść obecne dane i zamienić je w konto zarejestrowane z e-mailem i hasłem?\n\nJeśli dane gościa są ważne, możesz je wcześniej wyeksportować.",
    guestMigrateConfirmEmail: "Wysłano wiadomość potwierdzającą e-mail. Po potwierdzeniu zaloguj się ponownie i dokończ ustawienie nazwy użytkownika.",
    guestMigrateConfirmEmailNoPassword: "Wysłano e-mail potwierdzający. Po potwierdzeniu ustawisz hasło i dokończysz rejestrację.",
    guestMigrateOk: "Tak, przenieś dane",
    guestMigrateCancel: "Nie",
    errResendCooldown: "Możesz wysłać ponownie za {time}.",
    errResendCooldownGeneric: "Możesz wysłać ponownie później.",
    pendingEmailTitle: "Rejestracja w toku",
    pendingEmailText: "Rejestracja lub migracja jest już w toku dla adresu {email}.\n\nPonowna wysyłka jest możliwa raz na 1h. Wysłać wiadomość e-mail ponownie?",
    pendingEmailOk: "Wyślij ponownie",
    pendingEmailCancel: "Anuluj",
    pendingEmailResent: "Wysłano wiadomość potwierdzającą e-mail. Sprawdź skrzynkę (i folder spam).",
    emailAlreadyRegistered: "Konto już istnieje. Przełączam na logowanie.",
    captchaTitle: "Potwierdź, że jesteś człowiekiem",
    captchaText: "Aby kontynuować, wykonaj weryfikację CAPTCHA.",
    captchaOk: "Kontynuuj",
    captchaCancel: "Anuluj",
    captchaRequired: "Aby kontynuować, wykonaj weryfikację CAPTCHA.",
    captchaStatusPending: "Weryfikacja CAPTCHA: oczekiwanie…",
    captchaStatusOk: "Weryfikacja CAPTCHA: OK",
    captchaError: "Błąd weryfikacji CAPTCHA. Odśwież stronę i spróbuj ponownie.",
    forceAuthInfo: "Ta sekcja jest dostępna tylko dla zarejestrowanych użytkowników. Zaloguj się lub załóż konto.",
      guestSessionLossTitle: "Aktywna sesja gościa",
      guestSessionLossText: "Masz aktywne konto gościa: {who}.\n\nJeśli teraz się zalogujesz, na zawsze stracisz dane gościa. Wyeksportuj je, jeśli są ważne.\n\nKontynuować logowanie?",
      guestSessionLossOk: "Zaloguj i usuń konto gościa",
      guestSessionLossCancel: "Anuluj",
      guestSessionLossCancelled: "Anulowano. Pozostałeś w trybie gościa.",
  },
  confirm: {
    title: "Familiada — potwierdzenie konta",
    subtitle: "Potwierdzenie konta",
    statusChecking: "Sprawdzam link…",
    hint: "Jeśli link wygasł, spróbuj zalogować się ponownie albo poproś o reset hasła.",
    sessionInfo: "Masz aktywną sesję — nie przeszkadza w potwierdzeniu linków.",
    linkAlreadyUsed: "Ten link został już użyty.",
    linkAlreadyUsedHint: "Jeśli to zmiana e-maila, potwierdź drugi link z drugiej skrzynki.",
    linkInvalid: "Link jest nieprawidłowy lub wygasł.",
    emailChangeCancelled: "Zmiana adresu e-mail została anulowana.",
    emailChangeCancelledHint: "Link potwierdzający jest już nieważny. Możesz zainicjować nową zmianę w ustawieniach konta.",
    firstLinkConfirmed: "Potwierdzono pierwszy link.",
    firstLinkConfirmedHint: "Potwierdź drugi link z drugiej skrzynki (może być na innym urządzeniu). Dopiero wtedy zalogujesz się na nowy e-mail.",
    checkOtherEmail: "Sprawdź drugi adres e-mail, aby dokończyć zmianę.",
    activating: "Aktywuję konto…",
    done: "Gotowe! Konto potwierdzone.",
    savedNoSession: "Potwierdzenie zapisane. Zaloguj się ponownie.",
    failed: "Nie udało się potwierdzić konta.",
    missingCode: "Brak kodu w linku.",
    missingCodeHint: "Wygląda na to, że link jest niepełny albo został już użyty.",
    confirmedNoSession: "Konto potwierdzone, ale brak sesji.",
    sessionSwitchTitle: "Aktywna sesja na tym urządzeniu",
    sessionSwitchText: "Na tym urządzeniu jesteś zalogowany jako: {who}.\n\nKontynuacja potwierdzania może przełączyć konto w tej przeglądarce.\n\nAby kontynuować, wylogujemy bieżące konto. Kontynuować?",
    sessionSwitchGuestText: "Na tym urządzeniu jesteś zalogowany jako gość: {who}.\n\nKontynuacja może przełączyć konto w tej przeglądarce i spowoduje utratę danych gościa. Wyeksportuj je, jeśli są ważne.\n\nAby kontynuować, wylogujemy konto gościa. Kontynuować?",
    sessionSwitchOk: "Wyloguj i kontynuuj",
    sessionSwitchCancel: "Anuluj",
    sessionSwitchCancelled: "Anulowano",
    sessionSwitchCancelledHint: "Jeśli chcesz, otwórz link w prywatnym oknie albo wyloguj się i spróbuj ponownie.",
  },
  reset: {
    title: "Familiada — reset hasła",
    subtitle: "Ustaw nowe hasło",
    statusChecking: "Sprawdzam link…",
    statusVerifying: "Weryfikuję link resetu…",
    missingCode: "Brak kodu w linku.",
    missingCodeHint: "Wygląda na to, że link jest niepełny albo wygasł.",
    startFailed: "Nie udało się rozpocząć resetu.",
    noSession: "Brak sesji po weryfikacji linku.",
    linkOk: "Link OK. Ustaw nowe hasło.",
    verifyFailed: "Nie udało się zweryfikować linku.",
    errPasswordMismatch: "Hasła nie są takie same.",
    statusSaving: "Zapisuję nowe hasło…",
    statusSaved: "Hasło zmienione. Wracam do logowania…",
    saveFailed: "Błąd zapisu hasła.",
    hint: "Po zapisaniu hasła wrócisz do logowania.",
    placeholderNewPassword: "Nowe hasło",
    placeholderRepeatPassword: "Powtórz nowe hasło",
    btnSavePassword: "Zapisz hasło",
    sessionSwitchTitle: "Aktywna sesja na tym urządzeniu",
    sessionSwitchText: "Na tym urządzeniu jesteś zalogowany jako: {who}.\n\nKontynuacja resetu hasła może przełączyć konto w tej przeglądarce.\n\nAby kontynuować, wylogujemy bieżące konto. Kontynuować?",
    sessionSwitchGuestText: "Na tym urządzeniu jesteś zalogowany jako gość: {who}.\n\nKontynuacja resetu hasła może przełączyć konto w tej przeglądarce i spowoduje utratę danych gościa. Wyeksportuj je, jeśli są ważne.\n\nAby kontynuować, wylogujemy konto gościa. Kontynuować?",
    sessionSwitchOk: "Wyloguj i kontynuuj",
    sessionSwitchCancel: "Anuluj",
    sessionSwitchCancelled: "Anulowano",
    sessionSwitchCancelledHint: "Jeśli chcesz, otwórz link w prywatnym oknie albo wyloguj się i spróbuj ponownie.",
  },
  account: {
    migrateTitle: "Zapisz swoje dane",
    migrateHint: "Podaj e-mail i hasło (opcjonalnie także nazwę użytkownika), aby zamienić konto gościa w konto zarejestrowane — Twoje gry, bazy pytań i pliki zostaną zachowane.",
    migrateUsernamePlaceholder: "Nazwa użytkownika (opcjonalnie)",
    migrateEmailPlaceholder: "Twój e-mail",
    migratePasswordPlaceholder: "Hasło",
    migratePasswordRepeatPlaceholder: "Powtórz hasło",
    migrateButton: "Migruj konto",
    migratePendingHint: "Wysłaliśmy link potwierdzający na {email}. Kliknij go, aby dokończyć migrację.",
    migrateResend: "Wyślij ponownie",
    migrateCancel: "Anuluj",
    statusMigrating: "Wysyłam link potwierdzający…",
    statusMigrateSent: "Wysłano! Sprawdź wiadomość e-mail, aby dokończyć migrację.",
    statusMigrateResending: "Wysyłam ponownie…",
    statusMigrateResent: "Wysłano ponownie. Sprawdź wiadomość e-mail.",
    statusMigrateCancelling: "Anuluję migrację…",
    statusMigrateCancelled: "Migracja anulowana.",
    errCancelMigrationFailed: "Nie udało się anulować migracji.",
    title: "Familiada — konto",
    pageTitle: "Familiada — moje konto",
    backToGames: "Moje gry",
    headerTitle: "Ustawienia konta",
    headerHint: "Zarządzaj profilem, e-mailem i bezpieczeństwem.",
    statusLoading: "Ładuję profil…",
    usernameTitle: "Nazwa użytkownika",
    usernameHint: "Widoczna dla subskrybentów i w panelu.",
    usernamePlaceholder: "Nazwa użytkownika",
    usernameSave: "Zapisz nazwę",
    emailTitle: "E-mail",
    emailHint: "Zmieniaj adres logowania. Po zmianie sprawdź skrzynkę na obecnym i nowym e-mailu, aby potwierdzić operację.",
    emailPlaceholder: "Nowy e-mail",
    emailSave: "Zmień e-mail",
    emailPostHint: "Zmiana e-maila wymaga potwierdzenia linków w skrzynkach. Do tego czasu możesz logować się dotychczasowym adresem. Jeśli nie widzisz wiadomości, sprawdź spam.",
    emailNoAccessHint: "Nie masz dostępu do obecnego e-maila? Wyeksportuj ważne dane (gry, bazy i logo), usuń konto, załóż nowe na poprawnym adresie i zaimportuj dane ponownie.",
    emailPendingTitle: "Zmiana e-maila w toku",
    emailPendingText: "Nowy e-mail: {email}. Dokończ zmianę klikając link w wiadomościach (na starym i nowym adresie).",
    emailResend: "Wyślij ponownie",
    emailCancel: "Anuluj zmianę",
    passwordTitle: "Hasło",
    passwordHint: "Minimum 8 znaków, małe/duże litery, cyfra i znak specjalny.",
    passwordPlaceholder: "Nowe hasło",
    passwordRepeatPlaceholder: "Powtórz nowe hasło",
    passwordSave: "Zmień hasło",
    deleteTitle: "Usuń konto",
    deleteHint: "Ta operacja jest nieodwracalna. Wpisz hasło, aby potwierdzić.",
    deleteHintGuest: "Ta operacja jest nieodwracalna i usunie wszystkie dane tego konta gościa.",
    deletePlaceholder: "Hasło",
    deleteButton: "Usuń konto i dane",
    deleteGuestModalTitle: "Usunąć konto gościa?",
    deleteGuestModalText: "Ta operacja jest nieodwracalna — wszystkie gry, bazy pytań i pliki zostaną trwale usunięte.",
    deleteGuestModalOk: "Usuń",
    emailNotifTitle: "Wiadomości e-mail",
    emailNotifHint: "Otrzymywać wiadomości e-mail o propozycjach subskrypcji, zadaniach do wypełnienia czy udostępnionych bazach pytań. Jeśli zrezygnujesz z wiadomości e-mail będziesz widzieć te propozycje bezpośrednio na stronie.",
    emailNotifCheckbox: "Włącz powiadomienia e-mail",
    emailNotifDisableTitle: "Wyłączyć wiadomości e-mail?",
    emailNotifDisableConfirm: "Nadal zobaczysz wszystkie propozycje i zadania bezpośrednio na stronie.",
    emailNotifSavedOn: "Powiadomienia e-mail zostały włączone.",
    emailNotifSavedOff: "Powiadomienia e-mail zostały wyłączone.",
    emailNotifSaveFailed: "Nie udało się zapisać ustawień powiadomień. Spróbuj ponownie.",
    demo: {
      title: "Materiały Demo",
      hint: "Przywróć przykładowe materiały startowe: bazy pytań, logo i gotowe gry różnych kategorii.",
      btn: "Przywróć pliki demo",
      btnHint: "Po kliknięciu nastąpi przejście do widoku Moje gry i automatyczne wgranie demo.",
    },
    statusLoaded: "Profil załadowany.",
    statusUsernameSaved: "Nazwa użytkownika zapisana.",
    statusSavingEmail: "Zapisywanie adresu e-mail…",
    statusEmailSaved: "Wysłano linki potwierdzające zmianę e-maila. Sprawdź obecną i nową skrzynkę.",
    statusEmailPending: "Zmiana e-maila jest w toku.",
    statusEmailResending: "Wysyłam ponownie linki…",
    statusEmailResent: "Wysłano ponownie. Sprawdź skrzynki.",
    statusEmailCancelling: "Anuluję zmianę…",
    statusEmailCancelled: "Anulowano zmianę e-maila.",
    statusPasswordSaved: "Hasło zostało zmienione.",
    statusDeleting: "Usuwam konto…",
    statusError: "Błąd.",
    errInvalidEmail: "Podaj poprawny e-mail.",
    errEmailPending: "Zmiana e-maila jest już w toku. Najpierw dokończ ją lub anuluj.",
    errEmailSameAsCurrent: "To jest Twój obecny adres e-mail.",
    errNoPendingEmail: "Brak aktywnej zmiany e-maila.",
    cooldown: "Ponowna akcja możliwa za {time}.",
    errCooldown: "Zbyt szybko. Spróbuj ponownie za {time}.",
    errPasswordMismatch: "Hasła nie są takie same.",
    errDeletePasswordMissing: "Podaj hasło, aby potwierdzić.",
    errInvalidPassword: "Nieprawidłowe hasło.",
    errDeleteFailed: "Nie udało się usunąć konta.",
  },
  display: {
    title: "Familiada — wyświetlacz",
    qrHost: "Prowadzący",
    qrBuzzer: "Przyciski",
    qrHostAlt: "QR Prowadzący",
    qrBuzzerAlt: "QR Przyciski",
    sumLabel: "SUMA",
    audioUnlockBtn: "Odblokuj dźwięk",
  },
  host: {
    title: "Familiada — prowadzący",
    swipeRevealDown: "Przesuń w dół, żeby odsłonić",
    swipeCoverUp: "Przesuń w górę, żeby zasłonić",
    swipeRevealRight: "Przesuń w prawo, żeby odsłonić",
    swipeCoverLeft: "Przesuń w lewo, żeby zasłonić",
  },
  buzzer: {
    title: "Familiada — Przycisk do pojedynku",
    btnA: "Przycisk A",
    btnB: "Przycisk B",
    rotateHint: "Obróć urządzenie do poziomu",
  },
  bases: {
    title: "Familiada — bazy pytań",
    backToGames: "Moje gry",
    logout: "Wyloguj",
    headerTitle: "Twoje bazy pytań",
    headerHint: "Naciśnij kafelek, żeby go zaznaczyć. Podwójne naciśnięcie zmienia nazwę.",
    headerHintShared: "Naciśnij kafelek, żeby go zaznaczyć.",
    actions: {
      browse: "Przeglądaj",
      browseMobile: "Przegl.",
      share: "Udostępnij",
      shareMobile: "Udos.",
      export: "Eksport",
      exportMobile: "Exp",
      import: "Import",
      importMobile: "Imp",
      remove: "Usuń",
      leaveShared: "Usuń z listy",
    },
    common: {
      save: "Zapisz",
      cancel: "Anuluj",
    },
    progress: {
      placeholder: "—",
    },
    defaults: {
      name: "Nowa baza pytań",
      slug: "baza",
      baseLabel: "Baza",
      category: "Kategoria",
      tag: "Tag",
    },
    nameModal: {
      titleCreate: "Nowa baza",
      titleRename: "Zmień nazwę",
      subCreate: "Podaj nazwę bazy.",
      subRename: "Zmień nazwę bazy.",
      placeholder: "Nazwa...",
      failed: "Nie udało się",
    },
    importModal: {
      title: "Import",
      subtitle: "Wybierz plik JSON lub wklej JSON poniżej.",
      loadFile: "Wczytaj plik",
      placeholder: "Wklej JSON tutaj...",
      confirm: "Importuj",
      cancel: "Zamknij",
    },
    exportModal: {
      title: "EKSPORT…",
      subtitle: "Nie zamykaj strony. Trwa przygotowanie pliku.",
    },
    shareModal: {
      title: "Udostępnij bazę",
      placeholder: "Nazwa użytkownika lub e-mail...",
      roleEditor: "Edycja",
      roleViewer: "Przeglądanie",
      add: "Dodaj",
      close: "Zamknij",
      cooldown: "Nie można dodać ponownie tego użytkownika przez 24h (anty-spam).",
      alreadyPending: "Zaproszenie już oczekuje na akceptację.",
      emailFailed: "Zaproszenie utworzone, ale nie udało się wysłać wiadomości e-mail.",
      sectionSubscribers: "Subskrybenci",
      sectionPending: "Oczekujące",
      sectionPendingSub: "Po 5 dniach bez akceptacji zapytanie znika.",
      sectionShared: "Aktywni",
      sectionSharedSub: "Zaakceptowali zaproszenie — zmień tryb lub usuń.",
      emptyPending: "Brak oczekujących zapytań.",
      emptyShared: "Brak udostępnień.",
      cancelPending: "Anuluj zapytanie",
      changeRole: "Zmień rolę",
      roleChanged: "Zmieniono rolę",
      shareSection: "Udostępnij",
      shareModeLabel: "Tryb:",
      recipientEmail: "Wpisz adres e-mail lub nazwę użytkownika",
      recipientSubscriber: "Wybierz subskrybenta",
      selectSubscriber: "Wybierz subskrybenta...",
      noSubscribers: "Brak subskrybentów",
      enterEmail: "Wpisz adres e-mail lub nazwę użytkownika",
    },
    delete: {
      title: "Usuń bazę",
      text: "Na pewno usunąć „{name}”? Tego nie da się cofnąć.",
      ok: "Usuń",
      cancel: "Anuluj",
      failed: "Nie udało się usunąć.",
      inUse: "Nie można usunąć bazy -- ktoś właśnie edytuje pytanie, folder lub tag w jej wnętrzu.",
    },
    leaveShared: {
      title: "Usuń udostępnioną bazę",
      text: "Na pewno usunąć z listy udostępnioną bazę „{name}”? (Rezygnujesz z udostępnienia)",
      ok: "Usuń",
      cancel: "Anuluj",
      failed: "Nie udało się usunąć z listy.",
    },
    export: {
      steps: {
        start: "Eksport: start…",
        base: "Eksport: baza…",
        folders: "Eksport: foldery…",
        questions: "Eksport: pytania…",
        tags: "Eksport: tagi…",
        questionTags: "Eksport: tagi pytań…",
        categoryTags: "Eksport: tagi folderów…",
        download: "Pobieranie…",
      },
      count: "Liczba: {count}",
      errorStep: "Eksport bazy nie powiódł się.",
      failed: "Nie udało się wyeksportować.",
    },
    import: {
      invalidFormat: "Zły format pliku (brak base / questions).",
      fileReadFailed: "Nie udało się wczytać pliku",
      invalidJson: "Zły JSON",
      pickFile: "Wybierz plik",
      pasteJson: "Wklej JSON",
      success: "Zaimportowano",
      failed: "Nie udało się",
      errorStep: "Import bazy nie powiódł się.",
      errorMsg: "Import nie powiódł się.",
      steps: {
        start: "Import: start…",
        default: "Import…",
        createBase: "Import: tworzenie bazy…",
        categories: "Import: kategorie…",
        tags: "Import: tagi…",
        questions: "Import: pytania…",
        questionTags: "Import: powiązania tagów…",
        categoryTags: "Import: tagi folderów…",
      },
    },
    roles: {
      editorBadge: "EDYCJA",
      viewerBadge: "ODCZYT",
    },
    share: {
      empty: "Brak udostępnień.",
      roleEditor: "Edycja",
      roleViewer: "Przeglądanie",
      remove: "Usuń",
      failed: "Nie udało się",
      invalidEmail: "Niepoprawny e-mail",
      unknownUser: "Nie znam takiej nazwy użytkownika",
      owner: "Jesteś właścicielem tej bazy",
      success: "Udostępniono",
      removeTitle: "Usuń udostępnienie",
      removeText: "Na pewno usunąć dostęp dla: {email}?",
      removeOk: "Usuń",
      removeCancel: "Anuluj",
      cooldown: "Nie można dodać ponownie tego użytkownika przez 24h (anty-spam).",
      alreadyPending: "Zaproszenie już oczekuje na akceptację.",
      emailFailed: "Zaproszenie utworzone, ale nie udało się wysłać wiadomości e-mail.",
      enterEmail: "Wpisz adres e-mail lub nazwę użytkownika",
      selectSubscriber: "Wybierz subskrybenta",
      roleChanged: "Zmieniono rolę",
      userNotFound: "Nie znaleziono użytkownika.",
    },
    badges: {
      from: "Od: {name}",
      editAccess: "Masz dostęp z edycją",
      viewAccess: "Masz dostęp tylko do odczytu",
      sharedOthers: "Udostępnione innym ({count})",
      notShared: "Nieudostępnione",
      proposed: "Proponowana",
      proposedTitle: "Udostępnienie oczekuje na Twoją decyzję",
    },
    loadFailed: "Nie udało się wczytać baz. Odśwież stronę.",
    proposed: {
      accept: "Przyjmij",
      decline: "Odrzuć",
      failed: "Nie udało się wykonać akcji.",
      mismatch: "To udostępnienie dotyczy innego użytkownika. Sprawdź, czy jesteś zalogowany na konto powiązane z adresem e-mail, na który przyszła wiadomość.",
      cancelled: "Zaproszenie zostało cofnięte.",
      expired: "To zaproszenie wygasło albo już nie istnieje.",
      handled: "To zaproszenie zostało już przyjęte lub odrzucone.",
    },
    sections: {
      mine: "Moje bazy",
      newBase: "Nowa baza",
      shared: "Udostępnione",
      sharedEmpty: "Brak udostępnionych baz.",
      sharedEmptyHint: "Poproś kogoś o udostępnienie lub skorzystaj z własnych baz.",
    },
    mail: {
      noSession: "Brak sesji do wysyłki wiadomości e-mail.",
      failed: "Nie udało się wysłać wiadomości e-mail.",
      title: "Nowe udostępnienie bazy",
      subtitle: "Udostępnienie bazy pytań",
      footer: "Jeśli to nie Ty — zignoruj tę wiadomość.",
      linkLabel: "Jeśli przycisk nie działa, skopiuj link:",
      subject: ({ base }) => `Udostępniono Ci bazę: ${base}`,
      body: ({ owner, base }) => `Użytkownik ${owner} udostępnił Ci bazę pytań „${base}”.`,
      action: "Otwórz w Familiada",
    },
  },
  polls: {
    title: "Familiada — ankieta i wyniki",
    backToGames: "Moje gry",
    backToHub: "Centrum ankiet",
    logout: "Wyloguj",
    pageTitle: "Ankieta",
    linkPlaceholder: "Link pojawi się po uruchomieniu...",
    qrFailed: "QR nie działa.",
    missingId: "Brak parametru id.",
    defaultName: "Ankieta",
    qrModal: {
      title: "Wyświetlacz QR",
      subtitle: "Kod do podłączenia wyświetlacza — nie do głosowania",
      hint: "Wejdź na familiada.online → Podłącz urządzenie → wprowadź kod",
      copied: "Skopiowano kod.",
      copyBtn: "Kopiuj",
      openBtn: "Otwórz",
    },
    actions: {
      copyLink: "Kopiuj link",
      copyShort: "Kopiuj",
      openLink: "Otwórz link",
      openShort: "Otwórz",
      qrOnDisplay: "QR na wyświetlaczu",
      refresh: "Odśwież wyniki",
      cancel: "Anuluj",
      closeAndNormalize: "Zamknij i przelicz",
      noPoll: "Brak ankiety",
      openPoll: "Uruchomić ankietę",
      openReady: "Gotowe do uruchomienia.",
      closePoll: "Zamknąć ankietę",
      closeReady: "Możesz zamknąć ankietę.",
      reopenPoll: "Uruchomić ponownie",
      reopenHint: "Otworzy nową sesję i usunie poprzednie dane ankietowe.",
      unknownStatus: "Nieznany status.",
    },
    results: {
      title: "Wyniki",
      loading: "Ładuję…",
      final: "Wynik:",
      refreshed: "Wyniki odświeżone",
      refreshFailed: "Nie udało się odświeżyć wyników",
    },
    empty: {
      title: "Brak gry",
      meta: "Otwórz stronę z parametrem <b>polls?id=...</b>.",
    },
    meta: {
      pollText:
        "Tryb: ankieta tekstowa. Uruchomienie: ≥ {min} pytań. Zamknięcie: w każdym pytaniu ≥ 3 różne odpowiedzi.",
      pollPoints:
        "Tryb: punktacja. Start: ≥ {min} pytań i każde pytanie ma {minAns}–{maxAns} odpowiedzi. Zamknięcie: w każdym pytaniu co najmniej 3 odpowiedzi muszą mieć ≥ 3 pkt po przeliczeniu do 100.",
      prepared: "Gra preparowana nie ma ankiety.",
    },
    copy: {
      success: "Skopiowano link ankiety.",
      failed: "Nie udało się skopiować.",
    },
    modals: {
      open: {
        title: "Uruchomić ankietę?",
        text: "Uruchomić ankietę dla „{name}”?",
        ok: "Uruchom",
        cancel: "Anuluj",
      },
      closePoints: {
        title: "Zakończyć ankietę?",
        text: "Zamknąć ankietę i przeliczyć punkty do 100?",
        ok: "Zakończ",
        cancel: "Anuluj",
      },
      reopen: {
        title: "Uruchomić ponownie?",
        text: "Otworzyć ankietę ponownie? Poprzednie dane zostaną usunięte.",
        ok: "Otwórz ponownie",
        cancel: "Anuluj",
      },
      closeText: {
        title: "Zamknąć ankietę?",
        text: "Zamknąć ankietę, wybrać TOP 6 i zapisać punkty do 100 dla każdego pytania?",
        ok: "Zamknij",
        cancel: "Anuluj",
      },
    },
    status: {
      opened: "Ankieta uruchomiona.",
      closedPoints: "Ankieta zamknięta. Gra gotowa (unikatowe punkty).",
      reopened: "Ankieta uruchomiona ponownie.",
      closed: "Ankieta zamknięta. Gra gotowa.",
    },
    errors: {
      open: "Nie udało się uruchomić ankiety.",
      close: "Nie udało się zamknąć ankiety.",
      reopen: "Nie udało się otworzyć ponownie.",
      loadAnswers: "Nie udało się wczytać odpowiedzi.",
    },
    textClose: {
      title: "Zamykanie — edycja odpowiedzi",
      loading: "Ładuję odpowiedzi z ostatniej sesji…",
      instructions:
        "Przeciągnij odpowiedź na inną, aby je połączyć (liczby głosów zostaną zsumowane). Możesz usuwać odpowiedzi. Na końcu wybieramy sześć najpopularniejszych i normalizujemy wyniki do 100 punktów.",
      hint: "Przeciągnij, żeby połączyć • edytuj literówki • final max 17 znaków",
      mergeTitle: "Scal identyczne",
      mergeLabel: "Scal identyczne",
      mergeWith: "Połącz z...",
      remove: "Usuń",
      editHint: "Edytuj odpowiedzi, a potem kliknij „Zamknij i przelicz”.",
      cancelled: "Anulowano zamykanie (ankieta dalej otwarta).",
      minAnswers:
        "Pytanie {ord}: po edycji zostało mniej niż 3 odpowiedzi. Dodaj/połącz inaczej.",
      leaveTitle: "Masz otwarte łączenie",
      leaveText: "Jeśli wyjdziesz teraz, stracisz niezapisane zmiany. Wyjść mimo to?",
      leaveOk: "Wyjdź",
      leaveCancel: "Zostań",
      leaveCheckTitle: "Masz otwarte sprawdzanie odpowiedzi",
      leaveCheckText: "Wyjście spowoduje utratę niezapisanych zmian. Wyjść?",
      logoutWarn: "Wylogowanie spowoduje utratę niezapisanych zmian. Wylogować?",
      logoutOk: "Wyloguj",
    },
  },
  manual: {
    title: "Familiada — wskazówki",
    tabsLabel: "Zakładki wskazówek",
    legal: "Polityka prywatności",
    backToGames: "Moje gry",
    backToBaseManager: "Menedżer bazy",
    backToLogos: "Moje logo",
    backToEditor: "Edytor pytań",
    backToPoll: "Ankieta",
    backToSubscriptions: "Subskrypcje",
    backToAccount: "Ustawienia konta",
    backToMarketplace: "Gry Społeczności",
    logout: "Wyloguj",
    pageTitle: "Wskazówki dla użytkownika",
    tabs: {
      general: "Ogólny opis",
      edit: "Gry",
      bases: "Bazy pytań",
      polls: "Ankiety",
      subscriptions: "Subskrypcje",
      logo: "Tworzenie logo",
      connect: "Podłącz urządzenie",
      control: "Panel sterowania",
      demo: "Materiały Demo",
      community: "Gry Społeczności",
      gameSettings: "Ustawienia rozgrywki",
    },
    demo: {
      modalTitle: "Przywrócić pliki demo?",
      modalText: "Zostaną dodane przykładowe materiały startowe.",
      modalOk: "Przywróć",
      modalCancel: "Anuluj",
    },
    content: {
      general: `<p class="m-p">
        Ta strona to wskazówki obsługi systemu do prowadzenia rozgrywki (turnieju)
        w stylu „Familiada”. Jej celem jest wyjaśnienie, jak przygotować grę,
        zebrać wyniki (ankieta) i bez problemu poprowadzić rozgrywkę na żywo
        — nawet jeśli ktoś korzysta z systemu pierwszy raz.
      </p>
      
      <p class="m-p">
        Opis dotyczy narzędzia i sposobu jego użycia,
        a nie „telewizyjnej produkcji”. System sprawdzi się na wydarzeniach,
        imprezach firmowych, w szkole, na scenie albo po prostu w gronie znajomych
        — wszędzie tam, gdzie chcesz mieć czytelną tablicę, punkty i płynny przebieg gry.
      </p>
      
      <p class="m-p">
        Rozgrywka jest zbudowana tak, aby w dużym stopniu odpowiadała oficjalnym zasadom Familiady
        (rundy, bank, błędy X, przejęcia i finał), ale całość jest zaprojektowana jako
        wygodny system do prowadzenia zabawy/turnieju, z jasnym podziałem ról:
        <span class="m-strong">prowadzący prowadzi rozmowę i zadaje pytania</span>,
        a <span class="m-strong">operator steruje tablicą i punktami</span>.
      </p>

      <p class="m-p">
        Jeśli chcesz zapoznać się z pełnymi zasadami gry,
        <a href="https://s.tvp.pl/repository/attachment/6/8/f/68f09c03ff0781fa510c2fd90c3ba19b1569224834470.pdf" target="_blank" rel="noopener noreferrer">
          Regulamin teleturnieju „Familiada”
        </a>
        opisuje je szczegółowo.
      </p>

      <p class="m-p">
        Całość systemu została zaprojektowana tak,
        aby wyraźnie oddzielić przygotowanie treści
        od samej rozgrywki.
        Pytania, odpowiedzi i ankiety przygotowuje się wcześniej,
        natomiast w trakcie gry operator korzysta wyłącznie
        z panelu sterowania.
      </p>

      <p class="m-p">
        W praktyce oznacza to, że operator nie musi edytować danych,
        prowadzący skupia się na rozmowie z uczestnikami,
        a system pilnuje kolejności etapów i logiki rozgrywki.
        Zmniejsza to ryzyko pomyłek i przyspiesza przebieg gry.
      </p>

      <p class="m-p">
        System najlepiej działa przy użyciu osobnych urządzeń:
        wyświetlacza dla widzów (telewizor lub rzutnik),
        tabletu lub telefonu dla prowadzącego,
        osobnego urządzenia pełniącego rolę przycisku
        oraz komputera operatora z panelem sterowania.
      </p>

      <p class="m-p">
        Wskazówki zostały podzielone na kolejne zakładki.
        Każda z nich opisuje inny etap pracy z systemem:
        od przygotowania gry,
        przez ankiety,
        aż po prowadzenie rozgrywki na żywo.
      </p>`,
      edit: `<p class="m-p">
        Zakładka „Dodawanie i edycja gry” opisuje etap przygotowania gry
        przed rozpoczęciem ankiety lub rozgrywki.
        Na tym etapie tworzysz strukturę gry:
        pytania, możliwe odpowiedzi oraz sposób ich punktowania.
      </p>
    
      <p class="m-p">
        Ten etap jest kluczowy, ponieważ decyduje o tym,
        jak będzie wyglądać cała dalsza praca z grą.
        System celowo rozdziela przygotowanie treści
        od późniejszego zbierania odpowiedzi i prowadzenia rozgrywki.
      </p>
    
      <h3 class="m-h2">Lista gier („Moje gry”)</h3>
    
      <p class="m-p">
        Lista gier jest miejscem, w którym zarządzasz wszystkimi grami
        przypisanymi do Twojego konta.
        To tutaj możesz tworzyć nowe gry,
        wybierać istniejące
        oraz decydować, co chcesz z daną grą zrobić dalej.
      </p>
    
      <p class="m-p">
        Gry są podzielone na typy.
        Typ gry określa, w jaki sposób odpowiedzi będą zbierane
        i jak powstaną punkty widoczne później na tablicy.
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Ankieta tekstowa</span> —
          odpowiedzi są wpisywane przez ankietowanych,
          a punkty wynikają z liczby wskazań.
        </li>
        <li>
          <span class="m-strong">Punktacja</span> —
          ankietowani wybierają spośród przygotowanych odpowiedzi,
          a system zlicza wyniki.
        </li>
        <li>
          <span class="m-strong">Preparowana</span> —
          odpowiedzi i punkty są ustalane ręcznie,
          bez udziału ankiety.
        </li><li><span class="m-strong">Gry Społeczności</span>&nbsp;— odpowiedzi i punkty są pobrane z biblioteki Gier Społeczności, bez udziału ankiety.</li>
      </ul>
    
      <p class="m-p">
        Nową grę tworzysz klikając kafelek z symbolem <i class="ico" data-icon="plus"></i>.
        Po utworzeniu gra pojawia się na liście
        i może zostać otwarta w edytorze.
      </p>
    
      <h3 class="m-h2">Edytor gry – co i kiedy można edytować</h3>
    
     <p class="m-p">
        Do trybu edycji gry przechodzisz z listy „Moje gry”
        za pomocą przycisku <span class="m-code">Edytuj</span>.
        Jest to pierwszy etap pracy z grą,
        w którym przygotowujesz całą jej treść
        przed wykorzystaniem jej w ankiecie lub rozgrywce.
      </p>
      
      <p class="m-p">
        W trybie edycji tworzysz pytania i odpowiedzi,
        decydujesz o typie gry
        oraz przygotowujesz strukturę,
        która będzie później wykorzystywana
        do zbierania danych lub prowadzenia gry na żywo.
      </p>
      
      <p class="m-p">
        Edytor gry służy do budowania struktury pytań i odpowiedzi.
        W zależności od typu gry oraz jej stanu
        dostępne opcje edycji mogą się różnić.
      </p>
    
      <p class="m-p">
        Jest to działanie celowe.
        System ogranicza pewne operacje,
        aby zachować spójność danych
        i zapobiec sytuacjom,
        w których rozgrywka lub ankieta
        przestają odpowiadać przygotowanej treści.
      </p>
    
      <h3 class="m-h3">Dodawanie i edycja pytań</h3>
    
      <p class="m-p">
        Pytania są zawsze podstawowym elementem gry.
        Na etapie przygotowania możesz:
        dodawać nowe pytania,
        zmieniać ich treść
        oraz usuwać pytania niepotrzebne.
      </p>
    
      <p class="m-p">
        Zmiana pytania po uruchomieniu ankiety
        może zostać zablokowana,
        ponieważ nawet drobna modyfikacja treści
        wpływa na sens zebranych odpowiedzi.
      </p>
    
      <h3 class="m-h3">Dodawanie i edycja odpowiedzi</h3>
    
      <p class="m-p">
        Możliwość edycji odpowiedzi zależy od typu gry.
        W grach ankietowych odpowiedzi są efektem ankiety,
        dlatego przed ankietą możesz jedynie przygotować
        ich ogólną strukturę lub przykłady.
      </p>
    
      <p class="m-p">
        Po rozpoczęciu ankiety system może ograniczyć
        dodawanie lub usuwanie odpowiedzi,
        aby nie mieszać odpowiedzi ankietowanych
        z nową treścią.
      </p>
    
      <h3 class="m-h3">Punkty – dlaczego czasem są zablokowane</h3>
    
      <p class="m-p">
        Punkty nie zawsze są edytowalne ręcznie.
        W grach ankietowych punkty wynikają bezpośrednio
        z liczby udzielonych odpowiedzi,
        dlatego ich ręczna edycja nie ma sensu
        i jest zablokowana.
      </p>
    
      <p class="m-p">
        Ręczne ustawianie punktów jest możliwe
        tylko w trybie preparowanej,
        gdzie system nie korzysta z danych ankietowych.
      </p>
    
      <div class="m-note">
        <b>Dlaczego tak jest?</b><br>
        Dzięki temu to, co widzi widz na tablicy,
        zawsze odpowiada rzeczywistym wynikom ankiety
        albo jasno określonej, ręcznej punktacji.
      </div>
    
      <h3 class="m-h2">Ograniczenia długości i formatu</h3>
    
      <p class="m-p">
        Odpowiedzi powinny być krótkie i czytelne.
        Przy imporcie treści odpowiedzi dłuższe
        niż <span class="m-strong">17 znaków</span>
        są automatycznie przycinane.
      </p>
    
      <p class="m-p">
        To ograniczenie wynika z układu tablicy
        i ma na celu zachowanie czytelności
        podczas rozgrywki na żywo.
      </p>
    
      <h3 class="m-h2">Import i eksport gier</h3>
    
      <p class="m-p">
        Strona „Moje gry” umożliwia eksport i import gier
        w postaci plików oraz bezpośrednio do bazy pytań.
        Funkcja ta służy do przenoszenia gier i pytań
        pomiędzy kontami lub środowiskami.
      </p>
    
      <p class="m-p">
        Pliki importu i eksportu są formatem technicznym.
        Gra nie powinna ingerować w ich zawartość
        ani próbować edytować ich ręcznie.
      </p>
    
      <div class="m-warn">
        <b>Uwaga:</b>
        ręczna modyfikacja plików importu lub eksportu
        może spowodować, że gry nie będzie się dało zaimportować
        albo będzie działała nieprawidłowo.
      </div>
    
      <p class="m-p">
        Po poprawnym imporcie gra pojawia się
        na liście gier i może być dalej edytowana
        wyłącznie przy użyciu edytora systemowego.
      </p>
      
      <p class="m-p">
        Podczas eksportu gry do bazy:
      </p>
      
      <ul class="m-ul">
        <li>w katalogu głównym bazy tworzony jest nowy folder</li>
        <li>folder otrzymuje nazwę gry</li>
        <li>w folderze zapisywane są wszystkie pytania należące do gry</li>
      </ul>

      <p class="m-note">Eksport do bazy nie usuwa gry — tworzy jedynie jej kopię w postaci struktury pytań.<br><br>Eksportować możesz tylko do swojej własnej bazy lub do udostępnionej bazy której jesteś edytorem.
        Jeśli nie posiadasz aktualnie żadnych baz, nie będziesz mógł eksportować.
      </p>
      
      <p class="m-p">
        Dzięki eksportowi do bazy każda gra może zostać zamieniona w zestaw pytań do dalszej edycji,
        organizowania w folderach, oznaczania tagami oraz ponownego wykorzystania
        w kolejnych grach.</p>`,
      bases: `<h2 class="m-h2">Bazy pytań — organizacja i współpraca</h2>
  
      <p class="m-p">
        Bazy pytań to miejsce do przechowywania pytań używanych w grach.
        Dzięki nim możesz porządkować pytania w folderach, oznaczać je tagami, przypisywać do kategorii
        oraz współdzielić całe bazy z innymi użytkownikami.
      </p>
      <p class="m-p">
        Do baz pytań przechodzisz z górnego paska strony „Moje gry”
        za pomocą przycisku <span class="m-code">Bazy pytań <i class="ico" data-icon="drawer"></i></span>.
      </p>
  
      <p class="m-p">
        Jedna baza może zawierać setki lub tysiące pytań uporządkowanych w strukturze podobnej
        do klasycznego menedżera plików na komputerze.
      </p>
  
      <h3 class="m-h3">Dodawanie nowej bazy</h3>
  
      <p class="m-p">
        W widoku „Bazy pytań” kliknij kafelek <span class="m-code"><i class="ico" data-icon="plus"></i> Nowa baza</span>.
        Otworzy się okno, w którym podajesz nazwę bazy.
      </p>
  
      <p class="m-p">
        Po zapisaniu nowa baza pojawi się na liście i od razu możesz ją przeglądać lub udostępniać.
      </p>
  
      <h3 class="m-h3">Udostępnianie bazy</h3>
  
      <p class="m-p">
        Każdą bazę możesz udostępnić innym użytkownikom poprzez podanie ich adresu e-mail.
        Dostępne są dwa tryby:
      </p>
  
      <ul class="m-ul">
        <li><span class="m-strong">Edycja</span> — użytkownik może dodawać, usuwać i modyfikować pytania, foldery, tagi, tworzyć gry z pytań i eksportować pytania do bazy</li>
        <li><span class="m-strong">Przeglądanie</span> — użytkownik może tylko przeglądać zawartość bazy i tworzyć gry z dostępnych pytań</li>
      </ul>
  
      <p class="m-p">
        Tylko właściciel bazy może zarządzać udostępnieniami.
      </p>
  
      <h3 class="m-h3">Przechodzenie do menedżera bazy</h3>
  
      <p class="m-p">
        Aby wejść do zawartości bazy, zaznacz ją na liście i kliknij przycisk <span class="m-code">Przeglądaj</span>.
      </p>
  
      <p class="m-p">
        Otworzy się Menedżer bazy pytań działający jak klasyczny eksplorator plików.
      </p>
  
      <h2 class="m-h2">Menedżer bazy pytań</h2>
  
      <p class="m-p">
        Menedżer bazy pytań pozwala zarządzać pytaniami w sposób znany z systemowych menedżerów plików:
        foldery, przenoszenie metodą „przeciągnij i upuść”, kopiowanie, wycinanie i szybka selekcja.
      </p>
  
      <p class="m-p">
        Każdy „plik” w tym menedżerze jest pojedynczym pytaniem.
        Foldery służą do grupowania pytań tematycznie lub logicznie.
      </p>
  
      <p class="m-p">
        Możesz:
      </p>
  
      <ul class="m-ul">
        <li>tworzyć dowolnie zagnieżdżone foldery</li>
        <li>przenosić pytania i foldery między sobą</li>
        <li>kopiować i duplikować elementy</li>
        <li>usuwać zaznaczone pozycje</li>
        <li>wyszukiwać po nazwie i tagach</li>
      </ul>
  
      <p class="m-note">
        Interfejs i skróty klawiszowe działają podobnie jak w klasycznych menedżerach plików
        (Explorer, Finder, Total Commander).
      </p>
  
      <h2 class="m-h2">Tagi i kategorie</h2>
  
      <h3 class="m-h3">Tagi</h3>
  
      <p class="m-p">
        Każde pytanie może mieć dowolną liczbę tagów.
        Tagi służą do tematycznego oznaczania pytań — np. „historia”, „sport”, „łatwe”, „dla dzieci”.
      </p>
  
      <p class="m-p">
        Możesz:
      </p>
  
      <ul class="m-ul">
        <li>tworzyć własne tagi z kolorami</li>
        <li>przypisywać wiele tagów do jednego pytania</li>
        <li>filtrować widok po wybranych tagach</li>
      </ul>

      <p class="m-p">
        Przypisywanie tagów odbywa się w specjalnym oknie, które można otworzyć z paska narzędzi
        lub z menu kontekstowego.
      </p>
      
      <p class="m-p">
        W oknie przypisywania tagów widoczna jest lista wszystkich dostępnych tagów wraz z ich stanem:
      </p>
      
      <ul class="m-ul">
        <li>zaznaczony — tag jest przypisany do wszystkich wybranych elementów</li>
        <li>niezaznaczony — tag nie jest przypisany do żadnego z nich</li>
        <li>częściowy — tylko część zaznaczenia posiada dany tag</li>
      </ul>
      
      <p class="m-p">
        Kliknięcie w tag przełącza jego stan cyklicznie, umożliwiając szybkie dodawanie i usuwanie tagów
        dla wielu pytań lub folderów jednocześnie. To okno umożliwia tworzenie nowych tagów.
      </p>
      
      <p class="m-p">
        Tagi mogą być również używane jako filtry — kliknięcie taga po lewej stronie ogranicza widok
        do elementów oznaczonych wybranym tagiem lub zestawem tagów.
      </p>
  
      <p class="m-note">
        Folder pokazuje znaczniki tagów wtedy, gdy wszystkie znajdujące się w nim pytania
        (oraz podfoldery) posiadają ten sam tag.
      </p>
  
      <h3 class="m-h3">Kategorie</h3>
  
      <p class="m-p">
        Kategorie to specjalne oznaczenia systemowe określające,
        do jakiego typu gry dane pytanie pasuje. Co odpowiada typom gier w widoku <span class="m-strong">Moje gry</span>
      </p>
  
      <p class="m-p">
        Przykładowo:
      </p>
  
      <ul class="m-ul">
        <li>pytania z odpowiedziami i punktami trafiają do kategorii <span class="m-strong">preperowane</span></li>
        <li>pytania z odpowiedziami bez sumy punktów do <span class="m-strong">punktacja</span></li>
        <li>pytania tekstowe bez punktów do <span class="m-strong">typowe</span></li>
      </ul>
  
      <p class="m-p">
        Kategorie są przypisywane automatycznie na podstawie struktury pytania,
        a nie ręcznie przez użytkownika.
      </p>
  
      <p class="m-note">
        Dzięki temu od razu wiesz, które pytania nadają się do konkretnego typu gry.
      </p>
  
      <h2 class="m-h2">Edytor pytań</h2>
  
      <p class="m-p">
        Każde pytanie możesz otworzyć w edytorze.
        Edytor pozwala zmieniać treść pytania, odpowiedzi oraz punkty (jeśli występują).
      </p>
  
      <p class="m-p">
        System pilnuje podstawowych zasad, takich jak:
      </p>
  
      <ul class="m-ul">
        <li>maksymalna liczba punktów dla jednej odpowiedzi</li>
        <li>łączna suma punktów w pytaniu</li>
      </ul>
  
      <p class="m-p">
        Dzięki temu baza zawsze pozostaje spójna i gotowa do użycia w grach.
      </p>
  
      <h2 class="m-h2">Tworzenie gry z pytań</h2>
  
      <p class="m-p">
        W Menedżerze bazy możesz zaznaczyć dowolne pytania oraz foldery (wraz z podfolderami),
        a następnie utworzyć z nich nową grę.
      </p>
  
      <p class="m-p">
        System zbiera wszystkie pytania z zaznaczenia, pozwala je przejrzeć
        i wybrać typ gry.
      </p>

      <p class="m-note">
        To umożliwia szybkie budowanie gier z gotowych zestawów pytań bez ręcznego przepisywania.
      </p>

      <p class="m-warn">
        Po pomyślnym utworzeniu gry zostaniesz przekierowany do widoku <span class="m-strong">Moje gry</span>
      </p>
  
      <h2 class="m-h2">Skróty klawiszowe — Menedżer bazy</h2>
  
      <h3 class="m-h3">Tworzenie</h3>
  
      <div class="m-table-wrap"><table class="m-table">
        <tbody><tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Nowe pytanie</td><td>Ctrl + N</td><td>⌘ N</td></tr>
        <tr><td>Nowy folder</td><td>Ctrl + Shift + N</td><td>⌘ ⇧ N</td></tr>
      </tbody></table></div>
  
      <h3 class="m-h3">Edycja</h3>
  
      <div class="m-table-wrap"><table class="m-table">
        <tbody><tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Edytuj pytanie</td><td>Ctrl + E</td><td>⌘ E</td></tr>
        <tr><td>Zmień nazwę</td><td>F2</td><td>F2</td></tr>
        <tr><td>Usuń</td><td>Delete</td><td>Fn + ⌫</td></tr>
      </tbody></table></div>
  
      <h3 class="m-h3">Schowek</h3>
  
      <div class="m-table-wrap"><table class="m-table">
        <tbody><tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Kopiuj</td><td>Ctrl + C</td><td>⌘ C</td></tr>
        <tr><td>Wytnij</td><td>Ctrl + X</td><td>⌘ X</td></tr>
        <tr><td>Wklej</td><td>Ctrl + V</td><td>⌘ V</td></tr>
        <tr><td>Duplikuj</td><td>Ctrl + D</td><td>⌘ D</td></tr>
      </tbody></table></div>
  
      <h3 class="m-h3">Gra</h3>
  
      <div class="m-table-wrap"><table class="m-table">
        <tbody><tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Utwórz grę</td><td>Ctrl + G</td><td>⌘ G</td></tr>
      </tbody></table></div>
  
      <h3 class="m-h3">Widok</h3>
  
      <div class="m-table-wrap"><table class="m-table">
        <tbody><tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Odśwież widok</td><td>Ctrl + Alt + R</td><td>⌘ ⌥ R</td></tr>
      </tbody></table></div>
  
      <h3 class="m-h3">Nawigacja</h3>
  
      <div class="m-table-wrap"><table class="m-table">
        <tbody><tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Zaznacz wszystko</td><td>Ctrl + A</td><td>⌘ A</td></tr>
        <tr><td>Otwórz folder</td><td>Enter</td><td>⏎</td></tr>
        <tr><td>Folder nadrzędny</td><td>Backspace</td><td>⌫</td></tr>
      </tbody></table></div>
  
      <p class="m-note">
        Skróty nie działają podczas wpisywania tekstu w polach edycyjnych.
      </p>`,
      polls: `<p class="m-p">
        Zakładka „Ankiety” opisuje etap zbierania odpowiedzi
        od ankietowanych przed właściwą rozgrywką.
        Ankieta jest mostem pomiędzy przygotowaniem gry
        a jej rozegraniem na żywo.
      </p>
    
      <p class="m-p">
        Na tym etapie system przestaje być edytorem treści,
        a zaczyna działać jak narzędzie do zbierania danych.
        Z tego powodu wiele opcji edycji jest celowo ograniczonych.
      </p>


      <p class="m-p">
        Do ankiet przechodzisz z górnego paska na stronie „Moje gry”
        przyciskiem <span class="m-code">Ankiety <i class="ico" data-icon="polls"></i></span>.
      </p>

      <h3 class="m-h2">Strona ankiet</h3>

      <p class="m-p">
        Na komputerze widzisz dwa obszary:
      </p>

      <ul class="m-ul">
        <li><span class="m-strong">Moje ankiety</span> — lista ankiet, które tworzysz i prowadzisz.</li>
        <li><span class="m-strong">Zadania</span> — zaproszenia do ankiety od innych użytkowników.</li>
      </ul>

      <p class="m-p">
        Złota kropka przy przycisku <span class="m-code">Ankiety <i class="ico" data-icon="polls"></i></span> pokazuje liczbę aktywnych zadań do wykonania.
      </p>

      <p class="m-p">
        Udostępnianie ankiety odbywa się z listy „Moje ankiety”: zaznacz kafelek i kliknij
        <span class="m-code">Udostępnij</span>, następnie wybierz odbiorców i zapisz.
        Kafelek ankiety pokazuje bieżące wyniki, a przycisk <span class="m-code">Szczegóły</span>
        daje podgląd listy oddanych głosów, oczekujących, odrzuconych oraz anonimowych odpowiedzi.
      </p>

      <h3 class="m-h3">Moje ankiety</h3>
      <p class="m-p">
        Każdy kafelek ma kolor, który oznacza stan ankiety:
      </p>
      <ul class="m-ul">
        <li><span class="m-strong">Szary</span> — szkic, brakuje wymagań do uruchomienia.</li>
        <li><span class="m-strong">Czerwony</span> — szkic gotowy do uruchomienia.</li>
        <li><span class="m-strong">Pomarańczowy</span> — ankieta otwarta, brak głosów.</li>
        <li><span class="m-strong">Żółty</span> — ankieta otwarta, są wyniki lub aktywne zadania.</li>
        <li><span class="m-strong">Zielony</span> — ankieta otwarta, cele zebrane (zadania wykonane lub ≥10 głosów).</li>
        <li><span class="m-strong">Niebieski</span> — ankieta zamknięta.</li>
      </ul>

      <h3 class="m-h3">Zadania</h3>
      <p class="m-p">
        Zadania to zaproszenia do ankiety. Kolory:
        <span class="m-strong">zielony</span> — dostępne,
        <span class="m-strong">niebieski</span> — wykonane.
        Dwuklik otwiera ankietę, a przycisk <span class="m-code"><i class="ico" data-icon="cancel"></i></span> odrzuca zadanie.
      </p>

      <h3 class="m-h2">Rodzaje ankiet</h3>
    
      <p class="m-p">
        W zależności od typu gry ankieta może działać w jednym z dwóch trybów:
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Ankieta tekstowa</span> —
          ankietowani wpisują własne odpowiedzi tekstowe.
        </li>
        <li>
          <span class="m-strong">Punktacja</span> —
          ankietowani wybierają jedną z przygotowanych odpowiedzi.
        </li>
      </ul>
    
      <p class="m-p">
        Gry preparowane nie posiadają ankiety —
        odpowiedzi i punkty są w nich ustalane ręcznie.
      </p>
    
      <h3 class="m-h2">Uruchamianie ankiety</h3>
    
      <p class="m-p">
        Ankietę można uruchomić wyłącznie dla gry
        znajdującej się w stanie <span class="m-strong">Szkic</span>.
        Przed uruchomieniem system sprawdza,
        czy gra spełnia minimalne wymagania.
      </p>
    
      <ul class="m-ul">
        <li>minimalna liczba pytań,</li>
        <li>w trybie punktacji — odpowiednia liczba odpowiedzi przy każdym pytaniu.</li>
      </ul>
    
      <div class="m-note">
        <b>Dlaczego?</b><br/>
        Dzięki temu nie da się uruchomić ankiety,
        który nie może zostać później poprawnie zamknięty
        i użyty w rozgrywce.
      </div>
    
      <h3 class="m-h2">Link i kod QR do głosowania</h3>

      <p class="m-p">
        Po uruchomieniu ankiety system generuje
        unikalny link do ankiety.
        Link ten można skopiować lub otworzyć w nowej karcie —
        uczestnicy wpisują go na swoich telefonach i oddają głos.
        Mały kod QR widoczny na stronie ankiety też koduje ten link.
      </p>

      <h3 class="m-h2">QR na wyświetlaczu (TV / rzutnik)</h3>

      <p class="m-p">
        Przycisk <span class="m-code">QR na wyświetlaczu</span> otwiera modal z kodem urządzenia:
      </p>
      <ul class="m-ul">
        <li><span class="m-strong">6-cyfrowy kod</span> — wpisz go na stronie
          <span class="m-code">Podłącz urządzenie</span>, aby ręcznie połączyć TV lub drugi ekran.</li>
      </ul>

      <p class="m-p">
        <span class="m-strong">Telewizor jako samodzielny ekran:</span>
        w jego przeglądarce otwórz <span class="m-code">www.familiada.online</span>.
        Rozpoznany telewizor przejdzie bezpośrednio do uproszczonej strony podłączenia.
        Wpisz 6-cyfrowy kod z okna <span class="m-code">QR na wyświetlaczu</span>
        i wybierz <span class="m-code">Podłącz</span>.
        Na TV pojawi się kod QR ankiety, który uczestnicy skanują telefonami.
        Nie potrzebujesz logowania na telewizorze, kabla HDMI ani przesyłania obrazu z komputera.
      </p>
      <p class="m-p">Możesz również otworzyć na telewizorze bezpośredni link do Wyświetlacza QR skopiowany z okna ankiety. Taki link otworzy ekran z kodem QR, podobnie jak link Wyświetlacza gry otwiera planszę rozgrywki. Jeśli przeglądarka TV nie została rozpoznana, np. niestandardowa przeglądarka na Apple TV, otwórz <a href="https://www.familiada.online/connect-device/tv/">stronę podłączenia TV</a> i wpisz kod. Przez HDMI lub AirPlay możesz zamiast tego przesłać ekran QR otwarty na komputerze lub innym urządzeniu.</p>

      <h3 class="m-h2">Przebieg ankiety</h3>
    
      <p class="m-p">
        Ankietowani przechodzą przez pytania po kolei.
        System pilnuje kolejności
        i nie pozwala pominąć pytania.
      </p>
    
      <p class="m-p">
        W ankiecie tekstowej każda odpowiedź:
      </p>
    
      <ul class="m-ul">
        <li>jest ograniczona do 17 znaków,</li>
        <li>jest normalizowana (wielkość liter, spacje),</li>
        <li>zliczana jest jako osobna propozycja.</li>
      </ul>
    
      <p class="m-p">
        W punktacji ankietowany
        wybiera jedną z przygotowanych odpowiedzi,
        a system zapisuje oddany głos.
      </p>
    
      <h3 class="m-h2">Zamykanie ankiety</h3>
    
      <p class="m-p">
        Zamknięcie ankiety jest osobnym,
        świadomym etapem pracy.
        System nie pozwala zamknąć ankiety,
        jeśli zebrane dane nie spełniają
        minimalnych warunków jakości.
      </p>
    
      <h3 class="m-h3">Punktacja</h3>
    
      <p class="m-p">
        Przy zamykaniu ankiety punktacji
        system przelicza wyniki na punkty
        i normalizuje je do skali 0–100
        dla każdego pytania.
      </p>
    
      <div class="m-note">
        <b>Efekt:</b>
        otrzymujesz gotową listę odpowiedzi z punktami,
        bez potrzeby ręcznego liczenia.
      </div>
    
      <h3 class="m-h3">Ankieta tekstowa</h3>
    
      <p class="m-p">
        W ankiecie tekstowej (klasycznym) ankietowani wpisują własne odpowiedzi.
        Po zamknięciu ankiety system przechodzi do etapu porządkowania wyników.
        Operator może łączyć oczywiście podobne odpowiedzi
        oraz usuwać literówki lub oczywiste duplikaty.
      </p>
      
      <p class="m-p">
        Następnie odpowiedzi są normalizowane do skali punktowej.
        Na tym etapie system stosuje dodatkowe ograniczenia,
        które mają na celu zachowanie czytelności tablicy
        i dynamiki rozgrywki.
      </p>
      
      <p class="m-p">
        Odpowiedzi o bardzo małej liczbie wskazań,
        które po normalizacji uzyskują
        <span class="m-strong">mniej niż 8 punktów</span>,
        są automatycznie odrzucane.
        Takie odpowiedzi zwykle nie mają znaczenia dla gry
        i nie byłyby czytelne dla widzów.
      </p>
      
      <p class="m-p">
        Dla jednego pytania na tablicy
        może znaleźć się maksymalnie
        <span class="m-strong">6 odpowiedzi</span>.
        Jeżeli poprawnych odpowiedzi jest więcej,
        system wybiera te najlepiej punktowane,
        a pozostałe są pomijane.
      </p>
      
      <p class="m-p">
        Z tego powodu suma punktów dla jednego pytania
        <span class="m-strong">nie zawsze wynosi dokładnie 100</span>.
        Punkty przypisane są wyłącznie do odpowiedzi,
        które faktycznie trafiają na tablicę.
      </p>
    
      <div class="m-warn">
        <b>Uwaga:</b>
        po zamknięciu ankiety
        nie można już zmieniać jego wyników
        bez ponownego uruchomienia ankiety.
      </div>
    
      <h3 class="m-h2">Ponowne uruchomienie ankiety</h3>
    
      <p class="m-p">
        Zamknięta ankieta można uruchomić ponownie,
        co powoduje usunięcie poprzednich wyników
        i rozpoczęcie zbierania odpowiedzi od nowa.
      </p>
    
      <p class="m-p">
        Ta opcja jest przydatna,
        gdy ankieta została uruchomiony testowo
        lub doszło do błędu organizacyjnego.
      </p>`,
      subscriptions: `<p class="m-p">
        Zakładka „Subskrypcje” opisuje wszystko, co dotyczy relacji między użytkownikami:
        zapraszanie subskrybentów, akceptowanie zaproszeń, ponowne wysyłki i usuwanie powiązań.
      </p>


      <p class="m-p">
        Przechodzisz do niej z górnego paska na stronie „Moje gry”,
        przyciskiem <span class="m-code">Subskrypcje <i class="ico" data-icon="bell"></i></span>.
      </p>

      <h3 class="m-h2">Strona subskrypcji</h3>

      <ul class="m-ul">
        <li><span class="m-strong">Moi subskrybenci</span> — osoby zaproszone przez Ciebie.</li>
        <li><span class="m-strong">Moje subskrypcje</span> — zaproszenia i relacje, które dotyczą Ciebie jako odbiorcy.</li>
      </ul>

      <p class="m-p">
        Złota kropka przy przycisku <span class="m-code">Subskrypcje <i class="ico" data-icon="bell"></i></span> pokazuje liczbę zaproszeń do zaakceptowania.
      </p>

      <h3 class="m-h3">Moi subskrybenci</h3>
      <p class="m-p">
        Subskrypcja to stałe połączenie między Twoim kontem a zaproszonym użytkownikiem —
        raz zaakceptowana pozwala udostępniać kolejne ankiety bez wpisywania e-maila od nowa.
        Zaproszenie wysyłasz, wpisując e-mail lub nazwę użytkownika
        i klikając <span class="m-code">Zaproś</span>.
      </p>

      <p class="m-p">
        Kolory statusów:
        <span class="m-strong">żółty</span> — oczekujące,
        <span class="m-strong">zielony</span> — aktywne,
        <span class="m-strong">czerwony</span> — odrzucone/anulowane.
        Przycisk <span class="m-code"><i class="ico" data-icon="trash"></i></span> usuwa subskrybenta, a <span class="m-code"><i class="ico" data-icon="refresh"></i></span> ponawia zaproszenie.
      </p>

      <h3 class="m-h3">Moje subskrypcje</h3>
      <p class="m-p">
        Odbiorca akceptuje zaproszenie na swojej stronie subskrypcji,
        a status zmienia się na aktywny.
      </p>
      <p class="m-p">
        Kolory:
        <span class="m-strong">żółty</span> — oczekujące,
        <span class="m-strong">zielony</span> — aktywne.
        Przyciski: <span class="m-code"><i class="ico" data-icon="check"></i></span> akceptuje, <span class="m-code"><i class="ico" data-icon="cancel"></i></span> odrzuca/anuluje.
      </p>

      <p class="m-p">
        W praktyce subskrypcje przyspieszają pracę — do aktywnych subskrybentów możesz
        jednym kliknięciem udostępnić ankietę oraz szybko udostępnić bazę pytań,
        bez ręcznego przepisywania danych i linków.
      </p>
      <p class="m-p">
        Jeśli wpisujesz nazwę użytkownika podczas zapraszania, system najpierw sprawdza,
        czy taki użytkownik istnieje. Jeśli go nie ma, pojawi się komunikat.
        Dla adresu e-mail zaproszenie może trafić także do osoby niezarejestrowanej jako wiadomość e-mail.
      </p>`,
      logo: `<p class="m-p">
        System pozwala ustawić własne logo, które pojawia się na wyświetlaczu
        (podczas startu lub zakończenia gry). Do tworzenia logo przechodzisz z górnego paska strony „Moje gry"
        za pomocą przycisku <span class="m-code">Logo <i class="ico" data-icon="display"></i></span>.
      </p>

      <div class="m-note">
        <b>Ważne:</b><br/>
        Logo ma rozmiar techniczny <span class="m-code">30×10</span> (kafelki znaków) albo <span class="m-code">150×70</span> (piksele).
        To ograniczenie wynika z fizycznego układu tablicy i ma zapewnić czytelność na żywo.
      </div>

      <h3 class="m-h2">Tworzenie i edycja logo</h3>

      <p class="m-p">
        Nowe logo tworzysz klikając kafelek z symbolem <i class="ico" data-icon="plus"></i>. Logo możesz zapisać pod własną nazwą. Po utworzeniu logo, żeby przystąpić do edycji, wybierz kafelek i kliknij przycisk <span class="m-code">Edytuj</span>. Otworzy się edytor, właściwy dla danego typu logo. Możesz zapisać pracę i zawsze wrócić do edycji.
      </p>

      <p class="m-p">
        Wszystkie stworzone przez Ciebie logo będą dostępne w Panelu sterowania i można będzie wybrać, którego chcesz użyć w danej rozgrywce.
      </p>

      <h3 class="m-h3">Tryby tworzenia logo</h3>

      <p class="m-p">
        Podczas tworzenia nowego logo wybierasz jeden z trybów.
        Każdy tryb prowadzi do tego samego efektu (logo na wyświetlaczu),
        ale różni się sposobem tworzenia.
      </p>

      <ul class="m-ul">
        <li>
          <span class="m-strong">Tekst</span> — klasyczne logo złożone ze znaków (styl „Familiady").
          Dobre, gdy chcesz szybko zrobić czytelny tytuł.
        </li>
        <li>
          <span class="m-strong">Rysunek</span> — rysujesz ręcznie w siatce (jak w prostym edytorze grafiki).
          Dobre do ikon i prostych kształtów.
        </li>
        <li>
          <span class="m-strong">Obraz</span> — importujesz obrazek i dopasowujesz go do tablicy.
          Dobre, gdy masz gotowe logo np. firmy.
        </li>
      </ul>

      <h3 class="m-h3">Podgląd na wyświetlaczu</h3>

      <p class="m-p">
        W edytorze cały czas widzisz podgląd „jak na tablicy".
        To ważne, bo to co wygląda dobrze w dużej rozdzielczości,
        może być nieczytelne po sprowadzeniu do <span class="m-code">150×70</span>.
      </p>

      <div class="m-note">
        <b>Praktyczna rada:</b><br/>
        Najlepiej sprawdzają się grube kształty, duże litery i wysoki kontrast.
        Cienkie linie, małe detale i delikatne przejścia zwykle znikają.
      </div>

      <h3 class="m-h3">Import i eksport logo</h3>

      <p class="m-p">
        Edytor pozwala eksportować aktywne logo do pliku oraz importować logo z pliku.
        Dzięki temu możesz przenosić logo pomiędzy kontami lub robić kopie zapasowe.
      </p>

      <div class="m-warn">
        <b>Uwaga:</b><br/>
        Nie edytuj plików logo ręcznie. To format techniczny — ręczna zmiana może spowodować,
        że import się nie powiedzie albo logo będzie działało nieprawidłowo.
      </div>`,
      connect: `<p class="m-p">
        <span class="m-strong">Podłącz urządzenie</span> to panel, gdzie możesz szybko połączyć się z urządzeniem niezbędnym do rozgrywki:
        <span class="m-strong">Wyświetlaczem</span>, <span class="m-strong">Przyciskiem do pojedynku</span>, <span class="m-strong">Prowadzącym</span>
        lub <span class="m-strong">Wyświetlaczem QR ankiety <i class="ico" data-icon="polls"></i></span>.
        Dostępny bez logowania — wystarczy 6-cyfrowy kod z Panelu sterowania.
      </p>

      <h3 class="m-h2">Wprowadź kod urządzenia</h3>

      <p class="m-p">
        Najprostszy sposób na połączenie. Operator w panelu sterowania widzi <span class="m-strong">6-cyfrowy kod</span>
        przy każdym urządzeniu (Wyświetlaczu, Prowadzącym, Przycisku).
        Wpisz ten kod i kliknij <span class="m-code">Podłącz</span> — zobaczysz podgląd urządzenia i po potwierdzeniu
        zostaniesz na nie przekierowany.
      </p>

      <p class="m-p">
        Kod <span class="m-strong">Wyświetlacza QR ankiety <i class="ico" data-icon="polls"></i></span> znajdziesz w zakładce
        <span class="m-code">Ankieta</span> — kliknij <span class="m-code">QR na wyświetlaczu</span>.
        Po podłączeniu TV lub rzutnik wyświetla kod QR do głosowania dla uczestników.
      </p>

      <div class="m-note">
        <b>Jak skorzystać z kodu?</b><br/>
        1. Operator otwiera panel sterowania i widzi kody przy urządzeniach.<br/>
        2. Wejdź na <span class="m-code">familiada.online</span> (lub otwórz aplikację).<br/>
        3. Kliknij przycisk <span class="m-code">Podłącz urządzenie <i class="ico" data-icon="phone"></i></span>.<br/>
        4. Wpisz 6-cyfrowy kod i naciśnij <span class="m-code">Podłącz</span>.
      </div>

      <h3 class="m-h2">Urządzenia udostępnione dla mnie</h3>

      <p class="m-p">
        Tutaj widzisz urządzenia, które tobie udostępnił któryś z użytkowników (opcja dostępna tylko dla zalogowanych).
        Klikając w nie możesz się z nim połączyć — zostaniesz przekierowany na stronę urządzenia.
      </p>

      <div class="m-note">
        <b>Ważne:</b><br/>
        Jeśli jesteś na telefonie lub tablecie, będziesz w stanie połączyć się tylko z <span class="m-strong">Przyciskiem</span> lub <span class="m-strong">Prowadzącym</span>.
        Jeśli na komputerze lub telewizorze — tylko z <span class="m-strong">Wyświetlaczem</span>.
      </div>

      <h3 class="m-h2">Skanuj kod QR</h3>

      <p class="m-p">
        Opcja dostępna tylko na urządzeniach mobilnych w aplikacji webowej.
        Pozwala szybko połączyć się z urządzeniem używając kamery.
        Po prostu zeskanuj kod QR pokazany przez Panel sterowania na Wyświetlaczu lub bezpośrednio w panelu.
      </p>

      <div class="m-note">
        <b>Wskazówka:</b><br/>
        Dla najlepszego użytkowania przycisku i prowadzącego sugerowane jest zainstalowanie aplikacji webowej Familiada.online.
        Na swoim telefonie na stronie <span class="m-strong">Moje gry</span> kliknij przycisk <span class="m-code"><i class="ico" data-icon="download"></i></span> — dostaniesz wskazówki, jak ją pobrać.
      </div>`,
      control: `<p class="m-p">Do Panelu sterowania przechodzisz z listy „Moje gry&quot; za pomocą przycisku <span class="m-code">Graj</span>. Ten tryb jest przeznaczony wyłącznie do prowadzenia rozgrywki na żywo — w tym miejscu nie edytujesz już pytań ani wyników ankiety.</p>
<p class="m-p">Panel sterowania prowadzi operatora krok po kroku: najpierw podłączasz urządzenia, potem ustawiasz parametry rozgrywki, a na końcu przechodzisz przez rundy i (opcjonalnie) finał. Kolejne kroki odblokowują się dopiero wtedy, gdy poprzednie są gotowe, co minimalizuje ryzyko pomyłek podczas rozgrywki.</p>
<h3 class="m-h2">Co musi być gotowe, zanim zaczniesz</h3>
<ul class="m-ul">
<li><p class="m-p">Gra powinna mieć przygotowane pytania i odpowiedzi (z edytora), a jeśli jest to gra ankietowa — powinna być zakończona i zatwierdzona.</p>
</li>
<li><p class="m-p">Operator powinien mieć komputer z dużym ekranem, na którym pytanie, odpowiedzi i podpowiedzi są czytelne.</p>
</li>
<li><p class="m-p">Powinny być przygotowane osobne urządzenia: wyświetlacz (TV/rzutnik), urządzenie prowadzącego, oraz urządzenie pełniące rolę przycisku.</p>
</li>
<li><p class="m-p">Stabilne Wi-Fi (najczęstsza przyczyna problemów to usypianie przeglądarki lub przełączanie sieci).</p>
</li>
</ul>
<p class="m-p"><strong>Dlaczego tyle „formalności&quot;?</strong></p>
<p class="m-p">Rozgrywka jest na żywo i ma telewizyjne tempo. Panel sterowania ma pilnować procedury, a nie dokładać operatorowi stresu. Dlatego system wymusza gotowość sprzętu i ustawień przed startem.</p>
<h3 class="m-h2">Kto co widzi</h3>
<p class="m-p">System celowo rozdziela ekrany, żeby każdy robił swoje:</p>
<ul class="m-ul">
<li><p class="m-p"><strong>Operator (Panel sterowania)</strong> — widzi wszystkie przyciski, status gry, bank, X-y, komunikaty i kolejne kroki procedury. Operator steruje tym, co pojawia się na tablicy.</p>
</li>
<li><p class="m-p"><strong>Wyświetlacz</strong> — pokazuje tablicę gry: pytania, odpowiedzi, punkty, bank, błędy (X) oraz ekrany startu i zakończenia. To ekran widoczny dla uczestników i widowni.</p>
</li>
<li><p class="m-p"><strong>Prowadzący</strong> — dostaje treści do odczytania i podgląd kontekstu, ale nie steruje przebiegiem gry (steruje operator).</p>
</li>
<li><p class="m-p"><strong>Przycisk</strong> — służy do sygnału w pojedynku (kto pierwszy).</p>
</li>
</ul>
<p class="m-p">Tablet Prowadzącego ma dwie części. W pionie są to część górna i dolna, a w poziomie lewa i prawa. Pierwsza podaje etap gry oraz, zależnie od etapu, pytanie. Druga zawiera materiały potrzebne do prowadzenia: listę odpowiedzi, pytania finału albo szczegóły aktualnego dopasowania. Druga część może być przykryta zasłoną.</p>
<p class="m-p"><strong>Zasłona na tablecie Prowadzącego</strong></p>
<ul class="m-ul">
<li>W pionie przesuń zasłonę <strong>w dół</strong>, aby odsłonić treść; <strong>w górę</strong>, aby zasłonić.</li>
<li>W poziomie przesuń <strong>w prawo</strong>, aby odsłonić; <strong>w lewo</strong>, aby zasłonić.</li>
<li>Na zasłonie i pod odsłoniętą treścią są wskazówki odpowiednie do orientacji urządzenia.</li>
<li>Odsłonięcie służy tylko prowadzącemu. Nie odkrywa odpowiedzi dla publiczności i nie zatwierdza żadnej akcji gry. Zasłona chroni pytania i odpowiedzi przed przypadkowym zobaczeniem przez graczy.</li>
<li><strong>Każda nowa zmiana stanu gry przywraca zasłonę</strong>, jeśli dany stan wymaga zasłonięcia. Dlatego po działaniu operatora może być potrzebny kolejny gest.</li>
</ul>
<p class="m-p">Odsłoń treść na swoim urządzeniu, gdy potrzebujesz przeczytać pytanie albo sprawdzić odpowiedzi. Nie traktuj zasłony jako informacji, że odpowiedzi zniknęły z gry.</p>
<h4 class="m-h3">Układ Panelu sterowania</h4>
<p class="m-p">W górnym pasku sprawdzisz połączenie Wyświetlacza, Prowadzącego i Przycisku. Przyciski urządzeń pozwalają wrócić do ich linków, kodów i udostępniania także w trakcie gry. Główna część panelu zmienia się wraz z etapem: w przygotowaniu pokazuje urządzenia lub Podsumowanie, w rundach pytanie i odpowiedzi, a w finale pola wpisywania albo ocenę pojedynczej odpowiedzi.</p>
<p class="m-p">Kolumna podpowiedzi wyjaśnia, kto teraz odpowiada i na jaką czynność czeka system. Pasek pod planszą pokazuje bieżące informacje: w rundach drużynę grającą i bank, a przy odsłanianiu finału sumę punktów. Przycisk dalszego przejścia opisuje następny krok. Nie musisz zgadywać, co zrobi <span class="m-code">Dalej</span> — przy ważnych przejściach jego nazwa zmienia się np. na <span class="m-code">Przejdź do finału</span> lub <span class="m-code">Zakończ finał</span>.</p>
<h3 class="m-h2">1) Urządzenia</h3>
<p class="m-p">Pierwszy etap w panelu to podłączenie urządzeń. W górnym pasku panelu widzisz trzy statusy: <strong>Wyświetlacz</strong>, <strong>Prowadzący</strong>, <strong>Przycisk do pojedynku</strong>. Operator zaczyna od podłączenia wymaganych urządzeń. Prowadzący jest opcjonalny — rozgrywkę można prowadzić bezpośrednio z Panelu sterowania.</p>
<h4 class="m-h3">Wyświetlacz</h4>
<p class="m-p">Panel pokazuje <strong>6-cyfrowy kod</strong> dla Wyświetlacza. Najlepiej otworzyć Wyświetlacz na telewizorze lub rzutniku w trybie pełnoekranowym (bez pasków przeglądarki). Dopiero gdy Wyświetlacz jest połączony, panel pozwala przejść dalej.</p>
<p class="m-p"><strong>Jak wygodnie wyświetlić tablicę na drugim ekranie?</strong></p>
<p class="m-p">Dla najlepszego efektu użyj trybu rozszerzonego ekranu. W systemie <strong>Windows</strong> przełączysz go skrótem <span class="m-code">Win + P</span>, a na <strong>Macu</strong> użyj <span class="m-code">⌘ F1</span> (czasem dodatkowo <span class="m-code">Fn</span>).</p>
<p class="m-p">Następnie otwórz tablicę w nowym oknie przeglądarki, przeciągnij je na drugi ekran i włącz tryb pełnoekranowy. Dzięki temu możesz jednocześnie sterować na swoim urządzeniu i wyświetlać treść dla innych.</p>
<p class="m-p"><strong>Telewizor jako osobne urządzenie</strong></p>
<p class="m-p">Na komputerze otwórz kod Wyświetlacza w Panelu sterowania. W przeglądarce telewizora wejdź na <a href="http://www.familiada.online">www.familiada.online</a>. Rozpoznany TV pokaże uproszczoną stronę podłączenia z logo Familiady, polem na sześciocyfrowy kod i przyciskiem <span class="m-code">Podłącz</span>. Wpisz kod Wyświetlacza. Nie trzeba logować się na telewizorze ani podłączać go przewodem do komputera.</p>
<p class="m-p">Pole kodu jest wybrane od razu. Strzałki góra i dół przełączają między polem a przyciskiem; OK lub Enter zatwierdza. Na Wyświetlaczu odblokuj dźwięk, jeśli ma grać z telewizora. Przeglądarka może pozwolić na pełny ekran dopiero po naciśnięciu pilota.</p>
<p class="m-p">Możesz też otworzyć na TV bezpośredni link Wyświetlacza skopiowany z Panelu sterowania. Jeżeli przeglądarka telewizora nie została rozpoznana, otwórz <a href="https://www.familiada.online/connect-device/tv/">stronę podłączenia TV</a> i wpisz kod. Dotyczy to również niestandardowej przeglądarki na Apple TV. Na TV można podłączyć Wyświetlacz gry albo Wyświetlacz QR ankiety; kody Prowadzącego i Przycisku są odrzucane.</p>
<h4 class="m-h3">Prowadzący i Przycisk</h4>
<p class="m-p">Następnie podłączasz urządzenie prowadzącego i urządzenie przycisku. Panel pokazuje <strong>6-cyfrowy kod</strong> i kod QR dla każdego z nich. W praktyce najlepiej użyć dwóch osobnych telefonów albo telefonu i tabletu.</p>
<p class="m-p">Dostępna jest opcja <span class="m-code">QR na wyświetlaczu</span> — po jej użyciu kody QR mogą zostać pokazane na dużym ekranie (po podłączeniu wyświetlacza), żeby ekipa mogła szybko zeskanować je telefonami. To przyspiesza start na planie, bo nie trzeba przepisywać linków.</p>
<p class="m-p">Poprzez opcję <span class="m-code">Udostępnij</span> możesz wysłać komuś link w wiadomości e-mail lub udostępnić go swoim subskrybentom. Udostępnione urządzenia będą widoczne na koncie (tylko dla zarejestrowanych) w panelu <span class="m-code">Podłącz urządzenie</span> <span class="m-code"><i class="ico" data-icon="phone"></i></span>. Osoby niezarejestrowane otrzymają link w wiadomości e-mail.</p>
<p class="m-p"><strong>Jak wygodnie podłączyć urządzenie?</strong></p>
<p class="m-p">Najprostszy sposób: wejdź na <span class="m-code">familiada.online</span>, kliknij <span class="m-code">Podłącz urządzenie</span> <span class="m-code"><i class="ico" data-icon="phone"></i></span> w górnym pasku i wprowadź <strong>6-cyfrowy kod</strong> widoczny przy urządzeniu w Panelu sterowania.</p>
<p class="m-p">Alternatywnie: na urządzeniu mobilnym możesz zeskanować <strong>kod QR</strong> widoczny w panelu. Dla najlepszego użytkowania sugerowane jest zainstalowanie aplikacji webowej — na stronie <strong>Moje gry</strong> kliknij przycisk <span class="m-code"><i class="ico" data-icon="download"></i></span>, aby uzyskać wskazówki.</p>
<p class="m-p"><strong>Tryb bez tabletu prowadzącego</strong></p>
<p class="m-p">Jeśli prowadzący nie korzysta z osobnego urządzenia (telefonu/tabletu), zaznacz opcję <span class="m-code">Nie używaj tabletu prowadzącego</span> przy urządzeniu Prowadzący. Po zaznaczeniu: przyciski i kod połączenia dla prowadzącego są wyszarzone, podpięcie urządzenia prowadzącego nie jest wymagane do przejścia dalej, a kontrolka Prowadzącego w górnym pasku staje się nieaktywna. Operator może samodzielnie prowadzić rozgrywkę z panelu sterowania.</p>
<p class="m-p"><strong>Przycisk fizyczny</strong></p>
<p class="m-p">Jeśli zamiast Przycisku do pojedynku w przeglądarce używasz przycisku fizycznego, (np. sprzętowego przycisku podłączonego inną ścieżką), zaznacz opcję <span class="m-code">Przycisk fizyczny</span> przy urządzeniu Przycisk. Po zaznaczeniu: podpięcie urządzenia przycisku nie jest wymagane, a przebieg pojedynku zmienia się — operator sam decyduje, kto nacisnął pierwszy.</p>
<p class="m-p">W trybie fizycznego przycisku przebieg pojedynku wygląda tak:</p>
<ul class="m-ul">
<li><p class="m-p">Po uruchomieniu pojedynku pojawiają się dwa przyciski: <span class="m-code">Drużyna A</span> i <span class="m-code">Drużyna B</span>.</p>
</li>
<li><p class="m-p">Operator klika drużynę, która nacisnęła fizyczny przycisk jako pierwsza — kafelek tej drużyny się podświetla.</p>
</li>
<li><p class="m-p">Operator klika <span class="m-code">Zatwierdź</span>, aby potwierdzić wybór i przejść dalej.</p>
</li>
</ul>
<p class="m-p"><strong>Rozłączenie urządzenia</strong></p>
<p class="m-p">Gdy wymagane urządzenie przestaje zgłaszać obecność, po około 6,5 sekundy Panel sterowania pokazuje jednorazowo okno z nazwami odłączonych urządzeń i blokuje dalsze działania. Sprawdź internet w Panelu sterowania i na urządzeniach. Jeśli połączenie nie wróci, podłącz je ponownie przyciskami w górnym pasku. Gra odblokuje się po powrocie wszystkich wymaganych urządzeń. Urządzenia pominięte w przygotowaniu nie blokują rozgrywki.</p>
<p class="m-p">Działania zatwierdzone przed wykryciem rozłączenia pozostają zapisane. Czynność już wysłana może jeszcze zakończyć zapis; system nie cofa wyniku. Urządzenie po powrocie pokazuje aktualny stan gry, bez powtarzania pominiętych animacji. Uruchomiony zegar nadal odlicza czas.</p>
<h4 class="m-h3">Dźwięk</h4>
<p class="m-p">Wybierz źródło dźwięku: „Panel sterowania” albo „Wyświetlacz”. Dźwięki gry odtwarzane są tylko na wybranym urządzeniu. Jeśli wybierasz Wyświetlacz, naciśnij na nim przycisk odblokowania dźwięku. Na telewizorze można użyć OK lub Enter na pilocie. Przeglądarka może wymagać kliknięcia, zanim pozwoli na odtwarzanie. Po podłączeniu sprawdź również poziom głośności samego telewizora lub głośników.</p>
<div class="m-warn"><strong>Uwaga:</strong> Źródło „Wyświetlacz” wybierz, gdy dźwięk ma odtwarzać osobny telewizor lub inne osobne urządzenie na którym będzie otwarta karta urządzenia „Wyświetlacz”. Przy HDMI zwykle wygodniej pozostawić „Panel sterowania” i wybrać telewizor jako wyjście dźwięku w ustawieniach komputera. Po podłączeniu HDMI system często robi to automatycznie. Przy AirPlay przesyłasz obraz i dźwięk z Maca, iPhone’a lub iPada na Apple TV.</div>
<p class="m-p"><strong>Skrót:</strong> M wycisza lub przywraca dźwięk od razu, bez Entera.</p>
<h3 class="m-h2">2) Ustawienia</h3>
<p class="m-p"><strong>Prowadzący:</strong> Tablet pokazuje logo wybrane w ustawieniach gry. Gdy wcześniej trwa edycja tego logo, pokazuje domyślne logo Familiady. Przy wejściu operatora w Podsumowanie ustawień pobiera wybrane logo ponownie; wcześniej pokazane logo domyślne zostaje wtedy zastąpione właściwym.</p>
<p class="m-p">Gdy urządzenia są połączone, przechodzisz do podsumowania ustawień. Wszystkie opcje (kolory, dźwięk, parametry gry) możesz wcześniej skonfigurować na stronie <strong>Ustawień rozgrywki</strong> — Panel sterowania wczyta je automatycznie.</p>
<p class="m-p"><strong>Skróty:</strong> W Podsumowaniu E zaznacza zmianę ustawień, a Enter ją otwiera. B i Enter wracają, gdy powrót jest dostępny.</p>
<h4 class="m-h3">Nazwy drużyn</h4>
<p class="m-p">Nazwy drużyn sprawdź w Podsumowaniu. Wyświetlacz pozostaje wtedy czarny; nazwy pojawią się dopiero po <span class="m-code">Gotowe — przejdź do rozgrywki</span>, na ekranie z przyciskiem <span class="m-code">Rozpocznij grę</span>. Puste pola w Ustawieniach rozgrywki oznaczają nazwy „Drużyna A” i „Drużyna B”.</p>
<h4 class="m-h3">Wygląd</h4>
<ul class="m-ul">
<li><p class="m-p"><strong>Kolory</strong> — kolory drużyn, tła i kropek.</p>
</li>
<li><p class="m-p"><strong>Motyw</strong> — styl wizualny tablicy.</p>
</li>
<li><p class="m-p"><strong>Logo</strong> — logo wyświetlane w trakcie rozgrywki.</p>
</li>
</ul>
<h4 class="m-h3">Dźwięk</h4>
<ul class="m-ul">
<li><p class="m-p">Przy każdej kategorii dźwiękowej widzisz aktualny <strong>wariant</strong> (np. Klasyczny lub nazwę własnego pliku).</p>
</li>
<li><p class="m-p">Suwak <strong>głośności</strong> pozwala dostosować poziom każdego dźwięku.</p>
</li>
<li><p class="m-p">Przycisk <span class="m-code"><i class="ico" data-icon="play"></i></span> pozwala odsłuchać dźwięk przed rozgrywką.</p>
</li>
</ul>
<p class="m-p">Jeśli zmienisz poziom głośności tutaj, zostanie on zmieniony tylko dla tej konkretnej rozgrywki. Przy ponownym uruchomieniu rozgrywki zostaną wczytane wartości nadane w <strong>Ustawieniach rozgrywki</strong>.</p>
<h4 class="m-h3">Finał</h4>
<p class="m-p">Tu zobaczysz tylko potwierdzenie, czy rozgrywka ma finał.</p>
<p class="m-p">Jeśli finał jest włączony i wybrano tryb <strong>Ręcznie</strong> — tutaj zobaczysz wybrane przez Ciebie 5 pytań finałowych. Przy trybie <strong>Losuj</strong> zobaczysz wylosowane pytania finałowe. Możesz użyć <span class="m-code">Losuj ponownie</span> przy tej sekcji, aby zmienić zestaw przed rozpoczęciem gry. Wybrana kolejność i ręcznie wybrane pytania finału pozostają bez zmian.</p>
<h4 class="m-h3">Rundy: kolejność pytań</h4>
<p class="m-p">Jeśli wybrano tryb <strong>Kolejność</strong> dla pytań rund — tutaj będzie widoczna kolejność pytań, które zostaną użyte podczas rozgrywki zasadniczej. Przy trybie <strong>Losuj</strong> zobaczysz wylosowane pytania rund.  Możesz użyć <span class="m-code">Losuj ponownie</span> przy pytaniach rund, aby zmienić ich kolejność przed rozpoczęciem gry.</p>
<p class="m-p">Zawsze możesz wybrać <span class="m-code">Zmień ustawienia</span>, aby otworzyć okno ustawień. Szczegóły znajdziesz w <a href="#ustawienia-rozgrywki">Ustawieniach rozgrywki</a>.</p>
<p class="m-p">Gdy wszystko się zgadza — kliknij <span class="m-code">Gotowe — przejdź do rozgrywki</span>.</p>
<h4 class="m-h3">Zaznaczanie i zatwierdzanie</h4>
<p class="m-p">Pierwsze kliknięcie kafelka wymagającego potwierdzenia zaznacza go. Drugie zatwierdza czynność. W ten sposób przyjmujesz zgłoszenie, odsłaniasz odpowiedzi w rundach, dodajesz X i oddajesz kontrolę. Samo zaznaczenie nie zmienia wyniku. Wyszarzone przyciski są niedostępne; podczas dźwięku lub przejścia poczekaj, aż panel je odblokuje. Wskazówki do bieżącego kroku znajdziesz w kolumnie podpowiedzi.</p>
<div class="m-note"><strong>Wskazówka:</strong> Zaznaczenie kafelka pozwala sprawdzić wybór przed wykonaniem czynności. Punkty i plansza zmieniają się dopiero po zatwierdzeniu. Jeśli panel czeka na dźwięk lub przejście, pozwól mu je dokończyć.</div>
<div class="m-note"><strong>Ważne:</strong> Litery i cyfry w aktywnym polu pozostają zwykłym tekstem. Skróty nie omijają blokad, dźwięków ani animacji i nie wykonują czynności w tle otwartego okna. Restart nie ma skrótu.</div>
<h3 class="m-h2">3) Rozpoczęcie gry</h3>
<p class="m-p">Po sprawdzeniu Podsumowania wybierz <span class="m-code">Gotowe — przejdź do rozgrywki</span>. Wyświetlacz aktywuje się i pokazuje nazwy drużyn, bez logo i planszy odpowiedzi. Przycisk do pojedynku jest już widoczny, ale jeszcze nie przyjmuje naciśnięć.</p>
<div class="m-note"><strong>Wskazówka:</strong> W tym stanie możesz pozostawić panel aż do rozpoczęcia właściwej rozgrywki. Kolejne etapy prowadzisz już w telewizyjnym tempie.</div>
<p class="m-p"><span class="m-code">Rozpocznij grę</span> uruchamia intro i animowane wejście logo na Wyświetlaczu. Po zakończeniu przejścia wybierz <span class="m-code">Rozpocznij rundę</span>, aby otworzyć planszę pytania i rozpocząć pojedynek.</p>
<p class="m-p"><strong>Prowadzący:</strong> Treść pytania będzie dostępna na etapie pojedynku. Nie odczytuj materiałów przed przygotowaniem zawodników.</p>
<h3 class="m-h2">4) Rundy — przebieg gry krok po kroku</h3>
<p class="m-p">W rundach prowadzisz właściwą rozgrywkę: pytania, odpowiedzi, punkty i bank rundy. Gracze widzą tablicę na wyświetlaczu, prowadzący zadaje pytania i pilnuje przebiegu, a operator odsłania odpowiedzi, nalicza punkty oraz dodaje błędy (X).</p>
<p class="m-p">Najważniejsza zasada w praktyce: prowadzący skupia się na uczestnikach, a operator na obsłudze systemu. Dzięki temu gra jest płynna, a tablica pokazuje właściwe informacje.</p>
<div class="m-note"><strong>Wskazówka:</strong> Możesz połączyć rolę operatora i prowadzącego, ale wymaga to sprawnego przechodzenia między rozmową z uczestnikami a obsługą panelu.</div>
<h4 class="m-h3">Pojedynek: kto przejmuje kontrolę</h4>
<p class="m-p">Każde pytanie zaczyna się od pojedynku „głów rodzin”. Przycisk rozświetla się od razu po naciśnięciu, a zgłoszenie informuje operatora, kto był pierwszy. Operator przyjmuje wskazaną drużynę. Jeśli zgłaszanie trzeba powtórzyć, wybierz <span class="m-code">Ponów naciśnięcie</span>. W trybie fizycznego przycisku operator wskazuje drużynę ręcznie.</p>
<p class="m-p">Zgodnie z regulaminem, jeśli pierwsza odpowiedź nie jest najwyżej punktowana, druga „głowa&quot; ma szansę odpowiedzieć lepiej i przejąć kontrolę. Panel prowadzi operatora przez decyzję kontroli rundy, a wyświetlacz pokazuje, która drużyna aktualnie gra (wskaźnik drużyny).</p>
<p class="m-p"><strong>Prowadzący:</strong> Tytuł „RUNDA 1 — PRZYCISK” oznacza, że trwa pojedynek, także po przyjęciu zgłoszenia przez operatora. Pytanie i pełną treść odpowiedzi z punktami zobaczysz po odsłonięciu drugiej części. Zasłona zapobiega przypadkowemu odczytaniu pytania przez graczy przed jego zadaniem. Numer w tytule zmienia się wraz z rundą.</p>
<p class="m-p"><strong>Skróty:</strong> C i Enter zatwierdzają drużynę wskazaną przez Przycisk. W trybie fizycznego przycisku A/B zaznacza drużynę, a Enter zatwierdza.</p>
<h4 class="m-h3">Oddanie pytania</h4>
<p class="m-p">Zgodnie z ustaleniami rozgrywki, po uzyskaniu kontroli drużyna może też zdecydować, że <strong>oddaje pytanie</strong> przeciwnikom. Jest to ruch taktyczny: zamiast „dobić&quot; pytanie, drużyna może przekazać szansę rywalom. Panel udostępnia tę opcję tylko w odpowiednim momencie i pilnuje, żeby nie dało się jej nadużywać.</p>
<p class="m-p"><strong>Prowadzący:</strong> Gdy można oddać kontrolę, w pierwszej części pojawia się czerwona, podkreślona podpowiedź. Ten styl dotyczy wyłącznie tabletu prowadzącego. Decyzję drużyny realizuje operator w Panelu sterowania.</p>
<p class="m-p"><strong>Skrót:</strong> P zaznacza oddanie kontroli, Enter je zatwierdza.</p>
<p class="m-p"><strong>Prowadzący:</strong> Podpowiedź o możliwości oddania kontroli jest czerwona i podkreślona.</p>
<h4 class="m-h3">Rozgrywka pytania: odsłanianie odpowiedzi i bank</h4>
<p class="m-p">Po ustaleniu kontroli drużyna odpowiada, a operator zaznacza i zatwierdza trafione odpowiedzi. Na Wyświetlaczu najpierw odsłania się odpowiedź, a potem zmienia się bank rundy. Kafelek odsłoniętej odpowiedzi w panelu staje się zielony i nie przyznaje punktów ponownie. Bank to punkty z bieżącego pytania; wynik drużyny zostanie uzupełniony przy rozliczeniu rundy, z uwzględnieniem mnożnika.</p>
<p class="m-p">Rozgrywka trwa do odsłonięcia wszystkich odpowiedzi albo trzech pudeł drużyny grającej. Trzeci X uruchamia kradzież przez przeciwników. Podpowiedź w panelu wskazuje aktualny etap i dostępny następny krok.</p>
<p class="m-p"><strong>Prowadzący:</strong> „RUNDA 1 — ROZGRYWKA” oznacza grę drużyny po pojedynku. Pytanie jest już jawne w pierwszej części. W drugiej widzisz pełne odpowiedzi i punkty, także jeszcze zakryte na Wyświetlaczu. Wiersz „2) Rower (24)” oznacza drugą odpowiedź i 24 punkty. Zielony wiersz oznacza odpowiedź odsłoniętą publiczności. Prowadzący nie pokazuje banku, X ani wyników drużyn — sprawdzaj je na Wyświetlaczu lub w panelu.</p>
<p class="m-p"><strong>Skróty:</strong> 1–6 zaznacza odpowiedź, Enter ją odsłania.</p>
<h4 class="m-h3">Pudła (X) i limit 3 sekund</h4>
<p class="m-p">Błędna odpowiedź jest oznaczana symbolem <strong>X</strong> na tablicy. Trzy błędy oznaczają utratę kontroli i przejście do kradzieży przez przeciwników. System ma także mechanikę limitu czasu <strong>3 sekund</strong> na odpowiedź — przekroczenie limitu jest traktowane jak pudło (X).</p>
<p class="m-p"><strong>Po co odliczanie?</strong></p>
<p class="m-p">To jest „bat na tempo&quot;. Odliczanie pozwala operatorowi szybko zamknąć zawahanie bez dyskusji i utrzymać rytm rozgrywki.</p>
<p class="m-p"><strong>Skróty:</strong> X zaznacza pudło, T timer; Enter wykonuje zaznaczoną czynność.</p>
<h4 class="m-h3">Kradzież banku (jedna odpowiedź)</h4>
<p class="m-p">Gdy drużyna grająca wykorzysta trzy „szanse&quot; zanim odsłoni wszystkie odpowiedzi, pytanie przechodzi do drużyny przeciwnej. Przeciwnicy mają prawo do <strong>jednej odpowiedzi</strong>: jeśli trafi — bank przechodzi do nich, jeśli nie — bank zostaje u drużyny grającej. To domyka pytanie i rundę zgodnie z regulaminem.</p>
<p class="m-p"><strong>Prowadzący:</strong> Tytuł zmienia się na „RUNDA 1 — KRADZIEŻ”. Lista odpowiedzi pozostaje dostępna pod zasłoną; pytanie pozostaje jawne. Nazwę drużyny wykonującej próbę i rozstrzygnięcie sprawdzisz w panelu i na Wyświetlaczu.</p>
<h4 class="m-h3">Odsłanianie brakujących odpowiedzi i zakończenie rundy</h4>
<p class="m-p">Jeśli po tej rundzie będzie kolejna runda albo finał, a pytanie jest już rozstrzygnięte, wybierz „Zakończ rundę”. Bank zostaje dopisany właściwej drużynie z uwzględnieniem mnożnika. Jeśli pozostały zakryte odpowiedzi, odsłoń je kolejno dla publiczności — nie przyznają już dodatkowych punktów drużynie. Plansza pozostaje widoczna do kolejnego przejścia.</p>
<p class="m-p"><strong>Praktyczna uwaga:</strong></p>
<p class="m-p">Panel celowo rozdziela „rozgrywkę pytania&quot; od „zakończenia rundy&quot;. Dzięki temu operator nie skasuje przypadkiem stanu tablicy, zanim prowadzący dopowie puentę lub zanim padnie „dziękujemy&quot;.</p>
<p class="m-p"><strong>Prowadzący:</strong> „RUNDA 1 — ODSŁANIANIE” oznacza pokaz pozostałych odpowiedzi po rozliczeniu banku. Kolejne odsłonięte wiersze stają się zielone.</p>
<p class="m-p">Po odsłonięciu pozostałych odpowiedzi użyj przycisku wskazującego następną rundę albo finał.</p>
<h4 class="m-h3">Zakończenie rund i przejście dalej</h4>
<p class="m-p">Po każdej rundzie system aktualizuje wynik drużyn i sprawdza, czy spełniono warunek zakończenia rozgrywki (ustawiony w „Dodatkowych ustawieniach&quot;). Najczęściej jest to próg punktów, np. <strong>300</strong>, ale może być inny — zależnie od tego, jak chcesz poprowadzić turniej.</p>
<p class="m-p">Jeśli finał jest <strong>włączony</strong>, a próg rund został osiągnięty, przycisk dalszego przejścia prowadzi do finału. Przy zakończeniu bez finału wybierz <span class="m-code">Przejdź do zakończenia gry</span>, aby rozliczyć bank i pokazać ekran końcowy. Samo osiągnięcie progu nie pokazuje wyniku automatycznie; pozostałe działania rundy są zablokowane, a brakujących odpowiedzi nie odsłaniasz.</p>
<p class="m-p">Jeśli pytania do rund się wyczerpią przed osiągnięciem progu punktów, rozgrywka przechodzi do zakończenia gry. Sam brak pytań nie kwalifikuje do finału. Finał wymaga osiągnięcia progu i włączenia go w ustawieniach.</p>
<div class="m-warn"><strong>Uwaga:</strong> Dobierz liczbę pytań i próg punktów tak, aby nie wyczerpać pytań przed planowanym finałem. Samo włączenie finału nie gwarantuje jego rozpoczęcia.</div>
<p class="m-p"><strong>Skrót:</strong> N zaznacza aktualny przycisk dalszego przejścia, Enter go uruchamia.</p>
<h3 class="m-h2">5) Finał</h3>
<p class="m-p">W finale dwóch zawodników odpowiada na te same <strong>5 pytań</strong>. Ich punkty sumują się; celem jest ustawiony próg finału, domyślnie <strong>200 punktów</strong>. Zwykle grają dwie osoby z drużyny zwycięskiej. Za jej zgodą możesz organizacyjnie wybrać po jednym zawodniku z każdej drużyny — system nadal rozlicza jeden wspólny finał zwycięzców.</p>
<h4 class="m-h3">Przygotowanie finału</h4>
<p class="m-p">Przed grą sprawdź pięć pytań w Podsumowaniu. Przy trybie <strong>Ręcznie</strong> wybierz je w Ustawieniach rozgrywki; przy trybie <strong>Losuj</strong> system dobiera je automatycznie. Przygotuj miejsce oczekiwania i słuchawki z muzyką dla drugiego zawodnika: podczas pierwszej rundy nie może słyszeć pytań ani odpowiedzi.</p>
<p class="m-p"><span class="m-code">Rozpocznij finał</span> otwiera planszę finału. Wynik zwycięskiej drużyny pozostaje widoczny, a miejsce wyniku przeciwnej drużyny jest przeznaczone na zegar. Suma finału jest pokazywana w banku na górze.</p>
<p class="m-p"><strong>Prowadzący:</strong> Podczas przygotowania finału tablet nie pokazuje materiałów. Materiały pojawiają się po rozpoczęciu pierwszej rundy.</p>
<h4 class="m-h3">Gracz 1 — przygotowanie i wpisywanie</h4>
<p class="m-p">Upewnij się, że drugi zawodnik oczekuje poza grą. Prowadzący czyta po kolei pytania; operator wpisuje odpowiedzi przy właściwych pytaniach. Odpowiedzi nie są jeszcze oceniane ani pokazywane publiczności.</p>
<p class="m-p">Zegar pierwszego gracza ma <strong>15 sekund</strong>. Nie rusza po samym otwarciu etapu: uruchom go przyciskiem albo skrótem <strong>Ctrl + Enter</strong> (Mac: <strong>⌘ + Enter</strong>). Tym samym przyciskiem lub skrótem możesz zatrzymać odliczanie. Enter i strzałka w dół przechodzą do następnego pustego pola, a strzałka w górę do poprzedniego pustego pola. Po ostatnim pytaniu przechodzisz do pierwszego. Żeby poprawić uzupełnioną odpowiedź, kliknij jej pole. Puste pole to brak wpisu, nie ostateczna ocena odpowiedzi. Każdy gracz musi wykorzystać timer przed przejściem do dopasowania. Ręczne zatrzymanie jest dostępne dopiero po wpisaniu tekstu we wszystkich pięciu polach; samo Powtórzenie nie wypełnia pola. Po naturalnym upływie czasu możesz przejść dalej z brakami.</p>
<div class="m-note"><strong>Wskazówka:</strong> Po upływie czasu możesz poprawić literówki i uzupełnić zapamiętaną odpowiedź, gdy prowadzący jeszcze rozmawia z zawodnikiem. Poprawki są możliwe również podczas dopasowania, do odsłonięcia odpowiedzi.</div>
<p class="m-p"><strong>Prowadzący podczas wpisywania:</strong></p>
<p class="m-p">Pierwsza część pokazuje <span class="m-code">FINAŁ RUNDA 1</span> albo <span class="m-code">FINAŁ RUNDA 2</span>. Po uruchomieniu zegara tytuł zawiera także odliczanie, np. <span class="m-code">FINAŁ RUNDA 1 — ODLICZANIE 12s</span>. Jest to pozostały czas bieżącego gracza. Bez uruchomionego zegara tytuł nie zawiera sekund.</p>
<p class="m-p">Druga część pokazuje pięć pytań z numerami i statusem wpisu, np.:</p>
<pre class="m-pre">1) Wymień środek transportu. — wpisano
2) Co zabierasz na wakacje? — brak
3) Co pijesz rano? — powtórzenie</pre>
<table>
<thead>
<tr>
<th>Status przy pytaniu</th>
<th>Znaczenie</th>
</tr>
</thead>
<tbody><tr>
<td><span class="m-code">wpisano</span></td>
<td>Operator zapisał niepusty tekst odpowiedzi. To jeszcze nie potwierdzenie trafienia ani przyznania punktów.</td>
</tr>
<tr>
<td><span class="m-code">brak</span></td>
<td>Pole odpowiedzi jest puste. Nie oznacza to automatycznie, że gracz już definitywnie pominął pytanie.</td>
</tr>
<tr>
<td><span class="m-code">powtórzenie</span></td>
<td>Przy graczu 2 operator oznaczył odpowiedź jako powtórzoną po graczu 1. Przy odsłanianiu daje zero punktów.</td>
</tr>
</tbody></table>
<p class="m-p">Na tym etapie prowadzący czyta pytania i śledzi, gdzie operator ma już wpis. Ekran pokazuje statusy, <strong>nie treść właśnie wpisywanych odpowiedzi</strong>. Treść wpisu jest dostępna przy późniejszym mapowaniu.</p>
<p class="m-p"><strong>Skróty:</strong> Ctrl+Enter (⌘+Enter na Macu) uruchamia lub zatrzymuje timer. ↑ / ↓ / Enter przechodzą tylko między pustymi polami; poprawienie uzupełnionego wymaga kliknięcia.</p>
<h4 class="m-h3">Gracz 1 — dopasowanie i odsłanianie</h4>
<p class="m-p">Po zakończeniu odpowiadania przejdź do odsłaniania. Dla każdego pytania porównaj wpis z listą punktowanych odpowiedzi i wybierz pasującą pozycję albo <span class="m-code">Nie ma na liście (0 pkt)</span>. Wyświetlacz pokazuje wybraną odpowiedź, a pełny wpis pozostaje w panelu. Przy trafieniu odsłoń odpowiedź, a następnie punkty. Przy wpisanej błędnej odpowiedzi odsłoń tekst, a następnie zero. Brak odpowiedzi automatycznie pokazuje odpowiedź i zero. Dopasowanie samo nie nalicza punktów; suma zwiększa się przy odsłonięciu punktów.</p>
<div class="m-note"><strong>Wskazówka:</strong> Jeśli pokażesz dosłownie wpisaną odpowiedź, której nie ma na liście, możesz wcześniej poprawić literówki w polu. Po odsłonięciu nie można już zmienić odpowiedzi.</div>
<p class="m-p"><strong>Prowadzący podczas odsłaniania:</strong></p>
<p class="m-p">Pierwsza część pokazuje np. <span class="m-code">FINAŁ — ODSŁANIANIE (RUNDA 2)</span> oraz <span class="m-code">Pytanie 3: …</span>. Numer określa aktualnie oceniane pytanie, a „RUNDA 2” oznacza drugiego gracza finału.</p>
<p class="m-p">Druga część zawiera:</p>
<ol class="m-ul">
<li><strong><span class="m-code">Gracz 1: …</span></strong> — tylko przy mapowaniu gracza 2. To wcześniejsza, wybrana odpowiedź pierwszego gracza na to samo pytanie; <span class="m-code">—</span> oznacza brak odpowiedzi.</li>
<li><strong><span class="m-code">Wprowadzono: …</span></strong> — tekst wpisany przez operatora dla aktualnego gracza. Wiersz jest pomijany, jeśli nie ma wpisu albo oznaczono powtórzenie.</li>
<li><strong><span class="m-code">Stan: …</span></strong> — informacja o obecnym dopasowaniu, według tabeli poniżej.</li>
<li><strong><span class="m-code">Lista odpowiedzi:</span></strong> — wszystkie odpowiedzi z bazy na bieżące pytanie, z punktami w nawiasach, od najwyżej punktowanej.</li>
</ol>
<table>
<thead>
<tr>
<th>Stan</th>
<th>Wygląd</th>
<th>Jak go interpretować</th>
</tr>
</thead>
<tbody><tr>
<td><span class="m-code">z listy</span></td>
<td>Zielony napis. Wybrana odpowiedź na liście jest zielona i przekreślona.</td>
<td>Wpis został przypisany do konkretnej odpowiedzi z bazy. Przekreślenie na liście oznacza wybraną pozycję, <strong>nie błąd ani anulowanie</strong>.</td>
</tr>
<tr>
<td><span class="m-code">nie ma na liście</span></td>
<td>Żółty napis.</td>
<td>Jest wpis, ale nie przypisano go do odpowiedzi z bazy. Jeśli pozostawisz ten wybór, Wyświetlacz pokaże dosłownie wpisaną odpowiedź, a po odsłonięciu punktów — zero. Przed odsłonięciem możesz zmienić dopasowanie.</td>
</tr>
<tr>
<td><span class="m-code">brak odpowiedzi</span></td>
<td>Czerwony napis.</td>
<td>Nie ma tekstu odpowiedzi aktualnego gracza.</td>
</tr>
<tr>
<td><span class="m-code">powtórzenie</span></td>
<td>Żółty napis.</td>
<td>Odpowiedź drugiego gracza oznaczono jako powtórzoną; nie punktuje.</td>
</tr>
</tbody></table>
<p class="m-p"><strong>Kolory w finale opisują dopasowanie, a nie etap animacji na Wyświetlaczu.</strong> Zielone „z listy” nie oznacza samo w sobie, że publiczność już zobaczyła odpowiedź lub punkty. Rozróżniaj tekst wpisany przez operatora od wybranej odpowiedzi z bazy: mogą mieć inne brzmienie, np. wpis „na rowerze” dopasowany do „Rower (24)”.</p>
<p class="m-p">W dopasowaniu gracza 1 <strong>1–6</strong> wybiera odpowiedź z listy, <strong>W</strong> wpisaną odpowiedź, a <strong>O</strong> brak odpowiedzi. Przy graczu 2 dochodzi <strong>R</strong> — powtórzenie. Zaznaczanie odbywa się od razu jednym kliknięciem lub skrótem. Pierwszy Enter odsłania odpowiedź, a następny punkty po zakończeniu przejścia. Brak odpowiedzi i powtórzenie automatycznie pokazują zero. <strong>N i Enter</strong> przechodzą do kolejnego pytania. Przy odsłanianiu myszą obowiązuje zaznaczenie i potwierdzenie drugim kliknięciem.</p>
<h4 class="m-h3">Gracz 2 — przygotowanie i wpisywanie</h4>
<p class="m-p">Jeżeli nie osiągnięto progu, po piątym pytaniu gracza 1 przejdź do przygotowania drugiego zawodnika. Tablet Prowadzącego jest czyszczony. Przypomnij zasady i możesz zaprezentować dźwięk powtórzenia.</p>
<p class="m-p"><span class="m-code">Rozpocznij 2 rundę</span> przywraca odkryte odpowiedzi gracza 1 na Wyświetlaczu. Drugi zawodnik odwraca się od tablicy, aby ich nie widzieć. Operator widzi je przy polach odpowiedzi, co pomaga rozpoznać powtórzenie. Zegar ma <strong>20 sekund</strong> i uruchamiasz go tak samo jak przy graczu 1. Prowadzący widzi tytuł „FINAŁ RUNDA 2”, odliczanie po uruchomieniu zegara i pięć pytań ze statusami wpisów.</p>
<p class="m-p">Gdy gracz powtórzy odpowiedź pierwszego zawodnika, jednym kliknięciem oznacz <span class="m-code">Powtórzenie</span> i poproś o inną odpowiedź. Każde kliknięcie odtwarza dźwięk powtórzenia, również gdy oznaczenie jest już włączone. Ponowne kliknięcie nie usuwa oznaczenia. Dopóki pozostaje czas, prowadzący może ponownie czytać pominięte pytania, także te z powtórzeniem. Gracz może się poprawić. Wpisanie nowej treści automatycznie usuwa oznaczenie powtórzenia; samo ustawienie kursora tego nie robi.</p>
<div class="m-note"><strong>Wskazówka:</strong> Pytania można czytać w kolejnych obiegach do końca czasu. <span class="m-code">Dalej</span> wypowiedziane przez zawodnika nie zamyka pytania na resztę rundy.</div>
<p class="m-p"><strong>Skróty:</strong> Ctrl+Enter (⌘+Enter na Macu) uruchamia lub zatrzymuje timer. ↑ / ↓ / Enter przechodzą tylko między pustymi polami; poprawienie uzupełnionego wymaga kliknięcia. Shift+Enter w pustym polu drugiego gracza oznacza Powtórzenie i odtwarza jego dźwięk. Kolejne naciśnięcie odtwarza dźwięk ponownie; oznaczenie usuwa wyłącznie wpisanie tekstu.</p>
<h4 class="m-h3">Gracz 2 — dopasowanie i odsłanianie</h4>
<p class="m-p">Po wpisywaniu dopasuj i odsłoń odpowiedzi drugiego gracza tak samo jak pierwszego. W panelu i na tablecie Prowadzącego „Gracz 1” wskazuje wcześniejszą wybraną odpowiedź, a „Wprowadzono” — obecny wpis operatora. Nie muszą mieć identycznego brzmienia. W dopasowaniu <span class="m-code">Powtórzenie</span> jest tylko oznaczeniem odpowiedzi: jego wybór nie odtwarza dźwięku powtórzenia. Przy odsłanianiu działa jak brak odpowiedzi — automatycznie pokazuje zero i odtwarza dźwięk błędnej odpowiedzi. Punkty obu graczy trafiają do tej samej sumy na górze Wyświetlacza.</p>
<div class="m-note"><strong>Ważne:</strong> Wyświetlacz mieści 17 znaków odpowiedzi w rundach i 11 w finale, razem ze spacjami. Dłuższy tekst jest skracany tylko na planszy; pełny pozostaje w panelu i na tablecie Prowadzącego. Kropka oznacza urwane słowo. Jeśli następny znak to spacja lub interpunkcja, kropka nie jest dodawana. Przy urwaniu słowa usuwa się dodatkowo do dwóch końcowych samogłosek przed kropką. Dotyczy to odpowiedzi polskich, angielskich i ukraińskich; kropka mieści się w limicie znaków.</div>
<p class="m-p">W dopasowaniu gracza 1 <strong>1–6</strong> wybiera odpowiedź z listy, <strong>W</strong> wpisaną odpowiedź, a <strong>O</strong> brak odpowiedzi. Przy graczu 2 dochodzi <strong>R</strong> — powtórzenie. Zaznaczanie odbywa się od razu jednym kliknięciem lub skrótem. Pierwszy Enter odsłania odpowiedź, a następny punkty po zakończeniu przejścia. Brak odpowiedzi i powtórzenie automatycznie pokazują zero. <strong>N i Enter</strong> przechodzą do kolejnego pytania. Przy odsłanianiu myszą obowiązuje zaznaczenie i potwierdzenie drugim kliknięciem.</p>
<h4 class="m-h3">Kiedy finał się kończy</h4>
<p class="m-p">Osiągnięcie progu blokuje dalszą ocenę odpowiedzi. Kolumna podpowiedzi informuje o osiągniętym progu, a przycisk zmienia się na <span class="m-code">Zakończ finał</span>, zarówno przy graczu 1, jak i 2. Wynik nie pojawia się automatycznie: operator wybiera moment zakończenia. Jeżeli progu nie osiągnięto, <span class="m-code">Zakończ finał</span> pojawia się po odsłonięciu ostatnich punktów gracza 2.</p>
<p class="m-p"><span class="m-code">Zakończ finał</span> pokazuje wybrany ekran końcowy — logo, punkty albo kwotę. Następne <span class="m-code">Zakończ grę</span> odtwarza tylko „Muzykę outro programu”. Wynik pozostaje widoczny, a wskaźnik zwycięskiej drużyny nie gaśnie. Przy zakończeniu finału tablet Prowadzącego jest czyszczony; wynik oglądaj na Wyświetlaczu.</p>
<h4 class="m-h3">Zakończenie gry bez finału</h4>
<p class="m-p">Jeżeli finał jest wyłączony i osiągnięto próg rund albo wyczerpały się pytania, dalsze działania rundy zostają zablokowane. Nie odsłaniasz pozostałych odpowiedzi. <span class="m-code">Przejdź do zakończenia gry</span> rozlicza bank i pokazuje ekran końcowy. Potem <span class="m-code">Zakończ grę</span> odtwarza tylko „Muzykę outro programu”. Przy „Pokaż kwotę (po finale)” zakończenie bez finału pokazuje punkty; przy remisie pokazuje logo.</p>
<p class="m-p">Tablet Prowadzącego zostaje wyczyszczony po przejściu do zakończenia gry. Wynik oglądaj na Wyświetlaczu.</p>
<h4 class="m-h3">Ponowne rozpoczęcie gry</h4>
<p class="m-p">Uruchamiasz przyciskiem <span class="m-code"><i class="ico" data-icon="refresh"></i></span> (Zacznij od nowa). Potwierdzenie restartu wraca do przygotowania urządzeń, przerywa dźwięki i usuwa oczekujące działania poprzedniej rozgrywki.</p>
<p class="m-p">Restart nie ma skrótu klawiaturowego.</p>
`,
      community: `<p class="m-p">
        Gry Społeczności to katalog gotowych gier stworzonych przez innych użytkowników
        i zweryfikowanych przez moderatorów. Możesz je przeglądać, dodawać do swojej biblioteki
        i uruchamiać bezpośrednio jako rozgrywkę — bez konieczności tworzenia własnych pytań.
        Do Gier Społeczności przechodzisz z górnego paska strony „Moje gry”
        za pomocą przycisku <span class="m-code">Gry Społeczności <i class="ico" data-icon="gamepad"></i></span>.
      </p>

      <h3 class="m-h2">Przeglądanie i biblioteka</h3>

      <p class="m-p">
        Na stronie "Gry Społeczności" widzisz wszystkie opublikowane gry.
        Możesz je przeszukiwać po tytule.
        Każda karta gry pokazuje tytuł, autora, język i liczbę dodań przez innych użytkowników.
      </p>

      <p class="m-p">
        Kliknij kartę gry, aby zobaczyć szczegóły: pełną listę pytań i odpowiedzi.
        Jeśli gra Ci odpowiada, kliknij <span class="m-code">Dodaj do biblioteki</span>.
        Gra trafi do zakładki <span class="m-strong">Gry Społeczności</span>
        w widoku Moje gry.
      </p>

      <h3 class="m-h2">Uruchamianie gry ze Społeczności</h3>

      <p class="m-p">
        Na stronie <b>Moje gry</b> przejdź do zakładki <span class="m-strong">Gry Społeczności</span>,
        zaznacz wybraną grę i kliknij <span class="m-code">Graj</span>. Po chwili otworzy się panel sterowania i możesz prowadzić rozgrywkę.</p>

      <div class="m-warn">
        Granie nie modyfikuje oryginału ani cudzych danych.
      </div><h3 class="m-h2">Wysyłanie własnej gry</h3>

      <p class="m-p">
        Jeśli masz grę, którą chcesz podzielić się ze społecznością, kliknij
        <span class="m-code">Moje wysłane</span> na stronie Gier Społeczności.
        Tutaj widzisz wszystkie gry wysłane przez Ciebie. Naciśnij
        <span class="m-strong">Wyślij nową grę do gier społeczności</span>,
        wybierz grę, podaj tytuł, napisz opis i wybierz język.
      </p>

      <p class="m-p">Wymagania, które musi spełniać gra przed wysłaniem:</p><ul class="m-ul">
        <li>Typ <span class="m-strong">Preparowana</span> — musi mieć co najmniej <span class="m-strong">10 pytań</span></li>
        <li>Każde pytanie musi mieć od 3 do 6 odpowiedzi</li>
        <li>Suma punktów w jednym pytaniu nie może przekraczać 100</li>
        <li>Żadna odpowiedź nie może mieć więcej niż 100 pkt ani wartości ujemnej</li>
        <li>Zamknięta ankieta (status <span class="m-strong">Gotowa</span>) również może zostać wysłana</li>
      </ul>

      <div class="m-warn">
        <b>Uwaga:</b><br>
        Wysłana gra to niezmienny zapis jej stanu z chwili wysłania.
        Późniejsze zmiany w oryginalnej grze nie wpłyną na wersję w katalogu.
      </div>

      <h3 class="m-h2">Moderacja</h3>

      <p class="m-p">
        Każda wysłana gra trafia do moderacji i jest widoczna dla Ciebie
        w zakładce <span class="m-strong">Moje wysłane gry</span> ze statusem
        <span class="m-strong">Oczekuje na weryfikację</span>.
        Po zatwierdzeniu przez moderatora gra staje się widoczna dla wszystkich.
        W przypadku odrzucenia zobaczysz powód.
      </p>

      <h3 class="m-h2">Wycofanie gry</h3>

      <p class="m-p">
        Możesz wycofać opublikowaną grę — zniknie z katalogu dla nowych użytkowników.
        Osoby, które już ją dodały do swojej biblioteki, nadal mają do niej dostęp.
        Wycofanie jest nieodwracalne — nie ma opcji ponownego opublikowania tej samej wersji.
      </p>

      <h3 class="m-h2">Gry Producenta</h3>

      <p class="m-p">
        Część gier w katalogu jest oznaczona jako <span class="m-strong">od Producenta</span>.
        Są to gry przygotowane przez zespół Familiada i trafiają do katalogu
        bezpośrednio — bez przechodzenia przez moderację.
        Wyróżniają się dedykowaną odznaką.
      </p>`,
      gameSettings: `<p class="m-p">Strona Ustawień rozgrywki pozwala skonfigurować grę na spokojnie — zanim wejdziesz do Panelu sterowania i zaczniesz rozgrywkę na żywo. Wszystko, co tu ustawisz, jest zapisane do gry i zostanie automatycznie wczytane przez Panel sterowania.</p>
<p class="m-p">Otworzysz ją ze strony <strong>Moje gry</strong> przyciskiem <strong>Ustawienia rozgrywki</strong> przy wybranej grze.</p>
<h3 class="m-h2">Drużyny</h3>
<p class="m-p">Wpisz nazwy drużyn i sprawdź je na podglądzie oraz w Podsumowaniu. Na Wyświetlaczu gry pojawią się dopiero na ekranie z przyciskiem <span class="m-code">Rozpocznij grę</span>, po przygotowaniu urządzeń i ustawień.</p>
<p class="m-p">Jeśli nie wpiszesz nic — zostaną wyświetlone domyślne wartości <strong>Drużyna A</strong> i <strong>Drużyna B</strong>.</p>
<h3 class="m-h2">Wygląd</h3>
<h4 class="m-h3">Kolory</h4>
<p class="m-p">Ustalasz tu kolory czterech elementów:</p>
<ul class="m-ul">
<li><p class="m-p"><strong>Kolor drużyny A</strong> i <strong>kolor drużyny B</strong> — kolory elementów tablicy zależnych od drużyn.</p>
</li>
<li><p class="m-p"><strong>Kolor tła tablicy</strong> — główne tło wyświetlacza.</p>
</li>
<li><p class="m-p"><strong>Kolor kropek</strong> — kolor kropek wyświetlaczy punktowych na tablicy.</p>
</li>
</ul>
<p class="m-p">Kolory zmieniają się na podglądzie natychmiast po wybraniu. Kliknij pole koloru, żeby otworzyć okno wyboru.</p>
<h4 class="m-h3">Motyw</h4>
<p class="m-p">Wybierz motyw wizualny tablicy. Motyw wpływa na styl graficzny całego wyświetlacza. Domyślny motyw to <strong>Klasyczny</strong>.</p>
<h4 class="m-h3">Logo</h4>
<p class="m-p">Jeśli masz własne logo, wybierz je w sekcji „Logo”. Wybór „Domyślne” oznacza logo Familiady, a „Bez logo” rezygnację z własnego znaku. Wybrane logo pojawia się na początku gry; na końcu zależy od ustawionego trybu ekranu końcowego. Podgląd w Ustawieniach rozgrywki pokazuje edytowane wartości przed zapisem. Podsumowanie w Panelu sterowania korzysta z zapisanych ustawień.</p>
<p class="m-p">Przycisk <span class="m-code">Przywróć domyślne</span> w sekcji Wygląd resetuje kolory, motyw i logo do wartości domyślnych.</p>
<h3 class="m-h2">Dźwięk</h3>
<p class="m-p">W tej sekcji konfigurujesz dźwięki używane podczas rozgrywki. Każda kategoria dźwiękowa (np. <strong>Poprawna odpowiedź</strong>, <strong>Błędna odpowiedź</strong>, <strong>Intro</strong>, <strong>Przejście rundy</strong>, <strong>Muzyka outro programu</strong>, <strong>Odsłanianie</strong>) ma własne ustawienia.</p>
<h4 class="m-h3">Wariant dźwięku</h4>
<p class="m-p">Przy każdej kategorii możesz wybrać <strong>wariant</strong> z listy:</p>
<ul class="m-ul">
<li><p class="m-p">Dostępne są gotowe warianty (np. <strong>Klasyczny</strong>)</p>
</li>
<li><p class="m-p">Opcja <strong>Własny</strong> pozwala załadować własny plik audio (MP3, WAV, OGG) — po wybraniu jej pojawia się przycisk <span class="m-code">Wybierz plik</span></p>
</li>
</ul>
<h4 class="m-h3">Własny plik audio</h4>
<p class="m-p">Po kliknięciu <span class="m-code">Wybierz plik</span> wskazujesz plik z dysku. W tabeli przy danej kategorii pojawia się etykieta z nazwą pliku.</p>
<p class="m-p">Aby usunąć własny plik, użyj przycisku <span class="m-code"><i class="ico" data-icon="trash"></i></span> przy pliku. Jeśli chcesz wrócić do gotowego wariantu — zmień wariant na inny niż <strong>Własny</strong>.</p>
<p class="m-p">Własny plik audio jest zapisywany w chmurze razem z grą i będzie dostępny na każdym urządzeniu, na którym uruchomisz tę grę.</p>
<p class="m-p"><strong>Limity własnych plików:</strong></p>
<table>
<thead>
<tr>
<th>Kategorie</th>
<th>Maksymalna długość</th>
</tr>
</thead>
<tbody><tr>
<td>Naciśnięcie Przycisku, poprawna i błędna odpowiedź, powtórzenie, limit czasu, odsłanianie</td>
<td>5 sekund</td>
</tr>
<tr>
<td>Muzyka intro programu, przejście rundy, muzyka finału</td>
<td>30 sekund</td>
</tr>
<tr>
<td>Muzyka outro programu</td>
<td>2 minuty</td>
</tr>
</tbody></table>
<p class="m-p">Outro odtwarza przycisk <span class="m-code">Zakończ grę</span>, gdy ekran końcowy jest już widoczny. Własne pliki i głośność ustawiasz tak samo dla każdej kategorii.</p>
<h4 class="m-h3">Głośność</h4>
<p class="m-p">Przy każdej kategorii jest suwak głośności (0–100%). Zmiany są zapisywane i wczytywane automatycznie przy każdej rozgrywce.</p>
<h4 class="m-h3">Przycisk odtwarzania</h4>
<p class="m-p">Obok każdej kategorii jest przycisk <span class="m-code"><i class="ico" data-icon="play"></i></span>. Kliknij go, żeby usłyszeć wybrany dźwięk z ustawioną głośnością. Podczas odtwarzania zmienia się na <span class="m-code"><i class="ico" data-icon="stop"></i></span>, którym zatrzymasz dźwięk.</p>
<p class="m-p">Przycisk <span class="m-code">Przywróć domyślne</span> w sekcji Dźwięk resetuje wszystkie warianty do <strong>Klasycznego</strong>, głośności do <strong>100%</strong> oraz usuwa wszystkie własne pliki audio (z chmury i lokalnie). <strong>Operacja jest nieodwracalna — pliki trzeba wgrać ponownie.</strong></p>
<h3 class="m-h2">Pytania</h3>
<h4 class="m-h3">Finał</h4>
<p class="m-p">Przełącznik <strong>Czy gra zawiera finał?</strong> decyduje, czy gra zakończy się etapem finałowym. Gdy finał jest <strong>wyłączony</strong>, rozgrywka kończy się po rundach zasadniczych. Gdy jest <strong>włączony</strong> — dostępne stają się dodatkowe opcje wyboru pytań finałowych.</p>
<h4 class="m-h3">Tryb pytań do rund</h4>
<ul class="m-ul">
<li><p class="m-p"><strong>Losuj</strong> — pytania do rund zostaną wylosowane automatycznie przy starcie rozgrywki. Nie musisz nic wybierać — system sam dobierze pytania z puli.</p>
</li>
<li><p class="m-p"><strong>Kolejność</strong> — możesz ręcznie ustalić kolejność pytań spośród dostępnych.</p>
</li>
</ul>
<h4 class="m-h3">Tryb pytań do finału</h4>
<ul class="m-ul">
<li><p class="m-p"><strong>Losuj</strong> — 5 pytań finałowych zostanie wylosowanych automatycznie (z pominięciem pytań użytych w rundach). Losowanie odbywa się przy wejściu do kroku Podsumowanie w Panelu sterowania.</p>
</li>
<li><p class="m-p"><strong>Ręcznie</strong> — wybierz dokładnie 5 pytań w zakładce „Pytania — Finał” Ustawień rozgrywki. Przed startem sprawdź wybór w Podsumowaniu Panelu sterowania.</p>
</li>
</ul>
<h4 class="m-h3">Dodatkowe ustawienia</h4>
<p class="m-p">Tu dopasowujesz parametry rozgrywki do swojego formatu. Opcje nie zmieniają zasad gry, tylko jej progi i tempo.</p>
<ul class="m-ul">
<li><p class="m-p"><strong>Mnożniki rund</strong> — wpisywane po przecinku (np. <span class="m-code">1,1,1,2,3</span>). Bank każdej rundy jest mnożony przez odpowiadający mnożnik. To odpowiada klasycznemu podwajaniu/potrajaniu w kolejnych etapach. Jeśli rozgrywka trwa dalej, do kolejnych rund stosowany jest ostatni mnożnik.</p>
</li>
<li><p class="m-p"><strong>Próg punktów do finału</strong> — liczba punktów, po której osiągnięciu jedna z drużyn może zakwalifikować się do finału (klasycznie: 300). Jeśli żadna drużyna nie osiągnie progu przed wyczerpaniem pytań — rundy kończą się naturalnie.</p>
</li>
<li><p class="m-p"><strong>Cel finału (pkt)</strong> — liczba punktów do zdobycia w finale, żeby wygrać nagrodę główną (klasycznie: 200).</p>
</li>
<li><p class="m-p"><strong>Zakończenie gry</strong> — co wyświetlacz pokazuje po zakończeniu rozgrywki:</p>
</li>
<li><p class="m-p"><strong>Logo</strong> — ekran z logo</p>
</li>
<li><p class="m-p"><strong>Punkty</strong> — wynik końcowy drużyny zwycięskiej</p>
</li>
<li><p class="m-p"><strong>Kwota wygranej</strong> — obliczona kwota nagrody (dla rozgrywek z nagrodami pieniężnymi)</p>
</li>
<li><p class="m-p"><strong>Mnożnik nagrody (po finale)</strong> — jeśli w finale drużyna nie osiągnęła celu, nagroda to punkty zdobyte w całej rozgrywce pomnożone przez ten współczynnik (klasycznie: ×3).</p>
</li>
<li><p class="m-p"><strong>Kwota główna nagrody</strong> — kwota dodawana do nagrody, gdy drużyna osiągnie cel finału (klasycznie: 25 000).</p>
</li>
</ul>
<p class="m-p">Dodatkowe ustawienia mają rozsądne wartości domyślne odpowiadające klasycznej Familiadzie. Dla większości rozgrywek nie musisz ich zmieniać.
<strong>Uwaga:</strong> Mnożniki rund i nagrody są obecnie dodatnimi liczbami całkowitymi. Wartość <span class="m-code">0,5</span> nie jest obsługiwana.</p>
<h4 class="m-h3">Zapis ustawień</h4>
<p class="m-p">Zmiany są zapisywane po kliknięciu <span class="m-code">Zapisz wszystko</span>. Nie ma automatycznego zapisu przy samej zmianie — pamiętaj o kliknięciu przycisku przed wyjściem.</p>
<h4 class="m-h3">Przywróć domyślne</h4>
<p class="m-p">Przycisk <span class="m-code">Przywróć domyślne</span> na górze strony resetuje całość ustawień do wartości domyślnych.</p>
<p class="m-p">Ta czynność jest nieodwracalna — jeśli wciśniesz przypadkiem i zatwierdzisz, trzeba będzie zmieniać wszystko od nowa (w tym wgrywanie plików dźwiękowych).</p>
<p class="m-p">Próg punktów do finału dotyczy wyniku z rund, a cel finału punktów obu graczy finału. To dwa osobne ustawienia. Gdy włączono wyświetlanie kwoty, osiągnięcie celu finału uwzględnia kwotę głównej nagrody; bez osiągnięcia celu wyświetlana jest niższa nagroda obliczona z punktów i mnożnika. Gra bez finału pokazuje w tym trybie punkty.</p>
`,
    },
  },
  privacy: {
    title: "Familiada Online — polityka prywatności",
    description: "Polityka prywatności serwisu Familiada Online: zasady przetwarzania danych osobowych, pliki cookies i kontakt z administratorem.",
    pageTitle: "Familiada Online — Polityka Prywatności",
    backToManual: "Wskazówki",
    backToHome: "Strona główna",
    logout: "Wyloguj",
    content: `
      <p class="m-p"><strong>Familiada Online</strong></p>
      <p class="m-p">Data ostatniej aktualizacji: 15 lipca 2026 r.</p>

      <h2 class="m-h2">1. Informacje ogólne</h2>
      <p class="m-p">
        Niniejsza Polityka Prywatności określa zasady przetwarzania danych osobowych użytkowników
        serwisu Familiada Online, dostępnego pod adresem:
      </p>
      <p class="m-p"><span class="m-code">https://www.familiada.online</span></p>
      <p class="m-p">
        Serwis ma charakter projektu hobbystycznego i nie stanowi zarejestrowanej działalności gospodarczej.
      </p>

      <h2 class="m-h2">2. Administrator danych</h2>
      <p class="m-p">Administratorem danych jest twórca serwisu Familiada Online.</p>
      <p class="m-p">Kontakt: <span class="m-code">kontakt@familiada.online</span></p>

      <h2 class="m-h2">3. Zakres przetwarzanych danych</h2>
      <p class="m-p">Dane podawane przez użytkownika:</p>
      <ul class="m-ul">
        <li>adres e-mail</li>
        <li>nazwa użytkownika</li>
        <li>treści tworzone w aplikacji (gry, ankiety)</li>
      </ul>
      <p class="m-p">Dane techniczne:</p>
      <ul class="m-ul">
        <li>adres IP</li>
        <li>dane przeglądarki i urządzenia</li>
        <li>informacje o sesji</li>
      </ul>

      <h2 class="m-h2">4. Cele przetwarzania</h2>
      <p class="m-p">Dane przetwarzane są w celu:</p>
      <ul class="m-ul">
        <li>obsługi konta użytkownika</li>
        <li>realizacji funkcji aplikacji</li>
        <li>wysyłki wiadomości systemowych</li>
        <li>zapewnienia bezpieczeństwa</li>
      </ul>
      <p class="m-p">Dane nie są sprzedawane ani wykorzystywane do marketingu zewnętrznego.</p>

      <h2 class="m-h2">5. Podmioty przetwarzające</h2>
      <p class="m-p">Serwis korzysta z infrastruktury:</p>
      <ul class="m-ul">
        <li>GitHub Pages (hosting interfejsu)</li>
        <li>Cloudflare (DNS i zabezpieczenia)</li>
        <li>Supabase (serwer aplikacji i baza danych) – serwer własny w Oracle Cloud</li>
        <li>Zeptomail (główny dostawca e-mail)</li>
        <li>Brevo (zapasowy dostawca poczty)</li>
        <li>Mailgun (zapasowy dostawca poczty)</li>
        <li>SendPulse (zapasowy dostawca poczty)</li>
        <li>Groq (analiza powtarzalności gier społeczności – AI)</li>
        <li>DeepSeek (analiza powtarzalności gier społeczności – AI)</li>
      </ul>
      <p class="m-p">Podmioty te przetwarzają dane wyłącznie w zakresie technicznym.</p>

      <h2 class="m-h2">6. Okres przechowywania</h2>
      <p class="m-p">Dane przechowywane są przez okres posiadania konta lub do momentu jego usunięcia.</p>

      <h2 class="m-h2">7. Prawa użytkownika</h2>
      <p class="m-p">Użytkownik ma prawo do:</p>
      <ul class="m-ul">
        <li>dostępu do danych</li>
        <li>poprawienia danych</li>
        <li>usunięcia danych</li>
        <li>ograniczenia przetwarzania</li>
      </ul>
      <p class="m-p">Kontakt w celu realizacji praw: <span class="m-code">kontakt@familiada.online</span></p>

      <h2 class="m-h2">8. Bezpieczeństwo</h2>
      <p class="m-p">Serwis korzysta z połączenia HTTPS oraz zabezpieczeń infrastruktury chmurowej.</p>

      <h2 class="m-h2">9. Pliki cookies</h2>
      <p class="m-p">Serwis wykorzystuje wyłącznie techniczne pliki cookies niezbędne do działania aplikacji.</p>
    `,
    contact: {
      openBtn: "Napisz do nas",
      title: "Kontakt",
      desc: "Masz pytanie lub uwagę? Napisz do nas.",
      email: "Twój e-mail",
      subject: "Temat",
      message: "Wiadomość",
      lang: "Język",
      submit: "Wyślij zgłoszenie",
      successTitle: "Zgłoszenie przyjęte!",
      successDesc: "Numer Twojego zgłoszenia:",
      errorGeneric: "Coś poszło nie tak. Spróbuj ponownie.",
      rateLimited: "Możesz wysłać jedno zgłoszenie na 24 godziny.",
      validEmail: "Podaj poprawny adres e-mail.",
      validSubject: "Podaj temat.",
      validMessage: "Wiadomość musi mieć od 5 do 5000 znaków.",
    },
  },
  questionForm: {
    addAnswer: "+ Dodaj odpowiedź",
    answerLimit: "Limit odpowiedzi osiągnięty",
    deleteAnswer: "Usuń odpowiedź",
    sumLabel: "SUMA",
    confirmDiscard: "Porzucić niezapisane zmiany w pytaniu?",
    keepEditing: "Edytuj",
    discard: "Porzuć",
    saveFailed: "Nie udało się zapisać pytania. Spróbuj ponownie.",
    errors: {
      textEmpty: "Treść pytania nie może być pusta.",
      answerEmpty: "Odpowiedź {ord} nie może być pusta.",
      answersMin: "Pytanie musi mieć co najmniej {min} odpowiedzi (jest {count}).",
      answersMax: "Max {max} odpowiedzi.",
      sumOver: "Suma punktów nie może przekroczyć {max} (jest {sum}).",
    },
  },
  gameValidate: {
    lockedTitle: "Edycja zablokowana",
    noGame: "Brak gry.",
    pollOpenNoEdit: "Ankieta jest otwarta — edycja zablokowana.",
    preparedNoPoll: "Gra preparowana nie ma ankiety.",
    pollAlreadyOpen: "Ankieta jest już otwarta.",
    minQuestions: "Gra musi mieć co najmniej {min} pytań (masz: {n}).",
    answersRange: "Pytanie #{ord}: musi mieć {min}–{max} odpowiedzi (masz: {n}).",
    playAfterPoll: "Gra będzie dostępna dopiero po zamknięciu ankiety.",
    negativePoints: "Pytanie #{ord}: punkty nie mogą być ujemne.",
    answerOver100: "Pytanie #{ord}: odpowiedź nie może mieć więcej niż 100 pkt.",
    sumTooBig: "Pytanie #{ord}: suma punktów nie może przekroczyć {max} (jest: {sum}).",
    closeOnlyOpen: "Ankietę można zamknąć tylko wtedy, gdy jest otwarta.",
    closeWaitForTasks: "Nie można jeszcze zamknąć — ktoś z zaproszonych jeszcze nie zagłosował.",
    noSession: "Pytanie #{ord}: brak sesji ankiety — uruchom ankietę ponownie.",
    closeMinPoints: "Pytanie #{ord}: aby zamknąć, co najmniej 3 odpowiedzi muszą mieć ≥ 3 punkty po przeliczeniu głosów.",
    closeMinText: "Pytanie #{ord}: aby zamknąć, potrzeba co najmniej 3 różnych odpowiedzi.",
    unknownType: "Nieznany typ gry.",
    marketNoEdit: "Gry ze Społeczności nie można edytować.",
    pollOpenNoExport: "Nie można eksportować gry z otwartą ankietą.",
  },
  gamesImportExport: {
    defaults: {
      gameName: "Gra",
      question: "Pytanie {ord}",
      answer: "ODP {ord}",
    },
    export: {
      step: "Eksport: pobieranie pytań…",
    },
    import: {
      step: "Import: tworzenie gry…",
      invalidFormat: "Zły format pliku (brak game / questions).",
    },
  },
  games: {
    title: "Familiada — moje gry",
    nav: {
      pollsHubPolls: "Ankiety",
      pollsHubSubs: "Subskrypcje",
      bases: "Bazy pytań",
      logo: "Logo",
      marketplace: "Gry Społeczności",
      connectDevice: "Podłącz urządzenie",
      account: "Ustawienia konta",
      more: "Więcej",
    },
    header: {
      title: "Twoje gry",
      hint: "Naciśnij kafelek, żeby go zaznaczyć. Podwójne naciśnięcie zmienia nazwę.",
    },
    actions: {
      edit: "Edytuj",
      editMobile: "Edyt.",
      preview: "Podgląd",
      previewMobile: "Podgl.",
      play: "Graj",
      playMobile: "Graj",
      poll: "Ankieta",
      pollMobile: "Sond.",
      exportFile: "Eksportuj do pliku",
      exportFileMobile: "Exp.plk",
      exportBase: "Eksportuj do bazy",
      exportBaseMobile: "Exp.bz",
      import: "Importuj",
      importMobile: "Imp",
      settings: "Ustawienia rozgrywki",
    },
    preview: {
      noQuestions: "Brak pytań.",
      loading: "Ładowanie…",
      pts: "pkt",
    },
    tabs: {
      pollText: "Ankieta tekstowa",
      pollTextMobile: "Ankieta",
      pollPoints: "Punktacja",
      pollPointsMobile: "Punkty",
      prepared: "Preparowana",
      preparedMobile: "Gotowa",
      market: "Gry Społeczności",
      marketMobile: "Społ.",
    },
    iosWebapp: {
      title: "Dodaj Familiadę do ekranu głównego",
      text:
        "Dla najlepszego komfortu użytkowania zalecamy korzystać z aplikacji webowej. Żeby to zrobić:\n" +
        "1. Otwórz menu Udostępnij.\n" +
        "2. Wybierz „Do ekranu początkowego”.\n" +
        "3. Zatwierdź dodanie.\n" +
        "4. Uruchom Familiadę z nowej ikony na ekranie głównym.",
      ok: "OK",
      never: "Nie pokazuj więcej",
    },
    pwaInstall: {
      title: "Zainstaluj aplikację",
      text: "Dodaj Familiadę do ekranu głównego, żeby mieć szybki dostęp.",
      ok: "Zainstaluj",
      cancel: "Nie pokazuj",
      cancelBtn: "Anuluj",
      manual: "Przeglądarka nie pozwala obecnie na automatyczną instalację.\n\nMożesz zainstalować ręcznie:\n• Chrome/Edge: kliknij ikonę instalacji w pasku adresu i wybierz \"Zainstaluj\"\n• Lub: Menu → Zainstaluj Familiadę",
    },
    import: {
      title: "Importuj",
      confirm: "Importuj",
      pickFile: "Wybierz plik JSON.",
      loaded: "Plik wczytany.",
      loadFailed: "Nie udało się wczytać pliku.",
      pasteJson: "Wklej JSON lub wybierz plik.",
      invalidJson: "Niepoprawny JSON.",
      preview: {
        name: "Nazwa:",
        type: "Typ:",
        questions: "Pytania:",
      },
      dbFailed: "Błąd bazy podczas importu.",
      progress: {
        start: "Importuję…",
        save: "Zapisuję…",
        done: "Import zakończony.",
        errorLabel: "Import nie powiódł się.",
        failed: "Import nieudany.",
      },
    },
    exportBase: {
      title: "Eksport do bazy",
      subtitle: "Wybierz bazę pytań. Zostanie utworzony folder w głównym katalogu o nazwie jak gra.",
      confirm: "Eksportuj",
      empty: "Brak baz do wyboru.",
      metaOwned: "własna",
      metaShared: "współdzielona",
      baseFallback: "Bez nazwy",
      loadFailed: "Nie udało się wczytać baz.",
      pickBase: "Wybierz bazę.",
      progress: {
        start: "Eksportuję…",
        step: "Przygotowuję…",
        folder: "Tworzę folder…",
        questions: "Eksportuję pytania…",
        saved: "Eksport zapisany.",
        savedCount: "Zapisano {done}/{total}.",
        done: "Eksport do bazy zakończony.",
        errorLabel: "Eksport do bazy nie powiódł się.",
        failed: "Eksport nieudany.",
      },
    },
    exportFile: {
      title: "EKSPORT…",
      subtitle: "Nie zamykaj strony. Trwa przygotowanie pliku.",
      progress: {
        start: "Eksportuję…",
        fetch: "Pobieram dane…",
        download: "Przygotowuję pobieranie…",
        done: "Plik gry został zapisany.",
        errorLabel: "Nie udało się zapisać pliku gry.",
        failed: "Eksport nieudany.",
      },
    },
    nameModal: {
      title: "Zmień nazwę",
      sub: "Podaj nową nazwę gry.",
      titleCreate: "Nowa gra",
      subCreate: "Podaj nazwę gry.",
      placeholder: "Nazwa...",
      failed: "Nie udało się zmienić nazwy.",
      empty: "Podaj nazwę.",
    },
    common: {
      save: "Zapisz",
      cancel: "Anuluj",
    },
    card: {
      delete: "Usuń",
      newGame: "Nowa gra",
    },
    types: {
      pollText: "ANKIETA",
      pollPoints: "PUNKTACJA",
      prepared: "PREPAROWANA",
      market: "GRY SPOŁECZNOŚCI",
    },
    status: {
      draft: "SZKIC",
      open: "OTWARTY",
      closed: "ZAMKNIĘTY",
    },
    newGame: {
      pollText: "Nowa ankieta",
      pollPoints: "Nowa punktacja",
      prepared: "Nowa preparowana",
    },
    delete: {
      title: "Usuń grę",
      text: "Czy na pewno chcesz usunąć „{name}”?",
      ok: "Usuń",
      cancel: "Anuluj",
    },
    alert: {
      deleteFailed: "Nie udało się usunąć gry.",
      deleteInUsePollOpen: "Nie można usunąć gry — jej ankieta jest właśnie otwarta i ktoś może aktualnie głosować.",
      deleteInUseLocked: "Nie można usunąć gry — jest właśnie otwarta w innej karcie (edytor, ustawienia lub ankieta).",
      createFailed: "Nie udało się utworzyć gry.",
      resetPollFailed: "Nie udało się zresetować statusu ankiety.",
      checkFailed: "Nie udało się sprawdzić statusu gry.",
      openPollFailed: "Nie udało się otworzyć ankiety.",
      loadFailed: "Nie udało się wczytać listy gier. Sprawdź połączenie i odśwież stronę.",
    },
    hint: {
      select: "Zaznacz grę, aby włączyć akcje. Podwójne naciśnięcie zmienia nazwę.",
      selectPlus: "Zaznacz grę, aby włączyć akcje i eksport. Podwójne naciśnięcie zmienia nazwę.",
    },
    editAfterPoll: {
      title: "Zresetować ankietę?",
      text: "Ta ankieta jest już otwarta lub zamknięta. Zresetować, aby edytować?",
      ok: "Resetuj",
      cancel: "Anuluj",
    },
    market: {
      empty: "Twoja biblioteka jest pusta.",
      emptyHint: "Dodaj gry ze Społeczności.",
      hint: "Zaznacz grę, aby włączyć akcje.",
      typeLabel: "Ze Społeczności",
      removeFromLibrary: "Usuń z biblioteki",
      removeTitle: "Usunąć z biblioteki?",
      removeText: "Gra „{name}” zniknie z Twojej biblioteki razem z jej ustawieniami. Możesz ją później dodać ponownie ze Społeczności.",
      removeOk: "Usuń",
      removeFailed: "Nie udało się usunąć gry z biblioteki.",
    },
    gameFallback: "Bez nazwy",
  },
  editor: {
    title: "Familiada — edytor gry",
    backToGames: "Moje gry",
    backToQuestions: "Wstecz",
    logout: "Wyloguj",
    pageTitle: "Edytor",
    gameNamePlaceholder: "Nazwa gry",
    questionsTitle: "Pytania",
    importHint: "Import działa z pliku TXT albo z wklejonej treści.",
    importBtn: "Importuj",
    empty: "Wybierz pytanie po lewej lub dodaj nowe.",
    lockedPoll: "ANKIETA OTWARTA — EDYCJA ZABLOKOWANA",
    questionLabel: "Treść pytania",
    answerLabel: "Odpowiedź",
    pointsLabel: "Pkt",
    importModal: {
      title: "Import pytań",
      subtitle:
        "Możesz <b>wkleić treść</b> albo <b>wczytać plik TXT</b>. Opcjonalnie na początku dodaj linię <b>@Nazwa gry</b>. Pytania zaczynają się od <b>#</b>. Odpowiedzi mogą mieć numer. Punkty po <b>/</b> są opcjonalne (w ankietach mogą być ignorowane).",
      loadFile: "Wczytaj plik",
      placeholder:
        "@Moja gra\n#Zwierzeta w Afryce\n1 Słoń /29\n2 Lew /19\n3 Małpa /16\n\n#Drugie pytanie\n1 Odpowiedź 1\n2 Odpowiedź 2\n3 Odpowiedź 3",
      formatHint:
        "Działa też format bez numerów (po prostu linie z odpowiedziami). Import toleruje spacje/taby, „1.”, „2)” itp. Jeśli odpowiedź ma więcej niż 17 znaków, zostanie ucięta.",
      confirm: "Importuj",
      cancel: "Zamknij",
    },
    defaultGameName: "Nowa gra",
    defaults: {
      question: "Pytanie {ord}",
      answer: "ODP {ord}",
    },
    actions: {
      delete: "Usuń",
      addQuestion: "Dodaj pytanie",
      addAnswer: "+ Dodaj odpowiedź",
    },
    labels: {
      questionNumber: "Pytanie {ord}",
      questionsOnly: "Tylko pytania",
      answersSum: "{count}/{max} odpowiedzi • suma {sum}/{sumMax}",
      answersCount: "{count}/{max} odpowiedzi",
    },
    type: {
      pollText: "ANKIETA TEKSTOWA",
      pollPoints: "PUNKTACJA",
      prepared: "PREPAROWANA",
    },
    config: {
      pollText: {
        title: "Ankieta tekstowa",
        hintTop: "Minimum {min} pytań.",
        hintBottom: "Odpowiedzi i punkty nie są wymagane.",
      },
      pollPoints: {
        title: "Punktacja",
        hintTop: "Minimum {min} pytań, każde {answersMin}–{answersMax} odpowiedzi.",
        hintBottom: "Punkty są ignorowane.",
      },
      prepared: {
        title: "Preparowana",
        hintTop: "Minimum {min} pytań, każde {answersMin}–{answersMax} odpowiedzi.",
        hintBottom: "Suma punktów ≤ {sum}.",
      },
    },
    status: {
      nameSaved: "Zapisano nazwę.",
      nameSaveError: "Nie udało się zapisać nazwy.",
      addQuestionError: "Błąd dodawania pytania (konsola).",
      questionAdded: "Dodano pytanie.",
      questionDeleted: "Usunięto pytanie.",
      questionDeleteError: "Błąd usuwania pytania (konsola).",
      answerAdded: "Dodano odpowiedź.",
      answerRemoved: "Usunięto odpowiedź.",
      answerAddError: "Błąd dodawania odpowiedzi (konsola).",
      answerDeleteError: "Błąd usuwania odpowiedzi (konsola).",
      answerLimitReached: "Limit odpowiedzi osiągnięty.",
      saveError: "Błąd zapisu (konsola).",
      pointsSaveError: "Błąd zapisu punktów (konsola).",
      saved: "Zapisano.",
      typing: "Piszesz…",
      rowGone: "Ten element został zmieniony lub usunięty w innym miejscu. Odśwież stronę.",
      loadError: "Nie udało się wczytać odpowiedzi. Spróbuj ponownie.",
      answerLimit: "Limit odpowiedzi: {limit}.",
      minQuestions: "Wymagane minimum: {min} (masz {count})",
      minQuestionsOk: "Minimum spełnione",
    },
    confirm: {
      resetPoll: "Zresetować status ankiety do edycji?",
      deleteQuestion: "Usunąć to pytanie i wszystkie jego odpowiedzi?",
      deleteAnswer: "Usunąć tę odpowiedź?",
    },
    sumLabel: "SUMA",
    import: {
      fileFailed: "Nie udało się wczytać pliku.",
      pastePrompt: "Wklej treść albo wczytaj plik.",
      chooseFile: "Najpierw wybierz plik TXT.",
      running: "Importuję…",
      errors: {
        answerBeforeQuestion: "Błąd układu: odpowiedź przed pierwszym pytaniem (linia {line}).",
        noQuestions: "Brak pytań. Pamiętaj o liniach zaczynających się od #.",
      },
      confirm:
        "Import TXT ZASTĄPI zawartość gry:\n\n- usunie wszystkie dotychczasowe pytania i odpowiedzi\n- wgra dane z tekstu\n\nKontynuować?",
      cancelled: "Anulowano.",
      done: "Import zakończony.",
      error: "Błąd: {error}",
    },
    alert: {
      missingId: "Brak identyfikatora edytora.",
      cannotEdit: "Nie można edytować w trakcie otwartej ankiety.",
      editorError: "Błąd edytora (konsola).",
      gameNotFound: "Ta gra nie istnieje albo nie masz do niej dostępu.",
      resetFailed: "Nie udało się przygotować ankiety do edycji. Spróbuj ponownie.",
    },
  },
  pollText: {
    title: "Familiada — ankieta tekstowa",
    pollTitle: "Ankieta",
    loading: "Ładuję…",
    placeholder: "Wpisz odpowiedź...",
    send: "Wyślij",
    sendMobile: "OK",
    maxChars: "Maksymalnie 17 znaków.",
    thanks: "Dziękujemy za udział!",
    loadTimeout: "Nie można pobrać pytań (timeout).",
    enterAnswer: "Wpisz odpowiedź.",
    taskInvalid: "Link jest nieważny lub nieaktywny.",
    loginToVote: "Zaloguj się, aby przejść do ankiety.",
    emailRequired: "Podaj e-mail w linku z zaproszenia.",
    openTaskFail: "Nie można otworzyć zadania.",
    pollFallback: "Ankieta",
    pollClosed: "Ankieta jest zamknięta. Dziękujemy!",
    sending: "Wysyłam…",
    error: "Błąd: {error}",
    questionProgress: "Pytanie {current}/{total}",
    beforeUnloadWarn: "Udzielone odpowiedzi nie zostaną uznane.",
    missingParams: "Brak parametru id lub key.",
    alreadyVoted: "Już wziąłeś udział w ankiecie.",
    wrongType: "To nie jest ankieta tekstowa.",
    openPollFail: "Nie można otworzyć ankiety: {error}",
  },
  pollPoints: {
    title: "Familiada — ankieta punktowa",
    pollTitle: "Ankieta",
    loading: "Ładuję…",
    thanks: "Dziękujemy za udział!",
    loadTimeout: "Nie można pobrać pytań (timeout).",
    taskInvalid: "Link jest nieważny lub nieaktywny.",
    loginToVote: "Zaloguj się, aby przejść do ankiety.",
    emailRequired: "Podaj e-mail w linku z zaproszenia.",
    openTaskFail: "Nie można otworzyć zadania.",
    pollFallback: "Ankieta",
    pollClosed: "Ankieta jest zamknięta. Dziękujemy!",
    sending: "Wysyłam…",
    error: "Błąd: {error}",
    questionProgress: "Pytanie {current}/{total}",
    beforeUnloadWarn: "Udzielone odpowiedzi nie zostaną uznane.",
    missingParams: "Brak parametru id lub key.",
    alreadyVoted: "Już wziąłeś udział w ankiecie.",
    wrongType: "To nie jest ankieta punktacji.",
    openPollFail: "Nie można otworzyć ankiety: {error}",
    answerFallback: "ODP {ord}",
  },
  pollGo: {
    title: "Familiada — zaproszenie do ankiety",
    loadingTitle: "Ładuję zaproszenie…",
    loadingText: "Proszę czekać.",
    emailPlaceholder: "Podaj e-mail",
    declined: "Odrzucono",
    taskDeclined: "Zadanie zostało odrzucone.",
    error: "Błąd",
    declineTaskFailed: "Nie udało się odrzucić zadania.",
    declineInviteFailed: "Nie udało się odrzucić zaproszenia.",
    subHeading: "Zaproszenie do subskrypcji{owner}",
    taskHeading: "Zaproszenie do ankiety w {name}{owner}",
    taskName: "„{name}”",
    pollFallback: "ankiety",
    ownerSuffix: " od użytkownika {owner}",
    mismatch: "Zaproszenie Ciebie nie dotyczy, zaloguj się jako {email} i spróbuj ponownie.",
    inviteUsed: "Zaproszenie zostało wykorzystane.",
    acceptFailed: "Nie udało się zaakceptować.",
    subscriptionActive: "Subskrypcja aktywna",
    inviteAccepted: "Zaproszenie zostało zaakceptowane.",
    inviteDeclined: "Zaproszenie zostało odrzucone.",
    inviteAcceptFailed: "Nie udało się zaakceptować zaproszenia.",
    emailMissingTitle: "Brak e-maila",
    emailMissingText: "Podaj poprawny adres e-mail.",
    subscribeFailed: "Nie udało się dodać subskrypcji.",
    subscribeAdded: "Subskrypcja została dodana.",
    subscriptionInviteActive: "Zaproszenie do subskrypcji jest aktywne.",
    subscribePrompt: "Jeśli chcesz zaakceptować subskrypcję, podaj adres e-mail.",
    acceptInHub: "Żeby zaakceptować, przejdź do Centrum ankiet.",
    hubLabel: "Centrum ankiet",
    acceptLabel: "Akceptuj",
    declineLabel: "Odrzuć",
    subscribeLabel: "Subskrybuj",
    loginToAccept: "Żeby zaakceptować musisz się zalogować.",
    loginLabel: "Zaloguj",
    loginToVote: "Żeby zagłosować musisz się zalogować.",
    taskInviteActive: "Zaproszenie do ankiety jest aktywne.",
    voteLabel: "Głosuj",
    missingLinkTitle: "Brak linku",
    missingLinkText: "Brakuje tokenu zaproszenia.",
    invalidLinkTitle: "Link nieważny",
    invalidLinkText: "Link jest nieważny lub nieaktywny.",
    inviteUnknown: "Nie udało się rozpoznać zaproszenia.",
    openInviteFailed: "Nie udało się otworzyć zaproszenia.",
    invitationRecipient: "adresata zaproszenia",
    ownerEmailBlocked: "Ten adres należy do właściciela zaproszenia ({owner}). Już subskrybujesz tego użytkownika.",
    unsubOwnerHeading: "Wypisz się od {owner}",
    unsubOwnerText: "Kliknij poniżej, aby anulować subskrypcję i przestać otrzymywać ankiety od tego użytkownika.",
    unsubOwnerBtn: "Wypisz się od {owner}",
    unsubOwnerDone: "Subskrypcja anulowana. Nie będziesz już otrzymywać ankiet od {owner}.",
    unsubOwnerFailed: "Nie udało się anulować subskrypcji.",
    unsubGlobalHeading: "Wypisz się ze wszystkich maili",
    unsubGlobalText: "Kliknij poniżej, aby zablokować wszystkie powiadomienia mailowe z Familiada.",
    unsubGlobalBtn: "Wypisz się ze wszystkich maili Familiada",
    unsubGlobalDone: "Gotowe. Nie będziesz już otrzymywać żadnych maili z Familiada.",
    unsubGlobalAlready: "Już jesteś wypisany ze wszystkich maili Familiada.",
    unsubGlobalFailed: "Nie udało się wypisać.",
    mailUnsubOwner: "Wypisz się od {owner}",
    mailUnsubGlobal: "Wypisz się ze wszystkich maili Familiada",
    mailAccountSettings: "Nie chcesz otrzymywać maili? Możesz je wyłączyć w ustawieniach konta.",
    mailAccountSettingsLink: "Ustawienia konta",
  },
  pollQr: {
    title: "Familiada — ankieta z kodem QR",
    fullscreen: "Pełny ekran",
    scan: "Zeskanuj QR, aby zagłosować",
    missingUrl: "Brak URL",
    qrFailed: "Nie udało się wygenerować QR",
    loadingGame: "Ładowanie gry…",
    missingUrlOrKey: "Brak URL lub nieprawidłowy klucz.",
    invalidKey: "Nieprawidłowy klucz ankiety",
    invalidStatus: "Ankieta nie jest dostępna do głosowania",
  },
  pollsHub: {
    title: "Familiada — centrum ankiet",
    logout: "Wyloguj",
    header: {
      title: "Centrum ankiet",
      hint: "Zarządzaj ankietami oraz zaproszeniami do ankiety.",
    },
    tabs: {
      polls: "Ankiety",
      subscriptions: "Subskrypcje",
      tasks: "Zadania",
      subscribersMobile: "Subskryb.",
      subscriptionsMobile: "Subskrypc.",
    },
    sections: {
      myPolls: "Moje ankiety",
      selectHint: "Kliknij kafelek, aby go zaznaczyć.",
      tasks: "Zadania",
      tasksHint: "Dwuklik otwiera ankietę.",
      mySubscribers: "Moi subskrybenci",
      subscribersHint: "Zaproś nowych i zarządzaj zaproszeniami.",
      mySubscriptions: "Moje subskrypcje",
      subscriptionsHint: "Akceptuj zaproszenia od innych.",
    },
    toggle: {
      current: "Aktualne",
      archive: "Archiwalne",
    },
    actions: {
      share: "Udostępnij",
      details: "Szczegóły",
      decline: "Odrzuć",
      remove: "Usuń",
      resend: "Ponów zaproszenie",
      cancel: "Anuluj",
      accept: "Akceptuj",
    },
    invite: {
      placeholder: "E-mail lub nazwa użytkownika",
      button: "Zaproś",
    },
    share: {
      title: "Udostępnij ankietę",
      subtitle: "Wybierz subskrybentów, którym chcesz wysłać zadanie.",
      save: "Zapisz udostępnienie",
      close: "Zamknij",
    },
    details: {
      title: "Szczegóły ankiety",
      titleWithName: "Szczegóły ankiety — {name}",
      subtitle: "Usuń głos powiązany z zadaniem, jeśli to konieczne.",
      voted: "Wypełnili",
      pending: "Nie wypełnili",
      declined: "Odrzucili",
      cancelled: "Anulowane",
      anon: "Anonimowe",
      close: "Zamknij",
    },
    progress: {
      title: "Przetwarzanie",
      subtitle: "Proszę czekać…",
      declineTask: "Odrzucanie zadania…",
      invite: "Zapraszanie…",
      resend: "Ponawianie zaproszenia…",
      removeSubscriber: "Usuwanie subskrybenta…",
      acceptSubscription: "Akceptowanie subskrypcji…",
      updateSubscription: "Aktualizacja subskrypcji…",
      loadSubscribers: "Pobieranie subskrybentów…",
      share: "Udostępnianie…",
      loadDetails: "Pobieranie szczegółów…",
      deleteVote: "Usuwanie głosu…",
    },
    ok: "OK",
    errorLabel: "Błąd",
    pollType: {
      text: "Ankieta tekstowa",
      points: "Punktacja",
    },
    pollState: {
      open: "Otwarta",
      closed: "Zamknięta",
      draft: "Szkic",
    },
    sort: {
      newest: "Najnowsze",
      oldest: "Najstarsze",
      nameAsc: "Nazwa A–Z",
      nameDesc: "Nazwa Z–A",
      type: "Typ",
      state: "Stan",
      tasksActive: "Najwięcej aktywnych zadań",
      tasksDone: "Najwięcej oddanych zadań",
      available: "Tylko dostępne",
      done: "Tylko wykonane",
      nameEmailAsc: "Nazwa/e-mail A–Z",
      nameEmailDesc: "Nazwa/e-mail Z–A",
      status: "Status",
    },
    status: {
      active: "Aktywny",
      pending: "Oczekujące",
      declined: "Odrzucone",
      cancelled: "Anulowane",
    },
    taskStatus: {
      done: "Wykonane",
      available: "Dostępne",
    },
    taskFrom: "Od: {owner}",
    tasksBadgeLabel: "Zadania",
    tasksBadgeTitle: "Zadania: {done} z {total} udostępnionych zagłosowało.",
    tasksBadgeNone: "Zadania: brak udostępnień.",
    anonBadgeLabel: "Anon.",
    anonBadgeTitle: "Anonimowe wyniki: {count}.",
    votesBadgeLabel: "Głosy",
    empty: {
      polls: "Brak ankiet do pokazania.",
      tasks: "Brak zadań do pokazania.",
      subscribers: "Brak subskrybentów.",
      subscriptions: "Brak subskrypcji.",
      activeSubscribers: "Brak aktywnych subskrybentów.",
      tasksShort: "Brak zadań.",
      details: "Brak zadań.",
    },
    shareStatus: {
      done: "Wykonane",
      active: "Dostępne",
      declined: "Odrzucone",
      cancelled: "Anulowane",
      missing: "Brak",
    },
    shareHint: {
      locked: "Zablokowane",
      active: "Aktywne",
      retry: "Możesz ponowić",
      cooldown: "Możesz ponowić za {hours} godz.",
      missing: "Brak",
    },
    shareLockedHint: "Wypełnione — usuń wpis, aby odblokować.",
    shareStatusLabel: "Status",
    shareStatusMissing: "Brak",
    shareHintMissing: "Brak",
    errors: {
      mailSend: "Nie udało się wysłać wiadomości e-mail.",
      mailSession: "Brak aktywnej sesji do wysyłki wiadomości e-mail.",
      declineTask: "Nie udało się odrzucić zadania.",
      invalidEmail: "Niepoprawny e-mail.",
      unknownUser: "Nie znam takiej nazwy użytkownika.",
      invite: "Nie udało się zaprosić.",
      resend: "Nie udało się ponowić zaproszenia.",
      inviteMailFailed: "Zaproszenie zapisane, ale wysyłka wiadomości e-mail nie powiodła się.",
      resendMailFailed: "Ponowienie zapisane, ale wysyłka wiadomości e-mail nie powiodła się.",
      removeSubscriber: "Nie udało się usunąć subskrybenta.",
      acceptSubscription: "Nie udało się zaakceptować zaproszenia.",
      updateSubscription: "Nie udało się zaktualizować subskrypcji.",
      loadSubscribers: "Nie udało się pobrać subskrybentów.",
      shareSave: "Nie udało się zapisać udostępnienia.",
      loadDetails: "Nie udało się pobrać szczegółów.",
      deleteVote: "Nie udało się usunąć głosu.",
      loadHub: "Nie udało się pobrać danych centrum ankiet.",
    },
    statusMsg: {
      inviteSaved: "Zaproszenie zapisane.",
      mailSending: "Wysyłam wiadomość e-mail…",
      mailSent: "Mail wysłany.",
      mailFailed: "Mail nie został wysłany.",
      shareNoChanges: "Brak zmian do zapisania.",
      shareSavedWithMail: "Zapisano udostępnienie. Maile: {sent}/{total}.",
      shareSaved: "Zapisano udostępnienie.",
      shareSavedMsg: "Zapisano udostępnienie.",
      mailBatchSending: "Wysyłam maile…",
      mailMarking: "Oznaczam wysłane maile…",
    },
    modal: {
      removeSubscriber: {
        title: "Usuń subskrybenta",
        text: "Czy na pewno chcesz usunąć tego subskrybenta?",
        ok: "Usuń",
        cancel: "Anuluj",
      },
      updateSubscription: {
        title: "Aktualizuj subskrypcję",
        textPending: "Czy na pewno chcesz odrzucić to zaproszenie?",
        textActive: "Czy na pewno chcesz anulować tę subskrypcję?",
        okPending: "Odrzuć zaproszenie",
        okActive: "Anuluj subskrypcję",
        cancel: "Zamknij",
      },
      deleteVote: {
        title: "Usuń głos",
        text: "Czy na pewno chcesz usunąć głos tej osoby?",
        ok: "Usuń",
        cancel: "Anuluj",
      },
      declineTask: {
        title: "Odrzuć zadanie",
        text: "Czy na pewno chcesz odrzucić to zadanie?",
        ok: "Odrzuć",
        cancel: "Anuluj",
      },
      tokenMismatch: {
        title: "Zaproszenie nie pasuje do konta",
        text: "To zaproszenie jest przypisane do innego adresu e-mail. Wyloguj się i zaloguj na właściwe konto, aby je potwierdzić.",
        ok: "Wyloguj",
        cancel: "Zamknij",
      },
    },
    confirm: {
      focusTask: "Masz zadanie do wykonania. Chcesz przejść do ankiety?",
      focusSub: "Masz zaproszenie do subskrypcji. Chcesz je zaakceptować?",
    },
    pollFallback: "ankiety",
    pollNameLabel: "„{name}”",
    ownerFallback: "Użytkownik Familiady",
    mail: {
      subtitle: "Centrum ankiet",
      subscriptionTitle: "Zaproszenie do subskrypcji od użytkownika {owner}",
      subscriptionBody:
        "Użytkownik <strong>{owner}</strong> zaprasza Cię do subskrypcji. Kliknij przycisk, aby zobaczyć zaproszenie.",
      subscriptionAction: "Zobacz zaproszenie",
      taskTitle: "Zaproszenie do ankiety",
      taskSubject: "Zaproszenie do ankiety — {name}",
      taskBody: "Użytkownik <strong>{owner}</strong> zaprasza Cię do udziału w {name}.",
      taskAction: "Przejdź do ankiety",
      ignoreNote: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      linkHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      autoNote: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    pollReadyAlert: "Dokończ grę w Moich grach",
    resendCooldownAlert: "Ponowne wysłanie zaproszenia możliwe za {hours} godz.",
  },
  pollsHubPolls: {
    dash: "-",
    title: "Familiada — centrum ankiet",
    backToGames: "Moje gry",
    backToBases: "Bazy pytań",
    logout: "Wyloguj",
    header: {
      title: "Centrum ankiet",
      hint: "Zarządzaj ankietami oraz zaproszeniami do ankiety.",
    },
    tabs: {
      polls: "Ankiety",
      subscriptions: "Subskrypcje",
      tasks: "Zadania",
      subscribersMobile: "Subskryb.",
      subscriptionsMobile: "Subskrypc.",
    },
    sections: {
      myPolls: "Moje ankiety",
      selectHint: "Kliknij kafelek, aby go zaznaczyć.",
      tasks: "Zadania",
      tasksHint: "Dwuklik otwiera ankietę.",
      mySubscribers: "Moi subskrybenci",
      subscribersHint: "Zaproś nowych i zarządzaj zaproszeniami.",
      mySubscriptions: "Moje subskrypcje",
      subscriptionsHint: "Akceptuj zaproszenia od innych.",
    },
    toggle: {
      current: "Aktualne",
      archive: "Archiwalne",
    },
    actions: {
      share: "Udostępnij",
      details: "Szczegóły",
      decline: "Odrzuć",
      remove: "Usuń",
      resend: "Ponów zaproszenie",
      cancel: "Anuluj",
      accept: "Akceptuj",
    },
    invite: {
      placeholder: "E-mail lub nazwa użytkownika",
      button: "Zaproś",
    },
    share: {
      title: "Udostępnij ankietę",
      subtitle: "Wybierz subskrybentów, którym chcesz wysłać zadanie.",
      save: "Zapisz udostępnienie",
      close: "Zamknij",
    },
    details: {
      title: "Szczegóły ankiety",
      titleWithName: "Szczegóły ankiety — {name}",
      subtitle: "Usuń głos powiązany z zadaniem, jeśli to konieczne.",
      voted: "Wypełnili",
      pending: "Nie wypełnili",
      declined: "Odrzucili",
      cancelled: "Anulowane",
      anon: "Anonimowe",
      close: "Zamknij",
    },
    progress: {
      title: "Przetwarzanie",
      subtitle: "Proszę czekać…",
      declineTask: "Odrzucanie zadania…",
      invite: "Zapraszanie…",
      resend: "Ponawianie zaproszenia…",
      removeSubscriber: "Usuwanie subskrybenta…",
      acceptSubscription: "Akceptowanie subskrypcji…",
      updateSubscription: "Aktualizacja subskrypcji…",
      loadSubscribers: "Pobieranie subskrybentów…",
      share: "Udostępnianie…",
      loadDetails: "Pobieranie szczegółów…",
      deleteVote: "Usuwanie głosu…",
    },
    ok: "OK",
    errorLabel: "Błąd",
    pollType: {
      text: "Ankieta tekstowa",
      points: "Punktacja",
    },
    pollState: {
      open: "Otwarta",
      closed: "Zamknięta",
      draft: "Szkic",
    },
    sort: {
      newest: "Najnowsze",
      oldest: "Najstarsze",
      nameAsc: "Nazwa A–Z",
      nameDesc: "Nazwa Z–A",
      type: "Typ",
      state: "Stan",
      tasksActive: "Najwięcej aktywnych zadań",
      tasksDone: "Najwięcej oddanych zadań",
      available: "Tylko dostępne",
      done: "Tylko wykonane",
      nameEmailAsc: "Nazwa/e-mail A–Z",
      nameEmailDesc: "Nazwa/e-mail Z–A",
      status: "Status",
    },
    status: {
      active: "Aktywny",
      pending: "Oczekujące",
      declined: "Odrzucone",
      cancelled: "Anulowane",
    },
    taskStatus: {
      done: "Wykonane",
      available: "Dostępne",
    },
    taskFrom: "Od: {owner}",
    tasksBadgeLabel: "Zadania",
    tasksBadgeTitle: "Zadania: {done} z {total} udostępnionych zagłosowało.",
    tasksBadgeNone: "Zadania: brak udostępnień.",
    anonBadgeLabel: "Anon.",
    anonBadgeTitle: "Anonimowe wyniki: {count}.",
    votesBadgeLabel: "Głosy",
    empty: {
      polls: "Brak ankiet do pokazania.",
      tasks: "Brak zadań do pokazania.",
      subscribers: "Brak subskrybentów.",
      subscriptions: "Brak subskrypcji.",
      activeSubscribers: "Brak aktywnych subskrybentów.",
      tasksShort: "Brak zadań.",
      details: "Brak zadań.",
    },
    shareStatus: {
      done: "Wykonane",
      active: "Dostępne",
      declined: "Odrzucone",
      cancelled: "Anulowane",
      missing: "Brak",
    },
    shareHint: {
      locked: "Zablokowane",
      active: "Aktywne",
      retry: "Możesz ponowić",
      cooldown: "Możesz ponowić za {hours} godz.",
      missing: "Brak",
    },
    shareLockedHint: "Wypełnione — usuń wpis, aby odblokować.",
    shareStatusLabel: "Status",
    shareStatusMissing: "Brak",
    shareHintMissing: "Brak",
    errors: {
      mailSend: "Nie udało się wysłać wiadomości e-mail.",
      mailSession: "Brak aktywnej sesji do wysyłki wiadomości e-mail.",
      declineTask: "Nie udało się odrzucić zadania.",
      invalidEmail: "Niepoprawny e-mail.",
      unknownUser: "Nie znam takiej nazwy użytkownika.",
      invite: "Nie udało się zaprosić.",
      resend: "Nie udało się ponowić zaproszenia.",
      inviteMailFailed: "Zaproszenie zapisane, ale wysyłka wiadomości e-mail nie powiodła się.",
      resendMailFailed: "Ponowienie zapisane, ale wysyłka wiadomości e-mail nie powiodła się.",
      removeSubscriber: "Nie udało się usunąć subskrybenta.",
      acceptSubscription: "Nie udało się zaakceptować zaproszenia.",
      updateSubscription: "Nie udało się zaktualizować subskrypcji.",
      loadSubscribers: "Nie udało się pobrać subskrybentów.",
      shareSave: "Nie udało się zapisać udostępnienia.",
      loadDetails: "Nie udało się pobrać szczegółów.",
      deleteVote: "Nie udało się usunąć głosu.",
      loadHub: "Nie udało się pobrać danych centrum ankiet.",
    },
    statusMsg: {
      inviteSaved: "Zaproszenie zapisane.",
      mailSending: "Wysyłam wiadomość e-mail…",
      mailSent: "Mail wysłany.",
      mailFailed: "Mail nie został wysłany.",
      shareNoChanges: "Brak zmian do zapisania.",
      shareSavedWithMail: "Zapisano udostępnienie. Maile: {sent}/{total}.",
      shareSaved: "Zapisano udostępnienie.",
      shareSavedMsg: "Zapisano udostępnienie.",
      mailBatchSending: "Wysyłam maile…",
      mailMarking: "Oznaczam wysłane maile…",
    },
    modal: {
      removeSubscriber: {
        title: "Usuń subskrybenta",
        text: "Czy na pewno chcesz usunąć tego subskrybenta?",
        ok: "Usuń",
        cancel: "Anuluj",
      },
      updateSubscription: {
        title: "Aktualizuj subskrypcję",
        textPending: "Czy na pewno chcesz odrzucić to zaproszenie?",
        textActive: "Czy na pewno chcesz anulować tę subskrypcję?",
        okPending: "Odrzuć zaproszenie",
        okActive: "Anuluj subskrypcję",
        cancel: "Zamknij",
      },
      deleteVote: {
        title: "Usuń głos",
        text: "Czy na pewno chcesz usunąć głos tej osoby?",
        ok: "Usuń",
        cancel: "Anuluj",
      },
      declineTask: {
        title: "Odrzuć zadanie",
        text: "Czy na pewno chcesz odrzucić to zadanie?",
        ok: "Odrzuć",
        cancel: "Anuluj",
      },
      tokenMismatch: {
        title: "Zaproszenie nie pasuje do konta",
        text: "To zaproszenie jest przypisane do innego adresu e-mail. Wyloguj się i zaloguj na właściwe konto, aby je potwierdzić.",
        ok: "Wyloguj",
        cancel: "Zamknij",
      },
    },
    confirm: {
      focusTask: "Masz zadanie do wykonania. Chcesz przejść do ankiety?",
      focusSub: "Masz zaproszenie do subskrypcji. Chcesz je zaakceptować?",
    },
    pollFallback: "ankiety",
    pollNameLabel: "„{name}”",
    ownerFallback: "Użytkownik Familiady",
    mail: {
      subtitle: "Centrum ankiet",
      subscriptionTitle: "Zaproszenie do subskrypcji od użytkownika {owner}",
      subscriptionBody:
        "Użytkownik <strong>{owner}</strong> zaprasza Cię do subskrypcji. Kliknij przycisk, aby zobaczyć zaproszenie.",
      subscriptionAction: "Zobacz zaproszenie",
      taskTitle: "Zaproszenie do ankiety",
      taskSubject: "Zaproszenie do ankiety — {name}",
      taskBody: "Użytkownik <strong>{owner}</strong> zaprasza Cię do udziału w {name}.",
      taskAction: "Przejdź do ankiety",
      ignoreNote: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      linkHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      autoNote: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    pollReadyAlert: "Dokończ grę w Moich grach",
    resendCooldownAlert: "Ponowne wysłanie zaproszenia możliwe za {hours} godz.",
    shareCooldownAlert: "Ponowne zaproszenie do ankiety możliwe za {hours} godz.",
  },

  pollsHubSubscriptions: {
    dash: "-",
    title: "Familiada — subskrypcje",
    backToGames: "Moje gry",
    logout: "Wyloguj",
    header: {
      title: "Centrum ankiet",
      hint: "Zarządzaj ankietami oraz zaproszeniami do ankiety.",
    },
    tabs: {
      polls: "Ankiety",
      subscriptions: "Subskrypcje",
      tasks: "Zadania",
      subscribersMobile: "Subskryb.",
      subscriptionsMobile: "Subskrypc.",
    },
    sections: {
      myPolls: "Moje ankiety",
      selectHint: "Kliknij kafelek, aby go zaznaczyć.",
      tasks: "Zadania",
      tasksHint: "Dwuklik otwiera ankietę.",
      mySubscribers: "Moi subskrybenci",
      subscribersHint: "Zaproś nowych i zarządzaj zaproszeniami.",
      mySubscriptions: "Moje subskrypcje",
      subscriptionsHint: "Akceptuj zaproszenia od innych.",
    },
    toggle: {
      current: "Aktualne",
      archive: "Archiwalne",
    },
    actions: {
      share: "Udostępnij",
      details: "Szczegóły",
      decline: "Odrzuć",
      remove: "Usuń",
      resend: "Ponów zaproszenie",
      cancel: "Anuluj",
      accept: "Akceptuj",
    },
    invite: {
      placeholder: "E-mail lub nazwa użytkownika",
      button: "Zaproś",
    },
    share: {
      title: "Udostępnij ankietę",
      subtitle: "Wybierz subskrybentów, którym chcesz wysłać zadanie.",
      save: "Zapisz udostępnienie",
      close: "Zamknij",
    },
    details: {
      title: "Szczegóły ankiety",
      titleWithName: "Szczegóły ankiety — {name}",
      subtitle: "Usuń głos powiązany z zadaniem, jeśli to konieczne.",
      voted: "Wypełnili",
      pending: "Nie wypełnili",
      declined: "Odrzucili",
      cancelled: "Anulowane",
      anon: "Anonimowe",
      close: "Zamknij",
    },
    progress: {
      title: "Przetwarzanie",
      subtitle: "Proszę czekać…",
      declineTask: "Odrzucanie zadania…",
      invite: "Zapraszanie…",
      resend: "Ponawianie zaproszenia…",
      removeSubscriber: "Usuwanie subskrybenta…",
      acceptSubscription: "Akceptowanie subskrypcji…",
      updateSubscription: "Aktualizacja subskrypcji…",
      loadSubscribers: "Pobieranie subskrybentów…",
      share: "Udostępnianie…",
      loadDetails: "Pobieranie szczegółów…",
      deleteVote: "Usuwanie głosu…",
    },
    ok: "OK",
    errorLabel: "Błąd",
    pollType: {
      text: "Ankieta tekstowa",
      points: "Punktacja",
    },
    pollState: {
      open: "Otwarta",
      closed: "Zamknięta",
      draft: "Szkic",
    },
    sort: {
      newest: "Najnowsze",
      oldest: "Najstarsze",
      nameAsc: "Nazwa A–Z",
      nameDesc: "Nazwa Z–A",
      type: "Typ",
      state: "Stan",
      tasksActive: "Najwięcej aktywnych zadań",
      tasksDone: "Najwięcej oddanych zadań",
      available: "Tylko dostępne",
      done: "Tylko wykonane",
      nameEmailAsc: "Nazwa/e-mail A–Z",
      nameEmailDesc: "Nazwa/e-mail Z–A",
      status: "Status",
    },
    status: {
      active: "Aktywny",
      pending: "Oczekujące",
      declined: "Odrzucone",
      cancelled: "Anulowane",
    },
    taskStatus: {
      done: "Wykonane",
      available: "Dostępne",
    },
    tasksBadgeLabel: "Zadania",
    tasksBadgeTitle: "Zadania: {done} z {total} udostępnionych zagłosowało.",
    tasksBadgeNone: "Zadania: brak udostępnień.",
    anonBadgeLabel: "Anon.",
    anonBadgeTitle: "Anonimowe wyniki: {count}.",
    votesBadgeLabel: "Głosy",
    empty: {
      polls: "Brak ankiet do pokazania.",
      tasks: "Brak zadań do pokazania.",
      subscribers: "Brak subskrybentów.",
      subscriptions: "Brak subskrypcji.",
      activeSubscribers: "Brak aktywnych subskrybentów.",
      tasksShort: "Brak zadań.",
      details: "Brak zadań.",
    },
    shareStatus: {
      done: "Wykonane",
      active: "Dostępne",
      declined: "Odrzucone",
      cancelled: "Anulowane",
      missing: "Brak",
    },
    shareHint: {
      locked: "Zablokowane",
      active: "Aktywne",
      retry: "Możesz ponowić",
      cooldown: "Możesz ponowić za {hours} godz.",
      missing: "Brak",
    },
    shareLockedHint: "Wypełnione — usuń wpis, aby odblokować.",
    shareStatusLabel: "Status",
    shareStatusMissing: "Brak",
    shareHintMissing: "Brak",
    errors: {
      mailSend: "Nie udało się wysłać wiadomości e-mail.",
      mailSession: "Brak aktywnej sesji do wysyłki wiadomości e-mail.",
      declineTask: "Nie udało się odrzucić zadania.",
      invalidEmail: "Niepoprawny e-mail.",
      unknownUser: "Nie znam takiej nazwy użytkownika.",
      invite: "Nie udało się zaprosić.",
      resend: "Nie udało się ponowić zaproszenia.",
      inviteMailFailed: "Zaproszenie zapisane, ale wysyłka wiadomości e-mail nie powiodła się.",
      resendMailFailed: "Ponowienie zapisane, ale wysyłka wiadomości e-mail nie powiodła się.",
      removeSubscriber: "Nie udało się usunąć subskrybenta.",
      acceptSubscription: "Nie udało się zaakceptować zaproszenia.",
      updateSubscription: "Nie udało się zaktualizować subskrypcji.",
      loadSubscribers: "Nie udało się pobrać subskrybentów.",
      shareSave: "Nie udało się zapisać udostępnienia.",
      loadDetails: "Nie udało się pobrać szczegółów.",
      deleteVote: "Nie udało się usunąć głosu.",
      loadHub: "Nie udało się pobrać danych centrum ankiet.",
    },
    statusMsg: {
      inviteSaved: "Zaproszenie zapisane.",
      mailSending: "Wysyłam wiadomość e-mail…",
      mailSent: "Mail wysłany.",
      mailFailed: "Mail nie został wysłany.",
      shareNoChanges: "Brak zmian do zapisania.",
      shareSavedWithMail: "Zapisano udostępnienie. Maile: {sent}/{total}.",
      shareSaved: "Zapisano udostępnienie.",
      shareSavedMsg: "Zapisano udostępnienie.",
      mailBatchSending: "Wysyłam maile…",
      mailMarking: "Oznaczam wysłane maile…",
    },
    modal: {
      removeSubscriber: {
        title: "Usuń subskrybenta",
        text: "Czy na pewno chcesz usunąć tego subskrybenta?",
        ok: "Usuń",
        cancel: "Anuluj",
      },
      updateSubscription: {
        title: "Aktualizuj subskrypcję",
        textPending: "Czy na pewno chcesz odrzucić to zaproszenie?",
        textActive: "Czy na pewno chcesz anulować tę subskrypcję?",
        okPending: "Odrzuć zaproszenie",
        okActive: "Anuluj subskrypcję",
        cancel: "Zamknij",
      },
      deleteVote: {
        title: "Usuń głos",
        text: "Czy na pewno chcesz usunąć głos tej osoby?",
        ok: "Usuń",
        cancel: "Anuluj",
      },
      declineTask: {
        title: "Odrzuć zadanie",
        text: "Czy na pewno chcesz odrzucić to zadanie?",
        ok: "Odrzuć",
        cancel: "Anuluj",
      },
      tokenMismatch: {
        title: "Zaproszenie nie pasuje do konta",
        text: "To zaproszenie jest przypisane do innego adresu e-mail. Wyloguj się i zaloguj na właściwe konto, aby je potwierdzić.",
        ok: "Wyloguj",
        cancel: "Zamknij",
      },
    },
    confirm: {
      focusTask: "Masz zadanie do wykonania. Chcesz przejść do ankiety?",
      focusSub: "Masz zaproszenie do subskrypcji. Chcesz je zaakceptować?",
    },
    pollFallback: "ankiety",
    pollNameLabel: "„{name}”",
    ownerFallback: "Użytkownik Familiady",
    mail: {
      subtitle: "Subskrypcje",
      subscriptionTitle: "Zaproszenie do subskrypcji od użytkownika {owner}",
      subscriptionBody:
        "Użytkownik <strong>{owner}</strong> zaprasza Cię do subskrypcji. Kliknij przycisk, aby zobaczyć zaproszenie.",
      subscriptionAction: "Zobacz zaproszenie",
      taskTitle: "Zaproszenie do ankiety",
      taskSubject: "Zaproszenie do ankiety — {name}",
      taskBody: "Użytkownik <strong>{owner}</strong> zaprasza Cię do udziału w {name}.",
      taskAction: "Przejdź do ankiety",
      ignoreNote: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      linkHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      autoNote: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    pollReadyAlert: "Dokończ grę w Moich grach",
    resendCooldownAlert: "Ponowne wysłanie zaproszenia możliwe za {hours} godz.",
    cooldownLeftDays: "Spróbuj ponownie za {n} dni",
    cooldownLeftHours: "Spróbuj ponownie za {n} godz.",
    shareCooldownAlert: "Ponowne zaproszenie do ankiety możliwe za {hours} godz.",
  },
  logoEditor: {
    title: "Familiada — edytor logo",
    topbar: {
      backToGames: "Moje gry",
      logout: "Wyloguj",
    },
    list: {
      title: "Twoje logo",
      hint: "Kliknij kafelek, żeby go zaznaczyć. Dwuklik (albo przytrzymanie na dotyku) zmienia nazwę.",
      preview: "Podgląd",
      edit: "Edytuj",
      export: "Eksport",
      import: "Import",
      delete: "Usuń",
    },
    status: {
      saving: "Zapisuję…",
      saved: "Zapisano.",
      deleting: "Usuwam…",
      deleted: "Usunięto.",
      imported: "Zaimportowano logo.",
    },
    editor: {
      nameLabel: "Nazwa",
      namePlaceholder: "Np. Moje logo",
      save: "Zapisz",
      newLogoPrefix: "Nowe logo — ",
      editLogoPrefix: "Edycja logo — ",
    },
    modes: {
      text: "Tekst",
      draw: "Rysunek",
      image: "Obraz",
    },
    text: {
      placeholder: "Np. FAMILIADA",
      allowedChars: "Dozwolone znaki",
      allowedCharsHide: "Ukryj",
      invalidChars: "Niedozwolone znaki: {chars}",
      tooWide: "Napis się nie mieści: szerokość {width}/30.",
      widthStatus: "Szerokość: {width}/30 ({status}).",
      fits: "mieści się",
      notFits: "nie mieści się",
      fixInvalidChars: "Usuń albo zamień niedozwolone znaki.",
      fixTooWide: "Napis się nie mieści — skróć go.",
    },
    draw: {
      colors: {
        black: "czarny",
        white: "biały",
      },
      aria: {
        backgroundColor: "Tło sceny: {color}",
      },
      tooltips: {
        select: "Wskaźnik\nZaznaczaj i przesuwaj obiekty",
        pan: "Rączka\nPrzesuwanie powiększonego widoku",
        text: "Tekst\nKliknij scenę, żeby dodać napis",
        zoomIn: "Powiększ",
        zoomOut: "Pomniejsz",
        background: "Tło sceny\nPrzełącz czarne / białe",
        brush: "Pędzel\nRysowanie odręczne",
        eraser: "Gumka\nUsuwa obiekty, których dotknie",
        shapes: "Kształty\nWybierz kształt i przeciągnij na scenie",
        shapesLines: "Shift: kwadrat / koło; linia i strzałka co 15°.\nKońce zaznaczonej linii lub strzałki można przeciągać.",
        undo: "Cofnij",
        redo: "Ponów",
        duplicate: "Duplikuj\nKopia zaznaczonych obiektów",
        clear: "Wyczyść\nUsuń wszystko ze sceny",
        preview: "Podgląd\nTak logo będzie wyglądać na wyświetlaczu",
      },
      errors: {
        missingFabric: "Nie udało się wczytać edytora rysunku. Odśwież stronę.",
      },
      confirmClear: "Usunąć wszystko ze sceny?",
      ui: {
        strokeLabel: "Grubość",
        styleLabel: "Styl",
        colorLabel: "Kolor",
        colorBlack: "Czarny",
        colorWhite: "Biały",
        sizeLabel: "Rozmiar",
        fillCheckbox: "Wypełnienie",
        outlineLabel: "Obrys",
        lineHeightLabel: "Interlinia",
        letterSpacingLabel: "Odstęp liter",
        bold: "B",
        italic: "I",
        underline: "U",
        fontFallback: "Czcionka",
        sampleText: "Przykład",
        defaultText: "Tekst",
        shortcutPrefix: "Skrót: ",
        holdKey: "{key} (przytrzymaj)",
        spaceKey: "Spacja",
        fontSearchPlaceholder: "Szukaj czcionki…",
        fontNoResults: "Brak wyników",
        polygonDone: "Zakończ wielokąt",
        alignLeft: "Wyrównaj do lewej",
        alignCenter: "Wyśrodkuj",
        alignRight: "Wyrównaj do prawej",
        shapes: {
          line: "Linia",
          rect: "Prostokąt",
          roundRect: "Zaokrąglony prostokąt",
          ellipse: "Elipsa",
          triangle: "Trójkąt",
          diamond: "Romb",
          pentagon: "Pięciokąt",
          hexagon: "Sześciokąt",
          star5: "Gwiazda",
          arrow1: "Strzałka",
          arrow2: "Strzałka dwustronna",
          arrow1Fill: "Strzałka pełna",
          arrow2Fill: "Strzałka dwustronna pełna",
          heart: "Serce",
          polygon: "Wielokąt",
        },
        lineStyles: {
          solid: "Ciągła",
          dashed: "Kreskowana",
          dotted: "Kropkowana",
          dashDot: "Kreska-kropka",
        },
        confirmClearFallback: "Wyczyścić scenę?",
      },
    },
    image: {
      pickImage: "Wybierz obraz",
      brightness: "Jasność",
      contrast: "Kontrast",
      gamma: "Gamma",
      black: "Czerń",
      white: "Biel",
      dither: "Dither",
      brightnessLabel: "Jasność:",
      contrastLabel: "Kontrast:",
      gammaLabel: "Gamma:",
      blackLabel: "Czerń:",
      whiteLabel: "Biel:",
      ditherLabel: "Dither:",
      straighten: "Prostowanie",
      straightenLabel: "Prostowanie:",
      rotateLeft: "Obróć w lewo o 90°",
      rotateRight: "Obróć w prawo o 90°",
      invert: "Odwróć",
      reset: "Przywróć",
      displayArea: "Obszar wyświetlacza",
      previewTitle: "Podgląd jak na wyświetlaczu",
      previewHint: "Kliknij podgląd, żeby otworzyć go na pełnym ekranie.",
      loadError: "Nie udało się wczytać obrazu.",
      errors: {
        notLogged: "Musisz być zalogowany, żeby zapisać obraz.",
        storageFailed: "Nie udało się wysłać obrazu na serwer: {error}",
        stillLoading: "Obraz jeszcze się wczytuje — spróbuj za chwilę.",
        loadFailed: "Nie udało się wczytać obrazu tego logo. Wybierz obraz ponownie — do tego czasu zapis jest wyłączony, żeby nie nadpisać logo pustym.",
        tooLarge: "Plik jest za duży (maks. {max} MB).",
        badType: "Nieobsługiwany format. Wybierz plik JPG, PNG, GIF albo WEBP.",
        noImage: "Najpierw wybierz obraz.",
      },
    },
    create: {
      title: "Nowe logo",
      subtitle: "Wybierz, jak chcesz je stworzyć.",
      nameModalTitle: "Nowe logo",
      nameModalSub: "Podaj nazwę nowego logo.",
      textTitle: "Tekst",
      textSubtitle: "Napis czcionką jak w klasycznym logo Familiady",
      drawTitle: "Rysunek",
      drawSubtitle: "Rysuj, dodawaj kształty i napisy",
      imageTitle: "Obraz",
      imageSubtitle: "Twój obraz zamieniony na kropki wyświetlacza",
    },
    preview: {
      title: "Podgląd",
      subtitle: "Tak będzie wyglądać logo na wyświetlaczu",
    },
    common: {
      save: "Zapisz",
      cancel: "Anuluj",
    },
    rename: {
      title: "Zmień nazwę",
      sub: "Wpisz nową nazwę i zapisz.",
      placeholder: "Nazwa…",
      emptyError: "Nazwa nie może być pusta.",
      failed: "Nie udało się zmienić nazwy.",
    },
    import: {
      title: "Import logo",
      confirm: "Importuj",
      steps: {
        saveDb: "Zapisuję w bazie…",
      },
    },
    export: {
      title: "Eksport…",
      subtitle: "Nie zamykaj strony — trwa przygotowanie pliku.",
    },
    errors: {
      saveFailed: "Nie udało się zapisać.",
      saveFailedDetailed: "Nie udało się zapisać.\n\n{error}",
      saveError: "Błąd zapisu.",
      importFailedDetailed: "Nie udało się zaimportować.\n\n{error}",
      exportFailedDetailed: "Nie udało się wyeksportować.\n\n{error}",
      fontsLoad: "Nie udało się wczytać czcionek wyświetlacza. Odśwież stronę.",
      invalidJson: "To nie jest plik logo (.famlogo).",
      pixSize: "Plik logo ma zły rozmiar: {actualW}×{actualH} zamiast {expectedW}×{expectedH}.",
      missingBits: "Plik logo jest uszkodzony — brak obrazu.",
      unknownImportFormat: "Nieznany format pliku. Wybierz plik logo wyeksportowany z Familiady (.famlogo).",
      deleteFailed: "Nie udało się usunąć.\n\n{error}",
      noMobileEdit: "Edycja logo wymaga większego ekranu — otwórz ją na komputerze albo tablecie.",
      noSourceText: "Nie da się odczytać napisu z tego logo, więc edycja by go wyczyściła. Utwórz nowe logo tekstowe.",
      loadFailed: "Nie udało się wczytać logo.\n\n{error}",
    },
    defaults: {
      logoName: "Moje logo",
      logoFileName: "logo",
      unnamed: "(bez nazwy)",
    },
    confirm: {
      closeUnsaved: "Masz niezapisane zmiany. Zamknąć bez zapisywania?",
      deleteLogo: "Usunąć logo „{name}”?",
    },
  },
  baseExplorer: {
    title: "Familiada — menedżer bazy pytań",
    headerTitle: "Menedżer bazy pytań",
    backToBases: "Moje bazy",
    logout: "Wyloguj",
    common: {
      close: "Zamknij",
      save: "Zapisz",
      delete: "Usuń",
      dash: "—",
    },
    defaults: {
      baseName: "Baza pytań",
      folder: "Folder",
      tag: "tag",
      question: "Pytanie",
    },
    search: {
      placeholder: "Szukaj...",
      clear: "Wyczyść",
    },
    toolbar: {
      groupCreate: "Tworzenie",
      newFolder: "Nowy folder",
      newQuestion: "Nowe pytanie",
      groupEdit: "Edycja",
      editQuestion: "Edytuj pytanie",
      editTags: "Tagi",
      rename: "Zmień nazwę",
      delete: "Usuń",
      groupClipboard: "Schowek",
      copy: "Kopiuj",
      cut: "Wytnij",
      paste: "Wklej",
      duplicate: "Duplikuj",
      groupGame: "Gra",
      createGame: "Utwórz grę",
      groupView: "Widok",
      refreshView: "Odśwież widok",
    },
    tree: {
      toggle: "Zwiń/rozwiń",
      root: "Folder główny",
      folders: "Foldery",
      empty: "Brak folderów.",
    },
    tags: {
      modalTitle: "Tagi",
      addTag: "+ Dodaj tag",
      editTitle: "Tag",
      namePlaceholder: "Nazwa taga…",
      pickColor: "Wybierz kolor",
      colorLabel: "Kolor",
      colorModalTitle: "Kolor",
      colorPreview: "Podgląd koloru",
      hexLabel: "HEX",
      hexHint: "Format: <b>#RRGGBB</b>",
      header: "Tagi",
      metaHeader: "Pasujące kategorie",
      empty: "Brak tagów.",
      selectionQuestions: "{count} pyt.",
      selectionFolders: "{count} folder(ów)",
      selectionSummary: "Zaznaczenie: {items}.",
      selectionEmpty: "Brak zaznaczenia.",
      partialWarning: "Tag jest przypisany częściowo. Kliknięcie ustawi: wszyscy.",
      partial: "częściowo",
      editModeTitle: "Edytuj tag",
      createModeTitle: "Nowy tag",
      editModeHelp: "Zmień nazwę i kolor taga.",
      createModeHelp: "Dodaj nowy tag.",
      errors: {
        noSpaces: "Nazwa nie może zawierać spacji. Użyj _ zamiast spacji.",
        allowedChars: "Dozwolone znaki: litery, cyfry i _",
        duplicate: "Taki tag już istnieje. Wybierz inną nazwę.",
        saveAssignFailed: "Nie udało się zapisać tagów.",
        saveFailed: "Nie udało się zapisać taga.",
      },
    },
    rename: {
      title: "Zmień nazwę",
      help: "Wpisz nową nazwę i zapisz.",
      folderTitle: "Zmień nazwę folderu",
      questionTitle: "Zmień treść pytania",
    },
    export: {
      title: "Eksport gry",
      subtitle:
        "Wybierz co najmniej 10 pytań. Czerwone nie spełniają warunków wybranego typu — odhacz je albo popraw dane.",
      gameNameLabel: "Nazwa gry",
      questionsLabel: "Pytania",
      typeTitle: "Typ gry",
      typePollText: "Ankieta tekstowa",
      typePollPoints: "Punktacja",
      typePrepared: "Preparowana",
      selectedTitle: "Zaznaczone (min 10)",
      selectedLabel: "WYBRANE",
      create: "Utwórz",
      defaultGameName: "gra",
      typeHintPollText: "10+ pytań, bez wymagań odpowiedzi.",
      typeHintPollPoints: "10+ pytań, każde 3–6 odpowiedzi.",
      typeHintPrepared: "10+ pytań, 3–6 odpowiedzi, suma punktów ≤ 100.",
      answersCount: "{count} odp.",
      noAnswers: "bez odp.",
      preparedSummary: "{count} odp. • suma {sum}",
      errors: {
        minQuestions: "Potrzebujesz co najmniej {count} pytań, żeby zrobić eksport.",
        pickMin: "Zaznacz co najmniej {count} pytań.",
        pickBad: "Odznacz czerwone pytania (nie spełniają warunków wybranego typu) albo popraw ich dane.",
        createFailed: "Nie udało się utworzyć gry (szczegóły w pasku progresu / konsoli).",
      },
      progress: {
        creatingGame: "Tworzenie gry…",
        exporting: "Eksport…",
        done: "Eksport zakończony.",
        created: "Utworzono grę.",
        error: "Eksport nie powiódł się.",
        errorDetail: "Błąd: {error}",
        importingQuestions: "Import pytań…",
        importDone: "Import zakończony",
        importOk: "OK",
      },
    },
    question: {
      title: "Pytanie",
      subtitle:
        "Edycja pojedynczego pytania. Max 6 odpowiedzi. Punkty opcjonalne.\n        Jeśli wpisane: 0–100, suma ≤ 100.",
      textLabel: "Treść pytania",
      textPlaceholder: "Wpisz treść pytania…",
      answerHeader: "Odpowiedź",
      pointsHeader: "Punkty",
      addAnswer: "+ Odpowiedź",
      sumTitle: "Suma punktów (max 100)",
      sumLabel: "SUMA",
      answerPlaceholder: "Odpowiedź…",
      pointsPlaceholder: "—",
      errors: {
        maxAnswers: "Max 6 odpowiedzi.",
        pointsRange: "Punkty muszą być w zakresie 0–100 (jeśli wpisane).",
        sumExceeded: "Suma punktów nie może przekroczyć 100.",
        textRequired: "Treść pytania nie może być pusta.",
      },
    },
    list: {
      colNumber: "Nr",
      colName: "Nazwa",
      colType: "Typ",
      colDate: "Data",
      colInfo: "Info",
      folderType: "Folder",
      folderCount: "{count} elem.",
      questionType: "Pytanie",
      answerCount: "{count} odp.",
      empty: "Brak elementów.",
      resizeColumn: "Przeciągnij, aby zmienić szerokość kolumny",
    },
    menu: {
      show: "Pokaż",
      addTag: "Dodaj tag…",
      editTag: "Edytuj tag…",
      delete: "Usuń",
      deleteTag: "Usuń tag",
      deleteTags: "Usuń tagi",
      newFolder: "Nowy folder",
      newQuestion: "Nowe pytanie",
      copy: "Kopiuj",
      cut: "Wytnij",
      paste: "Wklej",
      duplicate: "Duplikuj",
      tags: "Tagi…",
      openFolder: "Otwórz folder",
      newFolderIn: "Nowy folder w tym folderze",
      newQuestionIn: "Nowe pytanie w tym folderze",
      editQuestion: "Edytuj pytanie…",
      rename: "Zmień nazwę",
      renameQuestion: "Zmień nazwę (treść)",
      createGame: "Utwórz grę…",
    },
    meta: {
      prepared: "preparowane",
      pollPoints: "punktowane",
      pollText: "typowe",
    },
    errors: {
      missingBaseId: "Brak identyfikatora bazy.",
      noAccess: "Brak dostępu do tej bazy.",
      loadFailed: "Nie udało się wczytać bazy (sprawdź konsolę).",
      deleteTagsFailed: "Nie udało się usunąć tagów.",
      duplicateFailed: "Nie udało się zduplikować.",
      operationFailed: "Nie udało się wykonać operacji.",
      rootDeleteBlocked: "Folder główny nie może być usuwany.",
      renameFailed: "Nie udało się zmienić.",
      moveIntoSelf: "Nie można przenieść folderu do niego samego.",
      moveIntoChild: "Nie można przenieść folderu do jego podfolderu.",
      selectItemsRight: "Zaznacz foldery lub pytania po prawej.",
      noTagsSelected: "Brak wybranych tagów.",
      rootInOperation: "Folder główny nie może brać udziału w tej operacji.",
      actionFailed: "Nie udało się wykonać akcji.",
      assignTagFailed: "Nie udało się przypisać taga.",
      moveFailed: "Nie udało się przenieść.",
      questionOpenSaveFailed: "Nie udało się otworzyć/zapisać pytania.",
      missingUserId: "Brak userId — nie można utworzyć gry.",
      exportModalMissing: "Błąd: exportModal nie jest zainicjalizowany.",
      createGameFailed: "Nie udało się utworzyć gry.",
      deleteInSearch: "W widoku wyszukiwania nie można usuwać.",
      removeTagsFailed: "Nie udało się zdjąć tagów.",
      deleteFailed: "Nie udało się usunąć.",
      pasteInSearch: "W widoku wyszukiwania nie można wklejać.",
      pasteInTag: "W widoku tagów nie można wklejać.",
      pasteFailed: "Nie udało się wkleić.",
      createQuestionFailed: "Nie udało się utworzyć pytania.",
      createFolderFailed: "Nie udało się utworzyć folderu.",
      treeLockedSearch:
        "W trakcie wyszukiwania drzewo jest zablokowane. Kliknij ✕ aby wyczyścić, albo kliknij poza pole wyszukiwania.",
      treeLockedSelection:
        "Masz zaznaczone Tagi/Kategorie. Wyczyść zaznaczenie po lewej (klik w tło panelu), aby używać drzewa.",
      tagsLockedSearch:
        "W trakcie wyszukiwania panel Tagi/Kategorie jest zablokowany. Kliknij ✕ aby wyczyścić, albo kliknij poza pole wyszukiwania.",
      searchLockedSelection:
        "Masz zaznaczone Tagi/Kategorie — wyszukiwarka jest zablokowana. Wyczyść zaznaczenie po lewej (klik w tło panelu), aby szukać.",
    },
    confirm: {
      deleteItems: "Usunąć {label}? Tego nie da się cofnąć.",
      deleteTags:
        "Usunąć {label}?\n\nTo usunie też przypisania tagów do pytań (i ewentualnie folderów).",
      removeTagsInTagView:
        "Jesteś w widoku tagów.\n\nUsuwamy tagi (bez kasowania elementów) na {label}.\n\nKontynuować?",
    },
  },
  control: {
    shortcuts: {"mappingAnswers": "1–6 — zaznacz odpowiedź z listy", "answers": "1–6 → Enter — odsłoń odpowiedź", "x": "X → Enter — pudło", "t": "T → Enter — timer", "a": "A → Enter — drużyna A", "b": "B → Enter — powrót / ręczny wybór drużyny B w pojedynku", "c": "C → Enter — zatwierdź zgłoszenie", "p": "P → Enter — oddaj kontrolę", "n": "N → Enter — przycisk dalszego przejścia", "e": "E → Enter — zmień ustawienia", "w": "W — wpisana odpowiedź", "o": "O — brak odpowiedzi", "r": "R — powtórzenie", "m": "M — wycisz / włącz dźwięk", "reveal": "Enter — odsłoń odpowiedź, kolejny Enter — punkty", "fields": "↑ / ↓ / Enter — poprzednie / następne puste pole", "entryTimer": "Ctrl+Enter (Cmd+Enter na Macu) — start / stop timera", "entryRepeat": "Shift+Enter w pustym polu — powtórzenie"},
    title: "Familiada — panel sterowania",
    loading: "Ładowanie panelu…",
    backToGames: "Moje gry",
    logout: "Wyloguj",
    statusLabel: "Status urządzeń",
    optional: "(opcjonalnie)",
    deviceDisplay: "Wyświetlacz",
    deviceHost: "Prowadzący",
    deviceBuzzer: "Przycisk do pojedynku",
    lastSeen: "Ostatnio widziano:",
    deviceSeenNone: "brak",
    deviceSeenSeconds: "{seconds}s temu",
    deviceDropped: "Uwaga: {label} rozłączony. Sprawdź połączenie z internetem na urządzeniu.",
    presenceNoTable: "Brak tabeli device_presence.",
    qrModalTitle: "Urządzenie",
    qrModalImgAlt: "Kod QR",
    qrModalLinkAria: "Link do urządzenia",
    qrModalCodeHint: "familiada.online → Podłącz urządzenie → wprowadź kod",
    deviceCodeHint: "Wejdź na familiada.online, kliknij \"Podłącz urządzenie\" i wprowadź kod urządzenia.",
    qrCodeBtn: "Kod QR",
    qrOnDisplayToggle: "QR na wyświetlaczu",
    alertOk: "OK",
    colorTitle: "Kolor",
    colorHexLabel: "HEX",
    colorHexFormat: "Format:",
    colorPreviewAria: "Podgląd koloru",
    colorHint: "Zmiany wysyłamy pokazywane na bierząco.",
    tabDevices: "Urządzenia",
    tabSetup: "Pytania i ustawienia",
    tabSetupShort: "Ustawienia",
    tabRounds: "Rundy",
    tabFinal: "Finał",
    stepDevices: "Urządzenia",
    blackScreen: "Czarny ekran",
    shareDevice: "Udostępnij",
    qrDisplayAlt: "QR do wyświetlacza",
    qrHostAlt: "QR prowadzącego",
    qrBuzzerAlt: "QR Przycisku do pojedynku",
    qrOnDisplay: "QR na wyświetlaczu",
    qrHide: "Schowaj QR",
    hostLinkAria: "Link do prowadzącego",
    buzzerLinkAria: "Link do Przycisku do pojedynku",
    stepAudio: "Dźwięk",
    audioUnlockTitle: "Odblokuj dźwięk",
    audioUnlockHint: "Kliknij raz przycisk, żeby przeglądarka zezwoliła na odtwarzanie dźwięków.",
    audioUnlockBtn: "🔊 Odblokuj",
    audioBlocked: "ZABLOKOWANE",
    audioStatusOk: "ODBLOKOWANE",
    stepTeamNames: "Nazwy drużyn",
    teamHint: "Tutaj należy wprowadzić nazwy drużyn.",
    stepLook: "Wygląd",
    lookColors: "Kolory",
    activeColorLabel: "Kolor aktywnych kropek",
    activeColorAria: "Wybierz kolor aktywnych kropek",
    lookTheme: "Motyw",
    lookThemeHint: "Wybierz motyw wyświetlacza.",
    lookLogoTitle: "Logo",
    lookLogoHint: "Wybierz logo, które pojawi się na wyświetlaczu.",
    lookLogoDefault: "Domyślne",
    lookLogoLoading: "Ładowanie logo…",
    lookLogoNone: "Brak własnych logo. Zostanie użyte logo domyślne.",
    roundsBuzzAcceptTeam: "Zatwierdź: {name}",
    teamALabel: "Drużyna A",
    teamBLabel: "Drużyna B",
    teamAColorAria: "Kolor drużyny A",
    teamBColorAria: "Kolor drużyny B",
    bgColorLabel: "Kolor tła wyświetlacza",
    bgColorAria: "Kolor tła wyświetlacza",
    resetColors: "Przywróć",
    stepGameSettings: "Ustawienia pytań i rozgrywki",
    sectionFinal: "Finał",
    playFinal: "Gramy finał?",
    finalQuestionsMode: "Pytania finału",
    sectionRounds: "Rundy",
    roundsQuestionsMode: "Pytania rund",
    extraSettingsTitle: "Dodatkowe ustawienia",
    extraSettingsHint: "Zmieniaj ustawienia mądrze! Zbyt wysokie progi mogą spowodować brak pytań, a za duża kwota wygranej może nie zmieścić się na wyświetlaczu.",
    roundMultipliers: "Mnożniki rund",
    roundMultipliersHint: "Podaj po przecinku, np. <b>1,1,1,2,3</b>",
    finalPrizeMultiplier: "Mnożnik nagrody (po finale)",
    finalPrizeMultiplierHint: "Mnożnik decydujący o kwocie nagrody głównej",
    mainPrizeAmount: "Kwota nagrody głównej",
    mainPrizeAmountHint: "Maks. 5 cyfr (do 99 999)",
    gameTarget: "Cel rozgrywki",
    finalTarget: "Cel finału",
    gameEndMode: "Zakończenie gry",
    showLogo: "Pokaż logo",
    showPoints: "Pokaż punkty",
    showMoney: "Pokaż kwotę (po finale)",
    advancedReset: "Przywróć domyślne",
    stepFinalPick: "Wybierz pytania finału",
    finalQuestions: "Pytania",
    finalBadge: "Finał:",
    finalPoolHint: "Pytania rund (pula).",
    finalPoolEmpty: "Brak dostępnych pytań",
    finalPickEmpty: "Kliknij lub przeciągnij pytanie, żeby dodać (max 5)",
    finalListHint: "Pytania finału (max 5).",
    finalOnlyHint: "Pytania zatwierdzone. Kliknij \"Edytuj\", aby zmienić.",
    refresh: "Odśwież",
    confirm: "Zatwierdź",
    edit: "Edytuj",
    stepRoundsPick: "Kolejność pytań rund",
    roundsPickHint: "Ustaw kolejność pytań dla kolejnych rund. Pytania z finału zostały wykluczone.",
    toggleYes: "Tak",
    toggleNo: "Nie",
    toggleRandom: "Losuj",
    togglePick: "Wybierz",
    stepSetupFinish: "Podsumowanie",
    summaryTeams: "Drużyny",
    summaryFinal: "Finał",
    summaryFinalQuestions: "Pytania finału",
    summaryRoundsQuestions: "Pytania rund",
    summaryDefaultSettings: "Używasz domyślnych ustawień rozgrywki. Możesz je dostosować w Ustawieniach rozgrywki.",
    summarySettingsLink: "Zmień ustawienia",
    summaryDisplay: "Wygląd",
    summaryColors: "Kolory",
    summaryTheme: "Motyw",
    summaryLogo: "Logo",
    colorBg: "Tło",
    colorDot: "Kropki",
    summarySound: "Dźwięk",
    summaryGame: "Ustawienia gry",
    setupFinishHint: "Po kliknięciu \"Gotowe\" przejdziesz do panelu rund.",
    tooFewFinalQuestions: "Za mało pytań do losowania finału",
    summaryQRandom: "Losowanie w toku…",
    summaryQNone: "Brak pytań",
    summaryQModePick: "Wybrane",
    summaryQModeRandom: "Losowane",
    summaryQWillRandom: "Zostaną wylosowane przy starcie",
    summaryQNoOrder: "Brak kolejności",
    summaryDefault: "Domyślne",
    roundsReadyTitle: "Gra gotowa",
    roundsReadyName: "Przygotowanie gry",
    roundsReadyHint: "Upewnij się, że Wyświetlacz, Prowadzący i Przycisk są podłączone. Potem uruchom ekran gry.",
    roundsReadyBtn: "Gra gotowa",
    roundsIntroTitle: "Intro gry",
    roundsIntroName: "Rozpocznij grę",
    roundsIntroHint: "Na wyświetlaczu pojawi się logo programu i zostanie otworzone intro. Po zakończeniu przejdziesz do pierwszej rundy.",
    roundsIntroBtn: "Rozpocznij grę",
    roundsStartTitle: "Rozpocznij rundę",
    roundsStartName: "Pusta plansza + pytanie",
    roundsStartHint: "Na wyświetlaczu pojawi się pusta plansza rundy, a prowadzący dostanie treść pytania.",
    roundsStartBtn: "Rozpocznij rundę",
    roundsDuelTitle: "Zatwierdź przycisk",
    roundsDuelName: "Pojedynek przyciskiem",
    roundsDuelHint: "Przycisk jest aktywny. Gdy któraś drużyna naciśnie — wybierz, czy zatwierdzasz, albo powtórz naciśnięcie.",
    roundsBuzzAcceptA: "Zatwierdź drużynę A",
    roundsBuzzAcceptB: "Zatwierdź drużynę B",
    roundsBuzzRetry: "Ponów naciśnięcie",
    roundsBuzzConfirm: "Zatwierdź",
    roundsDuelHintPhysical: "Obserwuj kto nacisnął przycisk jako pierwszy. Kliknij drużynę, a następnie kliknij Zatwierdź.",
    physicalBuzzer: "Przycisk fizyczny",
    physicalBuzzerHint: "Jeśli używasz przycisku fizycznego, wybierz tę opcję. Operator na podstawie obserwacji decyduje, kto nacisnął pierwszy.",
    noHostTablet: "Nie używaj tabletu prowadzącego",
    noHostTabletHint: "Jeśli prowadzący nie używa osobnego tabletu/telefonu, zaznacz tę opcję. Podpięcie urządzenia prowadzącego nie będzie wymagane.",
    soundSection: "Dźwięk",
    soundSourceIntro: "Jeśli Wyświetlacz jest otwarty na innym urządzeniu (np. telewizorze) i chcesz, żeby dźwięk grał stamtąd, wybierz źródło poniżej.",
    soundSourceControlOpt: "Panel sterowania",
    soundSourceDisplayOpt: "Wyświetlacz",
    soundSourceDisplayHint: "Po przełączeniu na Wyświetlaczu pojawi się przycisk odblokowania dźwięku — kliknij go, żeby odblokować odtwarzanie.",
    roundsPlayTitle: "Runda",
    roundsPlayName: "Rozgrywka",
    roundsPlayHint: "Wciskaj odpowiedź jeśli poprawna, lub X (pudło), można również uruchomić odliczanie 3s (czas=X). Po zakończeniu pojedynku, można oddać pytanie przeciwnej drużynie. We właściwej rozgrywce po trzech X uruchomi się kradzież (szansa przeciwnej drużyny).",
    roundsPassQuestion: "Oddaj pytanie",
    roundsAnswers: "Odpowiedzi",
    roundsAddX: "X (pudło)",
    roundsStartTimer3: "Rozpocznij odliczanie 3s",
    roundsEndRound: "Zakończ rundę",
    roundsNextRoundBtn: "Przejdź do następnej rundy",
    roundsGoToFinalBtn: "Przejdź do finału",
    roundsGoToGameEndBtn: "Przejdź do zakończenia gry",
    roundsGameEndTitle: "Koniec gry",
    roundsGameEndName: "Zakończ grę",
    roundsGameEndHint: "To była ostatnia runda. Na wyświetlaczu pokażemy logo programu albo punkty zwycięskiej drużyny (jeśli są włączone).",
    roundsGameEndBtn: "Zakończ grę",
    finalStartTitle: "Start finału",
    finalStartName: "Rozpocznij finał",
    finalStartHint: "Dźwięk finału, schowanie starej planszy, wjazd planszy finału. Prowadzący dostaje pytania.",
    finalStartBtn: "Rozpocznij finał",
    finalP1EntryTitle: "Runda 1 — wpisywanie",
    finalP1EntryName: "Odpowiedzi gracza 1 (15s)",
    finalP1EntryHint: "Operator wpisuje odpowiedzi gracza. Możesz użyć Enter, żeby przejść do następnego pytania, lub strzałki góra/dół, żeby szybko przełączać się między pytaniami. Odliczanie rusza po wciśnięciu przycisku. Timer można uruchomić przyciskiem lub skrótem Shift + Ctrl (Cmd na Macu), można też zatrzymać jeśli wszystko zostało wpisane, przyciskiem lub tym samym skrótem.",
    finalStartTimer15: "Rozpocznij odliczanie (15s)",
    finalP1MapQ1Title: "Runda 1 — mapowanie (P1)",
    finalMapHint: "Wybierz odpowiedź z listy, jeśli pasuje, jeśli nie to odpowiedź gracza za 0 pkt. Jeśli nic nie było wpisane to brak odpowiedzi. Możesz odsłonić odpowiedź i punkty.",
    finalP1MapQ2Title: "Runda 1 — mapowanie (P2)",
    finalP1MapQ3Title: "Runda 1 — mapowanie (P3)",
    finalP1MapQ4Title: "Runda 1 — mapowanie (P4)",
    finalP1MapQ5Title: "Runda 1 — mapowanie (P5)",
    finalP2StartTitle: "Runda 2 — start",
    finalP2StartName: "Rozpocznij 2 rundę",
    finalP2StartHint: "Dźwięk rundy, odpowiedzi gracza 1 zostaną ukryte, tutaj możesz odtworzyć dzwięk powtórzenia.",
    finalP2StartBtn: "Rozpocznij 2 rundę",
    finalRepeatSound: "Dźwiek powtórzenia",
    finalP2EntryTitle: "Runda 2 — wpisywanie",
    finalP2EntryName: "Odpowiedzi gracza 2 (20s)",
    finalP2EntryHint: "Operator wpisuje odpowiedzi gracza. Możesz użyć Enter, żeby przejść do następnego pytania, lub strzałki góra/dół, żeby szybko przełączać się między pytaniami. Enter + Shift zaznacza powtórzenie. Odliczanie rusza po wciśnięciu przycisku. Możesz widzieć odpowiedź gracza 1. Powtórzenie to tylko dźwięk + status dla prowadzącego. Timer można uruchomić przyciskiem lub skrótem Shift + Ctrl (Cmd na Macu), można też zatrzymać jeśli wszystko zostało wpisane, przyciskiem lub tym samym skrótem.",
    finalStartTimer20: "Rozpocznij odliczanie (20s)",
    finalP2MapQ1Title: "Runda 2 — mapowanie (P1)",
    finalP2MapQ2Title: "Runda 2 — mapowanie (P2)",
    finalP2MapQ3Title: "Runda 2 — mapowanie (P3)",
    finalP2MapQ4Title: "Runda 2 — mapowanie (P4)",
    finalP2MapQ5Title: "Runda 2 — mapowanie (P5)",
    finalEndTitle: "Zakończ finał",
    finalEndName: "Koniec",
    finalEndHint: "To koniec finału. Na wyświetlaczu pokażemy logo programu, punkty zwycięskiej drużyny lub kwotę wygranej (w zależności co wybrałeś w ustawieniach). Po zakończeniu możesz wrócić do strony „Moje gry”.",
    finalEndBtn: "Zakończ finał",
    finalOutroHint: "Końcowa plansza jest już na wyświetlaczu. Kliknij „Zakończ grę”, aby odtworzyć outro.",
    finalAnswerLengthHint: "Wyświetlacz finału mieści 11 znaków odpowiedzi, razem ze spacjami. Pełny tekst pozostaje w panelu i na ekranie prowadzącego. Słowo urwane na wyświetlaczu oznaczamy kropką.",
    noId: "Brak ID gry.",
    gameNotReady: "Gra niegotowa: {reason}",
    dataMismatch: "Niezgodność danych.",
    gameNotFound: "Nie znaleziono gry.",
    qrCopyOk: "Skopiowano!",
    qrCopyFail: "Błąd kopiowania.",
    codeCopyOk: "Kod skopiowany!",
    codeCopyFail: "Błąd kopiowania kodu.",
    unloadWarn: "Gra w toku. Czy na pewno chcesz wyjść?",
    confirmBack: "Czy na pewno chcesz wrócić? Postęp może zostać utracony.",
    leaveTitle: "Wróć do Moich gier?",
    leaveText: "Gra jest w toku. Wyjście przerwie rozgrywkę.",
    leaveOk: "Wyjdź",
    leaveCancel: "Zostań",
    audioOk: "Dźwięk działa!",
    audioFail: "Błąd dźwięku.",
    sfxAdvanced: "Zaawansowane",
    sfxAddFile: "Własny plik",
    sfxChooseFile: "Wybierz plik",
    sfxSaveCloud: "Zapisz w chmurze",
    sfxSaveBtn: "Zapisz",
    sfxResetAll: "Przywróć domyślne",
    sfxResetConfirm: "Przywrócić domyślne ustawienia dźwięku? Wszystkie własne pliki i głośności zostaną usunięte.",
    sfxTooLongTitle: "Plik za długi",
    sfxTooLong: "Maksymalna długość to {limit}s",
    sfxDesc: {
      show_intro: "Muzyka intro programu",
      show_outro: "Muzyka outro programu",
      round_transition: "Przejście między rundami",
      final_theme: "Muzyka finału",
      buzzer_press: "Naciśnięcie Przycisku do pojedynku",
      answer_correct: "Poprawna odpowiedź",
      answer_wrong: "Błędna odpowiedź (X)",
      answer_repeat: "Powtórzenie odpowiedzi w finale",
      time_over: "Koniec czasu w finale",
      reveal: "Odsłanianie",
    },
    finalConfirmed: "Finał zatwierdzony!",
    finalReloadStart: "Wczytywanie…",
    finalReloadDone: "Odświeżono.",
    advSaved: "Zapisano.",
    advReset: "Reset OK.",
    deviceStatusOk: "POŁĄCZONO",
    deviceStatusOffline: "OFFLINE",
    deviceStatusNone: "—",
    deviceSeenNone: "—",
    controlPrefix: "Sterowanie: ",
    dash: "—",
    answerFallback: "Odpowiedź",
    shareDeviceModal: {
      noneCurrent: "Nie udostępniono jeszcze tego urządzenia.",
      title: "Udostępnij",
      subtitle: "Wybierz subskrybenta lub wpisz e-mail.",
      currentLabel: "Aktualnie udostępnione dla:",
      sectionAdd: "Przez e-mail / nazwę",
      noneShared: "Nie udostępniono.",
      noSubs: "Brak subskrybentów.",
      typeHost: "Prowadzący",
      typeBuzzer: "Przycisk do pojedynku",
      typeDisplay: "Wyświetlacz",
      openDevice: "Otwórz: {type}",
      mailSubject: "Udostępniono urządzenie: {type}",
      mailBody: "{owner} udostępnił(a) Ci urządzenie: {type} (gra: {game}).",
      subtitle2: "Wybierz subskrybentów i urządzenia do udostępnienia.",
      loading: "Ładowanie…",
      failed: "Błąd udostępniania.",
    },
    gameLabel: "Panel sterowania",
    stepDisplay: "Wyświetlacz",
    stepHostBuzzer: "Prowadzący i przycisk",
    devicesFinish: "Gotowe — przejdź dalej",
    teamADefault: "Drużyna A",
    teamBDefault: "Drużyna B",
    extraSettingsToggle: "Dodatkowe ustawienia",
    finalRandom: "Losuj",
    finalPick: "Wybierz",
    selected: "wybranych",
    roundsRandom: "Losuj",
    roundsPick: "Wybierz",
    setupFinishTitle: "Gra jest gotowa do rozpoczęcia",
    stepFinal: "Finał",
    roundsMsg: {
      gameReady: "Gra gotowa. Ekran oczekuje na start.",
      introAlready: "Intro gry zostało już odtworzone.",
      introRunning: "Intro uruchomione.",
      introDone: "Intro zakończone. Możesz rozpocząć rundę.",
      noMoreQuestions: "Brak dostępnych pytań dla kolejnych rund (wszystkie zużyte).",
      duelWait: "Czekam na przycisk.",
      duelRetry: "Powtórzenie naciśnięcia.",
      duelFirstClick: "Pierwsza: {team}. Zatwierdź albo powtórz.",
      duelFirstAnswer: "Pojedynek – pierwsza odpowiada: {team}.",
      duelNextTeam: "Teraz odpowiada: {team}.",
      duelReset: "Obie odpowiedzi pudło – nowy cykl. Zaczyna: {team}.",
      duelResultWin: "Pojedynek wygrywa: {team}.",
      playControl: "Kontrolę ma: {team}.",
      playNoControl: "Brak drużyny grającej.",
      playPassOnlyDuring: "Pytanie można oddać tylko podczas rozgrywki.",
      playNoMorePass: "Nie możesz już oddać pytania w tej rundzie.",
      playPassed: "Pytanie oddane. Teraz gra: {team}.",
      stealNoControl: "Nie mogę uruchomić kradzieży – brak drużyny grającej.",
      stealPrompt: "Kradzież: odpowiada {team}. Kliknij odpowiedź lub X (pudło).",
      stealChance: "Szansa na kradzież. Odpowiada: {team}.",
      stealSuccess: "Kradzież udana – bank przechodzi do drużyny kradnącej.",
      stealFail: "Kradzież nietrafiona – bank zostaje przy drużynie grającej.",
      revealNone: "Brak odpowiedzi do odsłonięcia.",
      revealInfo:
        "Klikaj brakujące odpowiedzi, żeby pokazać je na wyświetlaczu (bez zmiany punktów).",
      revealDone: "Wszystkie odpowiedzi odsłonięte. Koniec rundy.",
      roundNoControlBank: "Brak drużyny grającej – nie mogę przyznać banku.",
      roundBank: "Koniec rundy. {bank} pkt dla {team}.",
      roundBankMult:
        "Koniec rundy. {bank} pkt dla {team} (x{mult} = {awarded} pkt).",
      roundToFinal: "Rundy zakończone. Przechodzimy do finału.",
      roundNext: "Runda zakończona. Możesz rozpocząć kolejną rundę.",
      roundLast: "To była ostatnia runda. Przejdź do zakończenia gry.",
      timerTimeoutX: "Czas minął – pudło.",
      gameEndDraw: "Koniec gry. Remis {a}:{b}.",
      gameEndWin: "Koniec gry. Wygrywa {team} z wynikiem {pts} pkt.",
      roundStartSfx: "Startuję rundę – leci dźwięk przejścia.",
    },
    roundsHost: {
      passAvailable: "Można oddać kontrolę drugiej drużynie.",
      roundTitleDuelBuzzer: "RUNDA {round} — PRZYCISK",
      roundTitleDuel: "RUNDA {round} — POJEDYNEK",
      roundTitlePlay: "RUNDA {round} — ROZGRYWKA",
      roundTitleSteal: "RUNDA {round} — KRADZIEŻ",
      roundTitleReveal: "RUNDA {round} — ODSŁANIANIE",
      roundTitleDefault: "RUNDA {round}",
    },
    finalMsg: {
      errMissing5: "Brakuje 5 pytań finału (zatwierdź w ustawieniach).",
      timerPlaceholder: "—",
      timerRunning: "Odliczanie trwa…",
      finalDisabled: "Finał nie został włączony.",
      finalNeedsPick: "Zatwierdź 5 pytań finału w ustawieniach.",
      finalNeedsPoints: "Finał dostępny dopiero po osiągnięciu {pts} punktów.",
      finalStarted: "Finał rozpoczęty.",
      round2Started: "Runda 2 rozpoczęta.",
      endNoPrize: "Finał zakończony. Logo zostanie wyświetlone.",
      end200Plus: "Próg przekroczony! {mainPrize}",
      endBelow200: "Poniżej progu. {smallPrize}",
      defaultMainPrize: "Nagroda główna",
      defaultSmallPrize: "Nagroda z punktów",
      startError: "Błąd startu finału.",
    },
    finalHost: {
      entryDone: "wpisano",
      entryEmpty: "brak",
      entryRepeat: "powtórzenie",
      titleRound1Timer: "FINAŁ RUNDA 1 — ODLICZANIE {seconds}s",
      titleRound1: "FINAŁ RUNDA 1",
      titleRound2Timer: "FINAŁ RUNDA 2 — ODLICZANIE {seconds}s",
      titleRound2: "FINAŁ RUNDA 2",
      titleRound1Reveal: "FINAŁ RUNDA 1 — ODSŁANIANIE",
      titleRound2Reveal: "FINAŁ RUNDA 2 — ODSŁANIANIE",
      titleRevealRound1: "FINAŁ — ODSŁANIANIE (RUNDA 1)",
      titleRevealRound2: "FINAŁ — ODSŁANIANIE (RUNDA 2)",
      questionLabel: "Pytanie {n}",
      player1Label: "Gracz 1",
      enteredLabel: "Wprowadzono",
      statusRepeat: "powtórzenie",
      statusEmpty: "brak odpowiedzi",
      statusMatch: "z listy",
      statusMissing: "nie ma na liście",
      statusLabel: "Stan",
      answersListLabel: "Lista odpowiedzi:",
    },
    finalUi: {
      questionLabel: "Pytanie {n}",
      inputPlaceholder: "Wpisz…",
      p2HintP1Prefix: "Odpowiedź gracza 1: ",
      p2RepeatOn: "Powtórzenie",
      p2RepeatOff: "Powtórzenie",
      mapHintInputPrefix: "Wpisano: ",
      mapHintNoInput: "Brak wpisu",
      mapHintNoText: "Nie wpisano odpowiedzi — Puste / 0 pkt.",
      mapListTitle: "Lista odpowiedzi",
      mapListEmpty: "Brak listy odpowiedzi.",
      mapBtnSkip: "Brak odpowiedzi",
      mapBtnMiss: "Nie ma na liście (0 pkt)",
      fallbackAnswer: "—",
      p1EmptyUi: "Brak odpowiedzi",
      timerStop: "Zatrzymaj odliczanie",
      timerStart15: "Rozpocznij odliczanie (15s)",
      timerStart20: "Rozpocznij odliczanie (20s)",
      tableQuestion: "Pytanie",
      tableAnswer: "Odpowiedź",
      tablePlayer1Answer: "Odpowiedź gracza 1",
      tableRepeat: "Powtórzenie",
      playerAnswer: "Odpowiedź gracza",
      player2Answer: "Odpowiedź gracza 2",
      player1Answer: "Odpowiedź gracza 1",
      revealAnswer: "Odsłoń odpowiedź",
      revealPoints: "Odsłoń punkty",
      occupied: "zajęte",
      mapInputLabel: "Wpisano",
      mapMissSubLabel: "(odpowiedź gracza)",
    },
    sfxCustom: "Własny",
    ingameGuard: {
      title: "Gra w toku",
      message: "Nie możesz zmieniać ustawień podczas trwającej rozgrywki. Poczekaj na zakończenie gry lub odblokuj, jeśli panel sterowania nie jest otwarty.",
      back: "Wróć",
      unlock: "Odblokuj ustawienia",
    },
    controlTitle: "Panel sterowania",
    copyOk: "Skopiowano.",
    copyFail: "Nie mogę skopiować.",
    // --- control2/js/ui.js (i18n wiring, dopisane, nie z audytu control.html) ---
    teamsVsFormat: "{teamA} vs {teamB}",
    summaryLogoCustom: "niestandardowe",
    roundsOrderFixed: "Ustalona kolejność ({count})",
    finalPickedCount: "Wybrane ręcznie ({count}/5)",
    reshuffleQuestions: "Losuj ponownie",
    setupDoneBtn: "Gotowe — przejdź do rozgrywki",
    summaryStepperTitle: "Podsumowanie ustawień",
    finalPickIncompleteWarning: "Finał ustawiony na \"wybrane ręcznie\", ale nie wybrano 5 pytań w ustawieniach gry.",
    deviceOfflineWarning: "Rozłączone urządzenia: {devices}. Akcje gry są zablokowane do ponownego połączenia.",
    deviceLostTitle: "Utracono połączenie",
    deviceLostText: "Połączenie z urządzeniami: {devices} zostało zerwane.\n\nSprawdź połączenie internetowe panelu sterowania oraz urządzeń. Jeśli połączenie nie wznowi się za chwilę, podłącz urządzenia ponownie za pomocą przycisków na górnym pasku.\n\nAkcje gry pozostają zablokowane do powrotu wszystkich wymaganych urządzeń. Odliczanie czasu trwa dalej.",
    keyboardShortcutsTitle: "Skróty klawiszowe",
    introStepTitle: "Rozpoczęcie gry",
    roundStepLabel: "Runda {round}",
    scoreLine: "{name}: {points}",
    stepDuelTitle: "Runda {round} — pojedynek",
    stepPlayTitle: "Runda {round} — rozgrywka",
    stepStealTitle: "Runda {round} — kradzież",
    physicalConfirmTeam: "Potwierdź: {name}",
    roundsPassControl: "Oddaj kontrolę",
    statusPlayingLabel: "Gra: ",
    statusBankLabel: "Bank: ",
    statusStealLabel: "Kradzież: ",
    statusFinalSumLabel: "Suma finału: ",
    gameEndSummaryDraw: "Remis — {a}:{b}",
    gameEndSummaryWin: "Wygrała drużyna {team} wynikiem {hi}:{lo}",
    endHintLogo: "Zabrzmi outro, a na wyświetlaczu pojawi się logo.",
    endHintMoney: "Zabrzmi outro, a na wyświetlaczu pojawi się wygrana kwota pieniędzy.",
    endHintPoints: "Zabrzmi outro, a na wyświetlaczu pojawi się wynik w punktach.",
    restartGame: "Zacznij od nowa",
    returnToMyGames: "Wróć do moich gier",
    finalEntryHeading: "Odpowiedzi gracza {round}",
    finalEntryStepLabel: "Finał — gracz {round}, wpisywanie",
    finalMappingStepLabel: "Finał — mapowanie {n}/5",
    finalP2StartStepLabel: "Finał — start rundy 2",
    finalTimerStopShort: "Zatrzymaj",
    finalTimerUsed: "Czas wykorzystany",
    finalRevealAnswerLabel: "Pokaż odpowiedź",
    finalRevealPointsLabel: "Pokaż punkty",
    displayPreviewTitle: "Podgląd wyświetlacza",
    unhandledStepDebug: "Nieobsłużony krok: {step}",
  },
  maintenance: {
    title: "Trwa przerwa techniczna",
    pageTitle: "Familiada — przerwa techniczna",
    messageText:
      "System jest chwilowo niedostępny.\nZa jakiś czas wszystko wróci do normy i będzie można kontynuować pracę.",
    inactiveTitle: "Brak prac technicznych",
    inactiveText: "Aktualnie nie trwają żadne prace.",
    returnAtTitle: "Trwa przerwa techniczna",
    returnAtText:
      "System jest chwilowo niedostępny.\nPowrót nastąpi:",
    countdownTitle: "Trwa przerwa techniczna",
    countdownText:
      "System jest chwilowo niedostępny.\nPowrót nastąpi:",
    countdownDone: "Serwis jest ponownie dostępny. Odśwież stronę.",
    refresh: "Odśwież",
    contact: "Kontakt",
    statusLabel: "Status:",
    footerLeft: "Familiada — tryb konserwacji",
    footerRight: "Masz pilną sprawę? <a href=\"mailto:kontakt@familiada.online\">kontakt@familiada.online</a>",
  },
  marketplace: {
    title: "Gry Społeczności",
    pageTitle: "Gry Społeczności — gotowe pytania do Familiady",
    subtitle: "Przeglądaj gry stworzone przez społeczność i dodawaj je do swojej biblioteki.",
    loading: "Ładowanie…",
    nav: {
      myGames: "Moje gry",
      backHome: "Strona główna",
    },
    searchPlaceholder: "Szukaj gry…",
    searchLabel: "Szukaj gier",
    filterLabel: "Język",
    filterAll: "Wszystkie",
    sortLabel: "Sortowanie",
    sortRecommended: "Polecane",
    sortRating: "Najlepiej oceniane",
    sortPopular: "Najczęściej dodawane",
    sortNewest: "Najnowsze",
    sortTitle: "Tytuł A–Z",
    btnMySent: "Moje wysłane",
    btnBackBrowse: "Przeglądaj",
    btnAddToLibrary: "Dodaj do moich gier",
    btnRemoveFromLibrary: "Usuń z moich gier",
    addedBadge: "W Twoich grach",
    withdrawnBadge: "Wycofana",
    producerBadge: "Familiada",
    langLabel: "Język",
    authorLabel: "od: {author}",
    libraryCount: "{count} dodano",
    loadMore: "Pokaż więcej",
    empty: "Brak gier spełniających kryteria.",
    errorLoad: "Nie udało się załadować gier.",
    detail: {
      questions: "Pytania",
      noQuestions: "Brak pytań w podglądzie.",
      points: "{count} pkt",
      notFound: "Nie znaleziono tej gry.",
    },
    rating: {
      none: "Brak ocen",
      rateThis: "Oceń tę grę:",
      saved: "Dziękujemy — Twoja ocena została zapisana.",
      ownGameError: "Nie możesz ocenić własnej gry.",
      ratersTitle: "Kto ocenił",
    },
    errors: {
      not_authenticated: "Musisz być zalogowany.",
      game_not_available: "Ta gra nie jest już dostępna.",
      game_not_found: "Nie znaleziono tej gry.",
      invalid_stars: "Ocena musi mieć od 1 do 5 gwiazdek.",
      cannot_rate_own_game: "Nie możesz ocenić własnej gry.",
      not_found_or_not_published: "Gra nie istnieje albo nie jest opublikowana.",
      unknown: "Operacja nie powiodła się. Spróbuj ponownie.",
    },
    mySent: {
      title: "Moje wysłane gry",
      empty: "Nie wysłałeś jeszcze żadnej gry do Gier Społeczności.",
      btnAdd: "Dodaj nową do Gier Społeczności",
      statusPending: "Oczekuje na weryfikację",
      statusPublished: "Opublikowana",
      statusRejected: "Odrzucona",
      statusWithdrawn: "Wycofana",
      reasonLabel: "Powód: {note}",
      btnWithdraw: "Wycofaj",
      btnPreview: "Podgląd / Oceny",
      withdrawConfirmTitle: "Wycofać grę?",
      withdrawConfirm: "Na pewno wycofać tę grę z Gier Społeczności?",
      withdrawn: "Wycofano.",
    },
    submit: {
      title: "Dodaj grę do Gier Społeczności",
      pickGame: "Wybierz grę",
      pickGamePlaceholder: "— wybierz grę —",
      titleLabel: "Tytuł",
      titlePlaceholder: "Tytuł widoczny w Grach Społeczności",
      descLabel: "Opis",
      descPlaceholder: "Krótki opis gry (temat, poziom trudności, dla kogo…)",
      langLabel: "Język gry",
      snapshotWarning: "To jest niezmienny zapis gry. Po wysłaniu nie można edytować tej pozycji w Grach Społeczności.",
      withdrawInfo: "Wycofanie usuwa ją z katalogu, ale osoby, które ją dodały, nadal ją mają.",
      checkboxConfirm: "Rozumiem, że po wysłaniu zapis gry jest nieedytowalny.",
      btnSubmit: "Wyślij do Gier Społeczności",
      btnCancel: "Anuluj",
      noEligible: "Brak odpowiednich gier.",
      success: "Wysłano! Gra oczekuje na weryfikację.",
      errorMissingGame: "Wybierz grę.",
      errorMissingTitle: "Podaj tytuł.",
      errorCheckbox: "Zaznacz potwierdzenie.",
      errorLoadEligible: "Nie udało się pobrać Twoich gier.",
      err: {
        game_not_found: "Nie znaleziono gry.",
        game_not_playable: "Gra nie jest grywalna. Sprawdź czy ma co najmniej 10 pytań i spełnia wszystkie wymagania.",
        too_few_questions: "Za mało pytań — wymagane minimum to 10.",
        invalid_lang: "Nieprawidłowy język.",
        invalid_title: "Nieprawidłowy tytuł.",
        invalid_payload: "Błąd eksportu gry.",
        invalid_description: "Opis jest za długi.",
        already_submitted: "Ta gra ma już aktywne zgłoszenie.",
        not_authenticated: "Musisz być zalogowany.",
        submit_failed: "Błąd wysyłania. Spróbuj ponownie.",
      },
    },
  },
  notFound: {
    title: "Familiada — strona nie istnieje",
    messageTitle: "Strona nie istnieje",
    messageText:
      "Tego adresu nie ma lub został przeniesiony. Sprawdź poprawność linku.",
    redirectHint: "Za chwilę wrócisz na stronę główną.",
    homeBtn: "Strona główna",
    marketplaceBtn: "Przeglądaj Gry Społeczności",
    footerLeft: "Familiada",
    footerRight: "Jeśli to błąd — <a href=\"mailto:kontakt@familiada.online\">kontakt@familiada.online</a>",
  },
  connectDevice: {
    tv: {
      pageTitle: "Familiada — Podłącz wyświetlacz",
      title: "Podłącz wyświetlacz",
      codeLabel: "Wpisz kod z panelu sterowania",
      invalidFormat: "Wpisz 6-cyfrowy kod Wyświetlacza lub ekranu QR ankiety.",
      checking: "Sprawdzanie kodu…",
      invalidCode: "Kod jest nieprawidłowy lub wygasł. Sprawdź kod w panelu sterowania.",
      wrongDevice: "Ten kod nie jest kodem wyświetlacza. Wpisz kod Wyświetlacza z panelu sterowania lub ekranu QR z ankiety.",
      networkError: "Nie udało się połączyć. Sprawdź połączenie internetowe i spróbuj ponownie.",
    },
    title: "Familiada — podłącz urządzenie",
    topbar: { back: "Moje gry" },
    header: {
      title: "Podłącz urządzenie",
      hint: "Zeskanuj kod QR lub otwórz link, żeby podłączyć urządzenie.",
      hintMobile: "Podłącz się jako prowadzący lub Przycisk do pojedynku albo zeskanuj kod QR z Panelu sterowania.",
      hintDesktop: "Podłącz się jako wyświetlacz lub zeskanuj QR z panelu sterowania.",
    },
    scan: {
      title: "Zeskanuj kod QR urządzenia",
      hint: "Skieruj kamerę na kod QR wyświetlony w panelu sterowania.",
      btn: "Skanuj QR",
      cameraError: "Brak dostępu do kamery.",
      noQr: "Nie znaleziono kodu QR na zdjęciu.",
      noApi: "Użyj aparatu systemowego do zeskanowania kodu QR.",
    },
    shared: {
      title: "Urządzenia udostępnione dla mnie",
      empty: "Brak udostępnionych urządzeń.",
      loading: "Ładowanie…",
      error: "Błąd ładowania.",
      open: "Otwórz",
      opening: "Otwieranie…",
      gameNotFound: "Nie znaleziono gry.",
      noName: "Bez nazwy",
    },
    deviceType: {
      host: "Prowadzący",
      buzzer: "Przycisk do pojedynku",
      display: "Wyświetlacz",
      pollQr: "Wyświetlacz QR",
    },
    warning: {
      mobileOnly: "Ta strona działa najlepiej na telefonie lub tablecie. Możesz kontynuować.",
      desktopOnly: "Ta strona działa najlepiej na komputerze lub TV. Możesz kontynuować.",
    },
    enterCode: {
      title: "Wprowadź kod urządzenia",
      placeholder: "000000",
      btn: "Podłącz",
      connectBtn: "Połącz",
      hint: "Wejdź na familiada.online, kliknij „Podłącz urządzenie” i wprowadź ten kod.",
      invalidCode: "Wprowadź 6-cyfrowy kod.",
      resolving: "Sprawdzanie kodu…",
      codeNotFound: "Nie znaleziono urządzenia dla tego kodu. Sprawdź czy kod jest poprawny.",
      previewGame: "Gra:",
      previewOwner: "Właściciel:",
    },
  },
  security: {
    selfXssWarning: "Używanie tej konsoli może pozwolić atakującym na podszywanie się pod Ciebie i kradzież informacji przy użyciu ataku zwanego Self-XSS. Nie wprowadzaj ani nie wklejaj kodu, którego nie rozumiesz.",
  },
  gameSettings: {
    title: "Familiada — ustawienia gry",
    back: "Moje gry",
    saveAll: "Zapisz wszystko",
    resetAll: "Przywróć domyślne",
    play: "Graj",
    resetAllConfirm: "Przywrócić ustawienia domyślne? Niezapisane zmiany zostaną utracone.",
    resetSection: "Przywróć domyślne",
    resetSectionConfirm: "Przywrócić domyślne ustawienia tej sekcji?",
    unsaved: "Niezapisane zmiany",
    unsavedConfirm: "Masz niezapisane zmiany. Czy chcesz opuścić stronę?",
    unsavedConfirmModal: "Masz niezapisane zmiany. Czy chcesz zamknąć ustawienia?",
    saved: "Zapisano",
    saveError: "Błąd zapisu",
    saveErrorPrefix: "Błąd zapisu: ",
    saveErrorFinalNeed5: (v) => `Wybierz 5 pytań finałowych (wybrano ${v.count}/5).`,
    saveErrorCustomNoFile: "Wybrano własny dźwięk ale nie wgrano pliku dla: {names}",
    saveConflict: "Te ustawienia zostały w międzyczasie zmienione w innym miejscu. Odśwież stronę i wprowadź zmiany ponownie.",
    loadError: "Nie można załadować gry: ",
    unknownError: "nieznany błąd",
    errorPrefix: "Błąd: ",
    pageTitle: "Ustawienia rozgrywki",
    defaultGameName: "Gra",
    categories: {
      teams: "Drużyny",
      display: "Wygląd",
      sound: "Dźwięk",
      questions: "Pytania — Ustawienia",
      rounds: "Pytania — Rundy",
      finale: "Pytania — Finał",
      game: "Ustawienia gry",
    },
    teams: {
      nameA: "Nazwa drużyny A",
      nameB: "Nazwa drużyny B",
      restoreDefaults: "Przywróć domyślne",
      defaultA: "Drużyna A",
      defaultB: "Drużyna B",
      placeholderA: "np. Rodzina Kowalskich",
      placeholderB: "np. Rodzina Nowaków",
      defaultHint: "Jeśli nie wpiszesz nazw drużyn, zostaną pokazane domyślne wartości: {a} i {b}",
    },
    display: {
      logo: "Logo",
      logoDefault: "Domyślne",
      logoNone: "Bez logo",
      logoLoading: "Ładowanie logo…",
      logoMissing: "Logo zostało usunięte — używamy domyślnego",
      frameMode: "Tryb ramki",
      frameModeClassic: "Klasyczna",
      frameModeMinimal: "Minimalna",
      preview: "Podgląd wyświetlacza",
      colors: "Kolory",
      colorA: "Kolor drużyny A",
      colorB: "Kolor drużyny B",
      colorBg: "Kolor tła",
      colorBgShort: "Tło",
      colorDot: "Kolor kropki",
      colorsReset: "Resetuj kolory",
      theme: "Motyw",
    },
    questions: {
      modeRandom: "Losowe",
      modeOrdered: "Kolejność",
      modeManual: "Ręcznie",
      countPerRound: "Pytań per runda",
      roundsCount: "Liczba rund",
      addQuestion: "+ Dodaj pytanie z puli",
      finaleSection: "Finał",
      finaleTitle: "Pytania finałowe",
      finaleModeRandom: "Losowe z puli",
      finaleModeSelected: "Ustalone",
      finaleCount: "Liczba pytań finałowych",
      addFinaleQuestion: "+ Dodaj pytanie finałowe",
      finalModeLabel: "Tryb wyboru pytań finału",
      finalModeHint: "Losowe = 5 pytań losowanych automatycznie. Ręcznie = wybierz pytania w zakładce \u201EPytania \u2014 Fina\u0142\u201D.",
      roundsSection: "Rundy",
      roundsModeLabel: "Tryb kolejności pytań rund",
      roundsModeHint: "Losowe = każda runda losuje pytanie. Kolejność = pytania w ustalonej kolejności (zakładka \u201EPytania \u2014 Rundy\u201D).",
    },
    finale: {
      dragHint: "Wybierz pytania do finału. Klikaj lub przeciągaj, musisz wybrać 5",
      hasFinal: "Czy gra zawiera finał?",
      yes: "Tak",
      no: "Nie",
      disabled: "Finał wyłączony — pytania finałowe nie będą używane.",
      randomize: "Losuj {n} pytań",
      rerandomize: "Losuj ponownie",
      randomLocked: "Wylosowane pytania finału (niemodyfikowalne):",
    },
    sound: {
      comingSoon: "Ustawienia dźwięku będą dostępne wkrótce.",
      resetConfirm: "Przywrócić domyślne ustawienia dźwięku? Wszystkie własne pliki i ustawienia głośności zostaną usunięte.",
    },
    rounds: {
      hint: "Ustaw kolejność pytań dla rund. Przeciągnij lub użyj strzałek.",
      up: "W górę",
      down: "W dół",
    },
    game: {
      roundMultipliers: "Mnożniki rund",
      roundMultipliersHint: "Po przecinku, np. 1,1,1,2,3. Ostatnia wartość powtarza się dla kolejnych rund.",
      roundsScoreSection: "Punktacja rund",
      finalMinPoints: "Próg punktów do finału",
      finalMinPointsHint: "Przynajmniej jedna drużyna musi zdobyć tyle punktów, by odblokować finał.",
      finalTarget: "Cel finału (pkt)",
      finaleSection: "Finał",
      endMode: "Zakończenie gry",
      endScreenSection: "Ekran końcowy",
      endModeLabel: "Tryb ekranu po zakończeniu",
      endModeLogo: "Pokaż logo",
      endModeLogoShort: "Logo",
      endModePoints: "Pokaż punkty",
      endModePointsShort: "Punkty",
      endModeMoney: "Pokaż kwotę (po finale)",
      endModeMoneyShort: "Kwota nagrody",
      prizeMultiplier: "Mnożnik nagrody (po finale)",
      prizeAmount: "Kwota główna nagrody",
      restoreDefaults: "Przywróć domyślne",
    },
  },
  authEmail: {
    signup: {
      subject: "FAMILIADA — Potwierdzenie konta",
      subtitle: "Potwierdzenie konta",
      title: "Aktywuj konto",
      desc: "Kliknij przycisk poniżej, aby potwierdzić adres e-mail i dokończyć rejestrację.",
      btn: "POTWIERDŹ KONTO",
      ignore: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      linkLabel: "Link nie działa?",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    guestMigrate: {
      subject: "FAMILIADA — Potwierdź migrację",
      subtitle: "Migracja konta",
      title: "Potwierdź migrację",
      desc: "Kliknij przycisk poniżej, aby potwierdzić adres e-mail i przenieść konto gościa.",
      btn: "POTWIERDŹ MIGRACJĘ",
      ignore: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      linkLabel: "Link nie działa?",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    recovery: {
      subject: "FAMILIADA — Reset hasła",
      subtitle: "Reset hasła",
      title: "Ustaw nowe hasło",
      desc: "Otrzymaliśmy prośbę o zmianę hasła. Kliknij przycisk poniżej, aby ustawić nowe.",
      btn: "USTAW NOWE HASŁO",
      ignore: "Jeśli to nie Ty — zignoruj tę wiadomość. Hasło nie zmieni się, dopóki nie użyjesz linku.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    emailChange: {
      subject: "FAMILIADA — Zmiana e-mail",
      subtitle: "Zmiana e-mail",
      title: "Potwierdź nowy adres",
      desc: "Kliknij poniżej, aby potwierdzić nowy adres e-mail przypisany do Twojego konta.",
      btn: "Potwierdź nowy e-mail",
      ignore: "Jeśli to nie Ty zmieniałeś(aś) adres — zignoruj i zabezpiecz konto.",
      copyHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      footer: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
  },
  contactEmail: {
    greeting: "Witaj,",
    closing: "Pozdrawiamy,\nZespół Familiada",
    confirmationSubject: "Potwierdzenie zgłoszenia [{ticket}]",
    confirmationBody: "Dziękujemy za kontakt. Twoje zgłoszenie zostało przyjęte.\n\nNumer zgłoszenia: {ticket}\nTemat: {subject}",
    replySubject: "Re: [{ticket}] {subject}",
    replyQuoteLabel: "Twoje zgłoszenie [{ticket}]:",
    composeSubject: "Wiadomość od Familiada",
  },
  marketplaceSsr: {
    listTitle: "Familiada Marketplace",
    listDesc: "Przeglądaj i pobieraj darmowe gry Familiada stworzone przez społeczność.",
    back: "← Wróć do Marketplace",
    questions: "Pytania",
    topAnswers: "Najczęstsze odpowiedzi",
    by: "autor",
    originProducer: "Producent",
    originCommunity: "Społeczność",
    play: "Graj w tę grę",
  },
};

export default pl;
