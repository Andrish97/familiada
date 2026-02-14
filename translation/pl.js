const pl = {
  meta: {
    lang: "pl",
    label: "Polski",
    flag: "🇵🇱",
  },
  common: {
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
  },
  deviceGuard: {
    title: "Niedostępne na telefonie",
    message: "Ta strona działa tylko na komputerze.",
    back: "Wróć",
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
    passwordHintMin: "min. 8 znaków",
    passwordHintLower: "mała litera",
    passwordHintUpper: "duża litera",
    passwordHintNumber: "cyfra",
    passwordHintSpecial: "znak specjalny",
    passwordRules: "Hasło musi zawierać: {hints}.",
  },
  index: {
    title: "Familiada — logowanie",
    subtitle: "Panel tworzenia i prowadzenia gry",
    statusChecking: "Sprawdzam sesję…",
    statusLoggedOut: "Niezalogowany.",
    btnLogin: "Zaloguj",
    btnRegister: "Zarejestruj",
    btnToggleRegister: "Załóż konto",
    btnToggleLogin: "Mam konto",
    placeholderLogin: "E-mail lub nazwa użytkownika",
    placeholderEmail: "E-mail",
    placeholderPassword: "Hasło",
    placeholderPasswordRepeat: "Powtórz hasło",
    btnForgot: "Przypomnij hasło",
    setupTitle: "Pierwsze logowanie",
    setupPrompt: "Ustaw nazwę użytkownika",
    setupSub: "Będzie widoczna w panelu oraz przy zaproszeniach.",
    placeholderUsername: "Nazwa użytkownika",
    btnUsernameSave: "Zapisz nazwę",
    errMissingLogin: "Podaj e-mail/nazwę użytkownika i hasło.",
    errPendingEmailChange: "Zmieniałeś adres e-mail. Zaloguj się nowym adresem.",
    errInvalidEmail: "Podaj poprawny e-mail.",
    errPasswordMismatch: "Hasła nie są takie same.",
    statusRegistering: "Rejestruję…",
    statusCheckEmail: "Sprawdź e-mail (link aktywacyjny).",
    statusLoggingIn: "Loguję…",
    statusError: "Błąd.",
    errResetMissingLogin: "Podaj e-mail lub nazwę użytkownika do resetu.",
    statusResetSending: "Wysyłam link resetu…",
    statusResetSent: "Wysłano link resetu hasła.",
    statusSavingUsername: "Zapisuję nazwę…",
    errUsernameTaken: "Ta nazwa użytkownika jest już zajęta.",
    errNoSession: "Brak aktywnej sesji.",
    resetCooldown: "Ponowna wysyłka możliwa za {time}.",
    errResetCooldown: "Link już został wysłany. Spróbuj ponownie za {time}.",
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
  },
  account: {
    title: "Familiada — konto",
    pageTitle: "Familiada — ustawienia konta",
    backToGames: "← Moje gry",
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
    emailPostHint: "Zmiana e-maila wymaga potwierdzenia linków w skrzynkach. Do tego czasu możesz logować się dotychczasowym adresem.",
    emailNoAccessHint: "Nie masz dostępu do obecnego e-maila? Wyeksportuj ważne dane (gry, bazy, loga), usuń konto, załóż nowe na poprawnym adresie i zaimportuj z powrotem.",
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
    deletePlaceholder: "Hasło",
    deleteButton: "Usuń konto i dane",
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
    errNoPendingEmail: "Brak aktywnej zmiany e-maila.",
    cooldown: "Ponowna akcja możliwa za {time}.",
    errCooldown: "Zbyt szybko. Spróbuj ponownie za {time}.",
    errPasswordMismatch: "Hasła nie są takie same.",
    errDeletePasswordMissing: "Podaj hasło, aby potwierdzić.",
    errInvalidPassword: "Nieprawidłowe hasło.",
    errDeleteFailed: "Nie udało się usunąć konta.",
  },
  control: {
    title: "Familiada — Panel sterowania",
    statusLabel: "Status urządzeń",
    deviceDisplay: "Wyświetlacz",
    deviceHost: "Prowadzący",
    deviceBuzzer: "Przycisk",
    backToGames: "← Moje gry",
    logout: "Wyloguj",
    gameLabel: "Panel sterowania",
    alertOk: "OK",
    qrModalTitle: "Urządzenie",
    qrModalImgAlt: "Kod QR",
    qrModalLinkAria: "Link do urządzenia",
    colorTitle: "Kolor",
    colorPreviewAria: "Podgląd koloru",
    colorHexLabel: "HEX",
    colorHexFormat: "Format:",
    colorHint: "Zmiany wysyłamy pokazywane na bierząco.",
    tabDevices: "Urządzenia",
    tabSetup: "Pytania i ustawienia",
    tabSetupShort: "Ustawienia",
    tabRounds: "Rundy",
    tabFinal: "Finał",
    panelDevices: "Urządzenia",
    stepDisplay: "Wyświetlacz",
    lastSeen: "Ostatnio widziano:",
    blackScreen: "Czarny ekran",
    qrDisplayAlt: "QR do wyświetlacza",
    stepHostBuzzer: "Prowadzący i przycisk",
    qrOnDisplay: "QR na wyświetlaczu",
    qrHostAlt: "QR prowadzącego",
    hostLinkAria: "Link do prowadzącego",
    qrBuzzerAlt: "QR przycisku",
    buzzerLinkAria: "Link do przycisku",
    stepAudio: "Dźwięk",
    audioUnlockTitle: "Odblokuj dźwięk",
    audioUnlockHint: "Kliknij raz przycisk, żeby przeglądarka zezwoliła na odtwarzanie dźwięków.",
    audioUnlockBtn: "🔊 Odblokuj",
    audioBlocked: "ZABLOKOWANE",
    devicesFinish: "Gotowe — przejdź dalej",
    panelSetup: "Pytania i ustawienia",
    stepTeamNames: "Nazwy drużyn",
    teamHint: "Tutaj należy wprowadzić nazwy drużyn, można również wybrać kolory i zmienić dodatkowe ustawienia.",
    teamALabel: "Drużyna A",
    teamAColorAria: "Kolor drużyny A",
    teamBLabel: "Drużyna B",
    teamBColorAria: "Kolor drużyny B",
    teamADefault: "Drużyna A",
    teamBDefault: "Drużyna B",
    bgColorLabel: "Kolor tła wyświetlacza",
    bgColorAria: "Kolor tła wyświetlacza",
    bgColorHint: "Ten kolor dotyczy tylko wyświetlacza.",
    resetColors: "Reset kolorów",
    extraSettingsToggle: "Dodatkowe ustawienia",
    extraSettingsTitle: "Dodatkowe ustawienia",
    roundMultipliers: "Mnożniki rund",
    roundMultipliersHint:
      "Podaj po przecinku, np. 1,1,1,2,3 jesli rund bedzie więcej ostatnia liczba bedzie mnoźnikiem kolejnych",
    gameTarget: "Cel rozgrywki",
    finalTarget: "Cel finału",
    gameEndMode: "Zakończenie gry",
    showLogo: "Pokaż logo",
    showPoints: "Pokaż punkty",
    showMoney: "Pokaż kwotę (po finale)",
    advancedReset: "Przywróć domyślne",
    stepFinal: "Finał",
    playFinal: "Gramy finał?",
    finalQuestions: "Pytania",
    finalBadge: "Finał:",
    finalPoolHint: "Pytania do rozgrywki (pula).",
    finalListHint: "Pytania finału (max 5).",
    finalOnlyHint: "Pytania zatwierdzone. Kliknij „Edytuj”, aby zmienić.",
    refresh: "Odśwież",
    confirm: "Zatwierdź",
    edit: "Edytuj",
    panelRounds: "Rundy",
    roundsReadyTitle: "Gra gotowa",
    roundsReadyName: "Przygotowanie gry",
    roundsReadyHint: "Upewnij się, że Wyświetlacz, Prowadzący i Przycisk są podłączone. Potem uruchom ekran gry.",
    roundsReadyBtn: "Gra gotowa",
    roundsIntroTitle: "Intro gry",
    roundsIntroName: "Rozpocznij grę",
    roundsIntroHint:
      "Na wyświetlaczu pojawi się logo programu i zostanie otworzone intro. Po zakończeniu przejdziesz do pierwszej rundy.",
    roundsIntroBtn: "Rozpocznij grę",
    roundsStartTitle: "Rozpocznij rundę",
    roundsStartName: "Pusta plansza + pytanie",
    roundsStartHint: "Na wyświetlaczu pojawi się pusta plansza rundy, a prowadzący dostanie treść pytania.",
    roundsStartBtn: "Rozpocznij rundę",
    roundsDuelTitle: "Zatwierdź przycisk",
    roundsDuelName: "Pojedynek przyciskiem",
    roundsDuelHint:
      "Przycisk jest aktywny. Gdy któraś drużyna naciśnie — wybierz, czy zatwierdzasz, albo powtórz naciśniecie.",
    roundsBuzzAcceptA: "Zatwierdź drużynę A",
    roundsBuzzAcceptB: "Zatwierdź drużynę B",
    roundsBuzzRetry: "Ponów naciśnięcie",
    roundsPlayTitle: "Runda",
    roundsPlayName: "Rozgrywka",
    roundsPlayHint:
      "Wciskaj odpowiedź jesli poprawna, lub X (pudło), można również uruchonić odicznie 3s (czas=X). Po zakończeniu pojedynku, można oddać pytanie przeciwnej drużynie. We właściwej rozgrywce po trzech X uruchomi się kradzież (szansa przeciwnej drużyny).",
    roundsPassQuestion: "Oddaj pytanie",
    roundsAnswers: "Odpowiedzi",
    roundsAddX: "X (pudło)",
    roundsStartTimer3: "Rozpocznij odliczanie 3s",
    roundsEndRound: "Zakończ rundę",
    roundsGameEndTitle: "Koniec gry",
    roundsGameEndName: "Zakończ grę",
    roundsGameEndHint:
      "To była ostatnia runda. Na wyświetlaczu pokażemy logo programu albo punkty zwycięskiej drużyny (jeśli są włączone).",
    roundsGameEndBtn: "Zakończ grę",
    panelFinal: "Finał",
    finalStartTitle: "Start finału",
    finalStartName: "Rozpocznij finał",
    finalStartHint:
      "Dźwięk finału, schowanie starej planszy, wjazd planszy finału. Prowadzący dostaje pytania.",
    finalStartBtn: "Rozpocznij finał",
    finalP1EntryTitle: "Runda 1 — wpisywanie",
    finalP1EntryName: "Odpowiedzi gracza 1 (15s)",
    finalP1EntryHint:
      "Operator wpisuje odpowiedzi gracza. Możesz użyć Enter, żeby przejść do następnego pytania, lub strzałki góra/dół, żeby szybko przelączać się między pytaniami. Odliczanie rusza po wciśnięciu przycisku. Timer mozna uruchomić przyciskiem lub skrótem Shift + Ctrl (Cmd na Macu), można też zatrzymać jesli wszytko zostało wpisane, przyciskiem lub tym samym skrótem.",
    finalStartTimer15: "Rozpocznij odliczanie (15s)",
    finalP1MapQ1Title: "Runda 1 — mapowanie (P1)",
    finalP1MapQ2Title: "Runda 1 — mapowanie (P2)",
    finalP1MapQ3Title: "Runda 1 — mapowanie (P3)",
    finalP1MapQ4Title: "Runda 1 — mapowanie (P4)",
    finalP1MapQ5Title: "Runda 1 — mapowanie (P5)",
    finalMapHint:
      "Wybierz odpowiedź z listy, jesli pasuje, jesli nie to odpowiedź gracza za 0 pkt. Jeśli nic nie było wpisane to brak odpowiedzi. Możesz odsłonić odpowiedź i punkty.",
    finalP2StartTitle: "Runda 2 — start",
    finalP2StartName: "Rozpocznij 2 rundę",
    finalP2StartHint:
      "Dźwięk rundy, odpowiedzi gracza 1 zostaną ukryte, tutaj możesz odtworzyć dzwięk powtórzenia.",
    finalP2StartBtn: "Rozpocznij 2 rundę",
    finalRepeatSound: "Dźwiek powtórzenia",
    finalP2EntryTitle: "Runda 2 — wpisywanie",
    finalP2EntryName: "Odpowiedzi gracza 2 (20s)",
    finalP2EntryHint:
      "Operator wpisuje odpowiedzi gracza. Możesz użyć Enter, żeby przejść do następnego pytania, lub strzałki góra/dół, żeby szybko przelączać się między pytaniami. Enter + Shift zaznacza powtórzenie. Odliczanie rusza po wciśnięciu przycisku. Możesz widzieć odpowiedź gracza 1. Powtórzenie to tylko dźwięk + status dla prowadzącego. Timer mozna uruchomić przyciskiem lub skrótem Shift + Ctrl (Cmd na Macu), można też zatrzymać jesli wszytko zostało wpisane, przyciskiem lub tym samym skrótem.",
    finalStartTimer20: "Rozpocznij odliczanie (20s)",
    finalP2MapQ1Title: "Runda 2 — mapowanie (P1)",
    finalP2MapQ2Title: "Runda 2 — mapowanie (P2)",
    finalP2MapQ3Title: "Runda 2 — mapowanie (P3)",
    finalP2MapQ4Title: "Runda 2 — mapowanie (P4)",
    finalP2MapQ5Title: "Runda 2 — mapowanie (P5)",
    finalEndTitle: "Zakończ finał",
    finalEndName: "Koniec",
    finalEndHint:
      "To konic finału. Na wyświetlaczu pokażemy logo programu, punkty zwycięskiej drużyny lub kwotę wygranej (w zależności co wybrałeś w ustawiniach).",
    finalEndBtn: "Zakończ finał",
    roundsMsg: {
      gameReady: "Gra gotowa. Ekran oczekuje na start.",
      introAlready: "Intro gry zostało już odtworzone.",
      introRunning: "Intro uruchomione.",
      introDone: "Intro zakończone. Możesz rozpocząć rundę.",
      noMoreQuestions: "Brak dostępnych pytań dla kolejnych rund (wszystkie zużyte).",
      duelWait: "Czekam na przycisk.",
      duelRetry: "Powtórzenie naciśnięcia.",
      duelFirstClick: "Pierwsza: drużyna {team}. Zatwierdź albo powtórz.",
      duelFirstAnswer: "Pojedynek – pierwsza odpowiada: drużyna {team}.",
      duelNextTeam: "Teraz odpowiada drużyna {team}.",
      duelReset: "Obie odpowiedzi pudło – nowy cykl. Zaczyna drużyna {team}.",
      duelResultWin: "Pojedynek wygrywa drużyna {team}.",
      playControl: "Gra drużyna {team}.",
      playNoControl: "Brak drużyny grającej.",
      playPassOnlyDuring: "Pytanie można oddać tylko podczas rozgrywki.",
      playNoMorePass: "Nie możesz już oddać pytania w tej rundzie.",
      playPassed: "Pytanie oddane. Teraz gra drużyna {team}.",
      stealNoControl: "Nie mogę uruchomić kradzieży – brak drużyny grającej.",
      stealPrompt: "Kradzież: odpowiada drużyna {team}. Kliknij odpowiedź lub „X (pudło)”.",
      stealChance: "Szansa na kradzież. Odpowiada drużyna {team}.",
      stealSuccess: "Kradzież udana – bank przechodzi do drużyny kradnącej.",
      stealFail: "Kradzież nietrafiona – bank zostaje przy drużynie grającej.",
      revealNone: "Brak odpowiedzi do odsłonięcia.",
      revealInfo:
        "Klikaj brakujące odpowiedzi, żeby pokazać je na wyświetlaczu (bez zmiany punktów).",
      revealDone: "Wszystkie odpowiedzi odsłonięte. Koniec rundy.",
      roundNoControlBank: "Brak drużyny grającej – nie mogę przyznać banku.",
      roundBank: "Koniec rundy. {bank} pkt dla drużyny {team}.",
      roundBankMult:
        "Koniec rundy. {bank} pkt dla drużyny {team} (x{mult} = {awarded} pkt).",
      roundToFinal: "Rundy zakończone. Przechodzimy do finału.",
      roundNext: "Runda zakończona. Możesz rozpocząć kolejną rundę.",
      roundLast: "To była ostatnia runda. Przejdź do zakończenia gry.",
      timerTimeoutX: "Czas minął – pudło.",
      gameEndDraw: "Koniec gry. Remis {a}:{b}.",
      gameEndWin: "Koniec gry. Wygrywa drużyna {team} z wynikiem {pts} pkt.",
      roundStartSfx: "Startuję rundę – leci dźwięk przejścia.",
    },
    roundsHost: {
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
      p2RepeatOn: "Powtórzenie ✓",
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
    },
    noId: "Brak ?id w URL.",
    gameNotReady: "Ta gra nie jest gotowa ponieważ: {reason}",
    dataMismatch: "Rozjazd danych gry (validate vs games).",
    qrCopyOk: "Skopiowano link do urządzenia.",
    qrCopyFail: "Nie udało się skopiować linku.",
    unloadWarn: "Jeśli teraz opuścisz tę stronę, bieżący stan gry zostanie utracony.",
    confirmBack: "Powrót do listy gier spowoduje utratę bieżącego stanu gry. Kontynuować?",
    audioOk: "Dźwięk odblokowany.",
    audioFail: "Nie udało się odblokować dźwięku.",
    finalConfirmed: "Zatwierdzono.",
    finalReloadStart: "Odświeżanie listy pytań...",
    finalReloadDone: "Lista pytań odświeżona.",
    advSaved: "Zapisano dodatkowe ustawienia.",
    advReset: "Przywrócono domyślne ustawienia.",
    deviceStatusOk: "POŁĄCZONO",
    deviceStatusOffline: "ROZŁĄCZONO",
    deviceStatusNone: "—",
    deviceSeenNone: "brak",
    deviceSeenSeconds: "{seconds}s temu",
    deviceDropped: "Uwaga: {label} rozłączony. Sprawdź połączenie z internetem na urządzeniu.",
    presenceNoTable: "Brak tabeli device_presence.",
    audioStatusOk: "OK",
    controlPrefix: "Panel sterowania — ",
    controlTitle: "Panel sterowania",
    qrHide: "Schowaj QR",
    dash: "—",
    answerFallback: "—",
    copyOk: "Skopiowano.",
    copyFail: "Nie mogę skopiować.",
  },
  demo: {
    baseUrl: "/demo/pl",
    files: {
      base: "base.json",
      logoText: "logo_text.json",
      logoTextPix: "logo_text-pix.json",
      logoDraw: "logo_draw.json",
      logoImage: "logo_image.json",
      pollTextOpen: "poll_text_open.json",
      pollTextClosed: "poll_text_closed.json",
      pollPointsOpen: "poll_points_open.json",
      pollPointsClosed: "poll_points_closed.json",
      prepared: "prepared.json",
      pollPointsDraft: "poll_points_draft.json",
      pollTextDraft: "poll_text_draft.json",
    },
    modalTitle: "PRZYWRACANIE DEMO…",
    modalSub: "Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.",
    fetchFailed: "DEMO: nie udało się pobrać {url} (HTTP {status})",
    noUser: "DEMO: brak zalogowanego użytkownika.",
    stepImportBase: "Import bazy pytań",
    stepImportLogos: "Import log 4/4 (jedna operacja)",
    stepImportPoll1: "Import sondażu 1/4 (poll_text_open)",
    stepImportPoll2: "Import sondażu 2/4 (poll_text_closed)",
    stepImportPoll3: "Import sondażu 3/4 (poll_points_open)",
    stepImportPoll4: "Import sondażu 4/4 (poll_points_closed)",
    stepImportDraft1: "Import szkicu 1/3 (prepared)",
    stepImportDraft2: "Import szkicu 2/3 (poll_points_draft)",
    stepImportDraft3: "Import szkicu 3/3 (poll_text_draft)",
    progressStart: "Start…",
    progressOk: "OK",
    progressDone: "Gotowe ✅",
    progressDoneMsg: "Demo zostało przywrócone. Możesz korzystać normalnie.",
    progressError: "Błąd ❌",
    progressErrorMsg: "Błąd: {error}",
  },
  display: {
    title: "Wyświetlacz jak w klasycznej „Familiada”",
    qrHost: "Prowadzący",
    qrBuzzer: "Przyciski",
    qrHostAlt: "QR Prowadzący",
    qrBuzzerAlt: "QR Przyciski",
    sumLabel: "SUMA",
  },
  host: {
    title: "Familiada — prowadzący",
    swipeRevealDown: "Przesuń w dół, żeby odsłonić",
    swipeCoverUp: "Przesuń w górę, żeby zasłonić",
    swipeRevealRight: "Przesuń w prawo, żeby odsłonić",
    swipeCoverLeft: "Przesuń w lewo, żeby zasłonić",
  },
  buzzer: {
    title: "Familiada — przycisk",
    btnA: "Przycisk A",
    btnB: "Przycisk B",
  },
  bases: {
    title: "Familiada — bazy pytań",
    backToGames: "← Moje gry",
    logout: "Wyloguj",
    headerTitle: "Twoje bazy pytań",
    headerHint: "Kliknij kafelek, żeby go zaznaczyć.",
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
      subtitle:
        "Dodajesz użytkowników po nazwie lub e-mailu. Jeśli się nie uda, pokażemy „Nie udało się”.",
      placeholder: "Nazwa użytkownika lub e-mail...",
      roleEditor: "Edycja",
      roleViewer: "Przeglądanie",
      add: "Dodaj",
      close: "Zamknij",
      cooldown: "Nie można dodać ponownie tego użytkownika przez 24h (anty-spam).",
      alreadyPending: "Zaproszenie już oczekuje na akceptację.",
      emailFailed: "Zaproszenie utworzone, ale nie udało się wysłać maila.",
      sectionSubscribers: "Moi subskrybenci",
      sectionSubscribersSub: "Tylko zarejestrowani użytkownicy (z username).",
      sectionPending: "Oczekujące",
      sectionPendingSub: "Po 5 dniach bez akceptacji zapytanie znika.",
      sectionShared: "Udostępnione",
      sectionSharedSub: "Zaakceptowane – usuń przez ✕.",
      emptySubscribers: "Brak zarejestrowanych subskrybentów.",
      emptyPending: "Brak oczekujących zapytań.",
      emptyShared: "Brak udostępnień.",
      cancelPending: "Anuluj zapytanie",
      subStateReady: "Dodaj",
      subStatePending: "Oczekuje",
      subStateShared: "Udostępnione",
      subStateCooldown: ({ left }) => `Za ${left}`,
    },
    delete: {
      title: "Usuń bazę",
      text: "Na pewno usunąć „{name}”? Tego nie da się cofnąć.",
      ok: "Usuń",
      cancel: "Anuluj",
      failed: "Nie udało się usunąć.",
    },
    export: {
      steps: {
        start: "Eksport: start…",
        base: "Eksport: baza…",
        folders: "Eksport: foldery…",
        questions: "Eksport: pytania…",
        questionTags: "Eksport: tagi pytań…",
        download: "Pobieranie…",
      },
      count: "Liczba: {count}",
      errorStep: "Błąd ❌",
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
      errorStep: "Błąd ❌",
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
      emailFailed: "Zaproszenie utworzone, ale nie udało się wysłać maila.",
    },
    badges: {
      from: "Od: {name}",
      editAccess: "Masz dostęp z edycją",
      viewAccess: "Masz dostęp tylko do odczytu",
      sharedOthers: "Udostępnione innym ({count})",
      notShared: "Nieudostępnione",
      proposed: "🟡 Proponowana",
      proposedTitle: "Udostępnienie oczekuje na Twoją decyzję",
    },
    proposed: {
      accept: "Przyjmij",
      decline: "Odrzuć",
      failed: "Nie udało się wykonać akcji.",
      mismatch: "To udostępnienie dotyczy innego użytkownika. Sprawdź, czy jesteś zalogowany na konto powiązane z mailem, na który przyszła wiadomość.",
      cancelled: "Zaproszenie zostało cofnięte."
    },
    sections: {
      mine: "Moje bazy",
      newBase: "Nowa baza",
      shared: "Udostępnione",
      sharedEmpty: "Brak udostępnionych baz.",
    },
    mail: {
      noSession: "Brak sesji do wysyłki maila.",
      failed: "Nie udało się wysłać maila.",
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
    title: "Familiada — sondaż",
    backToGames: "← Moje gry",
    backToHub: "← Centrum sondaży",
    logout: "Wyloguj",
    pageTitle: "Sondaż",
    linkPlaceholder: "Link pojawi się po uruchomieniu...",
    qrFailed: "QR nie działa.",
    missingId: "Brak parametru id.",
    defaultName: "Sondaż",
    actions: {
      copyLink: "Kopiuj link",
      copyShort: "Kopiuj",
      openLink: "Otwórz link",
      openShort: "Otwórz",
      qrOnDisplay: "QR na wyświetlaczu",
      refresh: "⟳ Odśwież wyniki",
      cancel: "Anuluj",
      closeAndNormalize: "Zamknij i przelicz",
      noPoll: "Brak sondażu",
      openPoll: "Uruchomić sondaż",
      openReady: "Gotowe do uruchomienia.",
      closePoll: "Zamknąć sondaż",
      closeReady: "Możesz zamknąć sondaż.",
      reopenPoll: "Uruchomić ponownie",
      reopenHint: "Otworzy nową sesję i usunie poprzednie dane sondażowe.",
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
      meta: "Otwórz stronę z parametrem <b>polls.html?id=...</b>.",
    },
    meta: {
      pollText:
        "Tryb: typowy sondaż (tekst). Start: ≥ {min} pytań. Zamknięcie: w każdym pytaniu ≥ 3 różne odpowiedzi.",
      pollPoints:
        "Tryb: punktacja. Start: ≥ {min} pytań i każde pytanie ma {minAns}–{maxAns} odpowiedzi. Zamknięcie: w każdym pytaniu co najmniej 3 odpowiedzi muszą mieć ≥ 3 pkt po przeliczeniu do 100.",
      prepared: "Gra preparowana nie ma sondażu.",
    },
    validation: {
      openOnlyDraft: "Sondaż można uruchomić tylko ze stanu SZKIC.",
      noGame: "Brak gry.",
      preparedNoPoll: "Gra preparowana nie ma sondażu.",
      minQuestions: "Żeby uruchomić: liczba pytań musi być ≥ {min} (masz {count}).",
      pointsRange: "W trybie PUNKTACJA każde pytanie musi mieć {min}–{max} odpowiedzi.",
      reopenOnlyClosed: "Ponowne uruchomienie możliwe tylko gdy sondaż jest ZAMKNIĘTY.",
      closeOnlyOpen: "Sondaż można zamknąć tylko gdy jest OTWARTY.",
      noActiveSession: "Brak aktywnej sesji głosowania.",
      noActiveSessionGeneric: "Brak aktywnej sesji.",
      closeMinPoints:
        "Aby zamknąć: w każdym pytaniu co najmniej 3 odpowiedzi muszą mieć ≥ 3 punkty po przeliczeniu.",
      closeMinTextAnswers: "Aby zamknąć: w każdym pytaniu muszą być ≥ 3 różne odpowiedzi.",
      unknownType: "Nieznany typ gry.",
    },
    copy: {
      success: "Skopiowano link sondażu.",
      failed: "Nie udało się skopiować.",
    },
    modals: {
      open: {
        title: "Uruchomić sondaż?",
        text: "Uruchomić sondaż dla „{name}”?",
        ok: "Uruchom",
        cancel: "Anuluj",
      },
      closePoints: {
        title: "Zakończyć sondaż?",
        text: "Zamknąć sondaż i przeliczyć punkty do 100?",
        ok: "Zakończ",
        cancel: "Anuluj",
      },
      reopen: {
        title: "Uruchomić ponownie?",
        text: "Otworzyć sondaż ponownie? Poprzednie dane zostaną usunięte.",
        ok: "Otwórz ponownie",
        cancel: "Anuluj",
      },
      closeText: {
        title: "Zamknąć sondaż?",
        text: "Zamknąć sondaż, wybrać TOP 6 i zapisać punkty do 100 dla każdego pytania?",
        ok: "Zamknij",
        cancel: "Anuluj",
      },
    },
    status: {
      opened: "Sondaż uruchomiony.",
      closedPoints: "Sondaż zamknięty. Gra gotowa (unikatowe punkty).",
      reopened: "Sondaż uruchomiony ponownie.",
      closed: "Sondaż zamknięty. Gra gotowa.",
    },
    errors: {
      open: "Nie udało się uruchomić sondażu.",
      close: "Nie udało się zamknąć sondażu.",
      reopen: "Nie udało się otworzyć ponownie.",
      loadAnswers: "Nie udało się wczytać odpowiedzi.",
    },
    textClose: {
      title: "Zamykanie — edycja odpowiedzi",
      loading: "Ładuję odpowiedzi z ostatniej sesji…",
      instructions:
        "Przeciągnij odpowiedź na inną, aby je połączyć (sumuje ilość). Możesz usuwać. Na końcu bierzemy TOP 6 i normalizujemy do 100.",
      hint: "Przeciągnij, żeby połączyć • edytuj literówki • final max 17 znaków",
      mergeTitle: "Scal identyczne",
      mergeLabel: "Scal identyczne",
      remove: "Usuń",
      editHint: "Edytuj odpowiedzi, a potem kliknij „Zamknij i przelicz”.",
      cancelled: "Anulowano zamykanie (sondaż dalej otwarty).",
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
    legal: "Polityka prywatności 🔐",
    backToGames: "← Moje gry",
    logout: "Wyloguj",
    pageTitle: "Wskazówki dla użytkownika",
    tabs: {
      general: "Ogólny opis",
      edit: "Dodawanie i edycja gry",
      bases: "Bazy pytań",
      polls: "Sondaże",
      subscriptions: "Subskrypcje",
      logo: "Tworzenie logo",
      control: "Panel sterowania",
      demo: "Demo - materiały startowe",
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
        zebrać wyniki (sondaż) i bez problemu poprowadzić rozgrywkę na żywo
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
        Pytania, odpowiedzi i sondaże przygotowuje się wcześniej,
        natomiast w trakcie gry operator korzysta wyłącznie
        z panelu sterowania.
      </p>

      <p class="m-p">
        W praktyce oznacza to, że w dniu nagrania
        operator nie musi edytować danych,
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
        Wskarówki zostały podzielone na kolejne zakładki.
        Każda z nich opisuje inny etap pracy z systemem:
        od przygotowania gry,
        przez sondaże,
        aż po prowadzenie rozgrywki na żywo.
      </p>`,
      edit: `<p class="m-p">
        Zakładka „Dodawanie i edycja gry” opisuje etap przygotowania gry
        przed rozpoczęciem sondażu lub rozgrywki.
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
          <span class="m-strong">Typowy sondaż</span> —
          odpowiedzi są wpisywane przez ankietowanych,
          a punkty wynikają z liczby wskazań.
        </li>
        <li>
          <span class="m-strong">Punktacja odpowiedzi</span> —
          ankietowani wybierają spośród przygotowanych odpowiedzi,
          a system zlicza głosy.
        </li>
        <li>
          <span class="m-strong">Preparowany</span> —
          odpowiedzi i punkty są ustalane ręcznie,
          bez udziału sondażu.
        </li>
      </ul>
    
      <p class="m-p">
        Nową grę tworzysz klikając kafelek z symbolem „＋”.
        Po utworzeniu gra pojawia się na liście
        i może zostać otwarta w edytorze.
      </p>
    
      <h3 class="m-h2">Edytor gry – co i kiedy można edytować</h3>
    
     <p class="m-p">
        Do trybu edycji gry przechodzisz z listy „Moje gry”
        za pomocą przycisku <span class="m-code">Edytuj</span>.
        Jest to pierwszy etap pracy z grą,
        w którym przygotowujesz całą jej treść
        przed wykorzystaniem jej w sondażu lub rozgrywce.
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
        w których rozgrywka lub sondaż
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
        Zmiana pytania po uruchomieniu sondażu
        może zostać zablokowana,
        ponieważ nawet drobna modyfikacja treści
        wpływa na sens zebranych odpowiedzi.
      </p>
    
      <h3 class="m-h3">Dodawanie i edycja odpowiedzi</h3>
    
      <p class="m-p">
        Możliwość edycji odpowiedzi zależy od typu gry.
        W grach sondażowych odpowiedzi są efektem ankiety,
        dlatego przed sondażem możesz jedynie przygotować
        ich ogólną strukturę lub przykłady.
      </p>
    
      <p class="m-p">
        Po rozpoczęciu sondażu system może ograniczyć
        dodawanie lub usuwanie odpowiedzi,
        aby nie mieszać odpowiedzi ankietowanych
        z nową treścią.
      </p>
    
      <h3 class="m-h3">Punkty – dlaczego czasem są zablokowane</h3>
    
      <p class="m-p">
        Punkty nie zawsze są edytowalne ręcznie.
        W grach sondażowych punkty wynikają bezpośrednio
        z liczby udzielonych odpowiedzi,
        dlatego ich ręczna edycja nie ma sensu
        i jest zablokowana.
      </p>
    
      <p class="m-p">
        Ręczne ustawianie punktów jest możliwe
        tylko w trybie preparowanym,
        gdzie system nie korzysta z danych ankietowych.
      </p>
    
      <div class="m-note">
        <b>Dlaczego tak jest?</b><br/>
        Dzięki temu to, co widzi widz na tablicy,
        zawsze odpowiada rzeczywistym wynikom sondażu
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
        Builder umożliwia eksport i import gier
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

      <p class="m-note">
        Eksportować możesz tylko do swojej własnej bazy lub do udostępnionej bazy której jesteś edytorem.
        Jeśli nie posiadasz aktualnie żadnych baz, nie będziesz mógł eksportować.
      </p>
      
      <p class="m-p">
        Dzięki temu każda gra może zostać zamieniona w zestaw pytań do dalszej edycji,
        organizowania w folderach, oznaczania tagami oraz ponownego wykorzystania
        w kolejnych grach.
      </p>
      
      <p class="m-note">
        Eksport do bazy nie usuwa gry — tworzy jedynie jej kopię w postaci struktury pytań.
      </p>`,
      bases: `<h2 class="m-h2">Bazy pytań — organizacja i współpraca</h2>
  
      <p class="m-p">
        Bazy pytań to centralne miejsce przechowywania wszystkich pytań używanych w grach.
        Dzięki nim możesz porządkować pytania w folderach, oznaczać je tagami, przypisywać do kategorii
        oraz współdzielić całe bazy z innymi użytkownikami.
      </p>
      <p class="m-p">
        Do baz pytań przechodzisz z górnego paska strony „Moje gry”
        za pomocą przycisku <span class="m-code">Bazy pytań 🗃️</span>.
      </p>
  
      <p class="m-p">
        Jedna baza może zawierać setki lub tysiące pytań uporządkowanych w strukturze podobnej
        do klasycznego menadżera plików na komputerze.
      </p>
  
      <h3 class="m-h3">➕ Dodawanie nowej bazy</h3>
  
      <p class="m-p">
        W widoku „Bazy pytań” kliknij kafelek <span class="m-strong">Nowa baza</span>.
        Otworzy się okno, w którym podajesz nazwę bazy.
      </p>
  
      <p class="m-p">
        Po zapisaniu nowa baza pojawi się na liście i od razu możesz ją przeglądać lub udostępniać.
      </p>
  
      <h3 class="m-h3">🤝 Udostępnianie bazy</h3>
  
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
  
      <h3 class="m-h3">📂 Przechodzenie do menadżera bazy</h3>
  
      <p class="m-p">
        Aby wejść do zawartości bazy, zaznacz ją na liście i kliknij przycisk <span class="m-code">Przeglądaj</span>.
      </p>
  
      <p class="m-p">
        Otworzy się Base Explorer — zaawansowany menadżer pytań działający jak klasyczny eksplorator plików.
      </p>
  
      <h2 class="m-h2">Base Explorer — menadżer pytań</h2>
  
      <p class="m-p">
        Base Explorer pozwala zarządzać pytaniami w sposób znany z systemowych menadżerów plików:
        foldery, przenoszenie metodą „przeciągnij i upuść”, kopiowanie, wycinanie i szybka selekcja.
      </p>
  
      <p class="m-p">
        Każdy „plik” w tym menadżerze jest pojedynczym pytaniem.
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
        Interfejs i skróty klawiszowe działają podobnie jak w klasycznych menadżerach plików
        (Explorer, Finder, Total Commander).
      </p>
  
      <h2 class="m-h2">Tagi i kategorie</h2>
  
      <h3 class="m-h3">🏷️ Tagi</h3>
  
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
  
      <h3 class="m-h3">📌 Kategorie</h3>
  
      <p class="m-p">
        Kategorie to specjalne oznaczenia systemowe określające,
        do jakiego typu gry dane pytanie pasuje. Co odpowiada typom gier w widoku <span class="m-strong">Moje gry</span></li>
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
        W Menadżerze bazy możesz zaznaczyć dowolne pytania oraz foldery (wraz z podfolderami),
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
        Po pomyślnym utworzeniu gry zostaniesz przekierowany do widoku <span class="m-strong">Moje gry</span></li>
      </p>
  
      <h2 class="m-h2">⌨️ Skróty klawiszowe — Menadżer bazy</h2>
  
      <h3 class="m-h3">📁 Tworzenie</h3>
  
      <table class="m-table">
        <tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Nowe pytanie</td><td>Ctrl + N</td><td>⌘ N</td></tr>
        <tr><td>Nowy folder</td><td>Ctrl + Shift + N</td><td>⌘ ⇧ N</td></tr>
      </table>
  
      <h3 class="m-h3">✏️ Edycja</h3>
  
      <table class="m-table">
        <tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Edytuj pytanie</td><td>Ctrl + E</td><td>⌘ E</td></tr>
        <tr><td>Zmień nazwę</td><td>F2</td><td>F2</td></tr>
        <tr><td>Usuń</td><td>Delete</td><td>Fn + ⌫</td></tr>
      </table>
  
      <h3 class="m-h3">📋 Schowek</h3>
  
      <table class="m-table">
        <tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Kopiuj</td><td>Ctrl + C</td><td>⌘ C</td></tr>
        <tr><td>Wytnij</td><td>Ctrl + X</td><td>⌘ X</td></tr>
        <tr><td>Wklej</td><td>Ctrl + V</td><td>⌘ V</td></tr>
        <tr><td>Duplikuj</td><td>Ctrl + D</td><td>⌘ D</td></tr>
      </table>
  
      <h3 class="m-h3">🎮 Gra</h3>
  
      <table class="m-table">
        <tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Utwórz grę</td><td>Ctrl + G</td><td>⌘ G</td></tr>
      </table>
  
      <h3 class="m-h3">🔄 Widok</h3>
  
      <table class="m-table">
        <tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Odśwież widok</td><td>Ctrl + Alt + R</td><td>⌘ ⌥ R</td></tr>
      </table>
  
      <h3 class="m-h3">📌 Nawigacja</h3>
  
      <table class="m-table">
        <tr><th>Akcja</th><th>Windows / Linux</th><th>macOS</th></tr>
        <tr><td>Zaznacz wszystko</td><td>Ctrl + A</td><td>⌘ A</td></tr>
        <tr><td>Otwórz folder</td><td>Enter</td><td>⏎</td></tr>
        <tr><td>Folder nadrzędny</td><td>Backspace</td><td>⌫</td></tr>
      </table>
  
      <p class="m-note">
        Skróty nie działają podczas wpisywania tekstu w polach edycyjnych.
      </p>`,
      polls: `<p class="m-p">
        Zakładka „Sondaże” opisuje etap zbierania odpowiedzi
        od ankietowanych przed właściwą rozgrywką.
        Sondaż jest mostem pomiędzy przygotowaniem gry
        a jej rozegraniem na żywo.
      </p>
    
      <p class="m-p">
        Na tym etapie system przestaje być edytorem treści,
        a zaczyna działać jak narzędzie do zbierania danych.
        Z tego powodu wiele opcji edycji jest celowo ograniczonych.
      </p>

      <p class="m-p">
        Strona „Sondaże” jest teraz osobna od strony „Subskrypcje”.
        Do sondaży przechodzisz z górnego paska na stronie „Moje gry”
        przyciskiem <span class="m-code">Sondaże 📊</span>.
      </p>

      <h3 class="m-h2">Strona sondaży</h3>

      <p class="m-p">
        Na komputerze widzisz dwa obszary:
      </p>

      <ul class="m-ul">
        <li><span class="m-strong">Moje sondaże</span> — lista sondaży, które tworzysz i prowadzisz.</li>
        <li><span class="m-strong">Zadania</span> — zaproszenia do głosowania od innych użytkowników.</li>
      </ul>

      <p class="m-p">
        Złota kropka przy przycisku „Sondaże 📊” pokazuje liczbę aktywnych zadań do wykonania.
      </p>

      <p class="m-p">
        Udostępnianie sondażu odbywa się z listy „Moje sondaże”: zaznacz kafelek i kliknij
        <span class="m-code">Udostępnij</span>, następnie wybierz odbiorców i zapisz.
        Kafelek sondażu pokazuje bieżące głosy, a przycisk <span class="m-code">Szczegóły</span>
        daje podgląd listy oddanych głosów, oczekujących, odrzuconych oraz anonimowych odpowiedzi.
      </p>

      <h3 class="m-h3">Moje sondaże</h3>
      <p class="m-p">
        Każdy kafelek ma kolor, który oznacza stan sondażu:
      </p>
      <ul class="m-ul">
        <li><span class="m-strong">Szary</span> — szkic, brakuje wymagań do uruchomienia.</li>
        <li><span class="m-strong">Czerwony</span> — szkic gotowy do uruchomienia.</li>
        <li><span class="m-strong">Pomarańczowy</span> — sondaż otwarty, brak głosów.</li>
        <li><span class="m-strong">Żółty</span> — sondaż otwarty, są głosy lub aktywne zadania.</li>
        <li><span class="m-strong">Zielony</span> — sondaż otwarty, cele zebrane (zadania wykonane lub ≥10 głosów).</li>
        <li><span class="m-strong">Niebieski</span> — sondaż zamknięty.</li>
      </ul>

      <h3 class="m-h3">Zadania</h3>
      <p class="m-p">
        Zadania to zaproszenia do głosowania. Kolory:
        <span class="m-strong">zielony</span> — dostępne,
        <span class="m-strong">niebieski</span> — wykonane.
        Dwuklik otwiera głosowanie, a przycisk <span class="m-code">X</span> odrzuca zadanie.
      </p>

      <h3 class="m-h2">Rodzaje sondaży</h3>
    
      <p class="m-p">
        W zależności od typu gry sondaż może działać w jednym z dwóch trybów:
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Typowy sondaż (tekstowy)</span> —
          ankietowani wpisują własne odpowiedzi tekstowe.
        </li>
        <li>
          <span class="m-strong">Sondaż punktacji</span> —
          ankietowani wybierają jedną z przygotowanych odpowiedzi.
        </li>
      </ul>
    
      <p class="m-p">
        Gry preparowane nie posiadają sondażu —
        odpowiedzi i punkty są w nich ustalane ręcznie.
      </p>
    
      <h3 class="m-h2">Uruchamianie sondażu</h3>
    
      <p class="m-p">
        Sondaż można uruchomić wyłącznie dla gry
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
        Dzięki temu nie da się uruchomić sondażu,
        który nie może zostać później poprawnie zamknięty
        i użyty w rozgrywce.
      </div>
    
      <h3 class="m-h2">Link i kod QR</h3>
    
      <p class="m-p">
        Po uruchomieniu sondażu system generuje
        unikalny link do głosowania.
        Link ten można skopiować,
        otworzyć w nowej karcie
        lub wyświetlić jako kod QR.
      </p>
    
      <p class="m-p">
        Kod QR jest przeznaczony do wyświetlania
        na ekranie widocznym dla ankietowanych
        (telewizor, rzutnik, duży monitor).
      </p>
    
      <h3 class="m-h2">Przebieg sondażu</h3>
    
      <p class="m-p">
        Ankietowani przechodzą przez pytania po kolei.
        System pilnuje kolejności
        i nie pozwala pominąć pytania.
      </p>
    
      <p class="m-p">
        W sondażu tekstowym każda odpowiedź:
      </p>
    
      <ul class="m-ul">
        <li>jest ograniczona do 17 znaków,</li>
        <li>jest normalizowana (wielkość liter, spacje),</li>
        <li>zliczana jest jako osobna propozycja.</li>
      </ul>
    
      <p class="m-p">
        W sondażu punktacji ankietowany
        wybiera jedną z przygotowanych odpowiedzi,
        a system zapisuje oddany głos.
      </p>
    
      <h3 class="m-h2">Zamykanie sondażu</h3>
    
      <p class="m-p">
        Zamknięcie sondażu jest osobnym,
        świadomym etapem pracy.
        System nie pozwala zamknąć sondażu,
        jeśli zebrane dane nie spełniają
        minimalnych warunków jakości.
      </p>
    
      <h3 class="m-h3">Sondaż punktacji</h3>
    
      <p class="m-p">
        Przy zamykaniu sondażu punktacji
        system przelicza głosy na punkty
        i normalizuje je do skali 0–100
        dla każdego pytania.
      </p>
    
      <div class="m-note">
        <b>Efekt:</b>
        otrzymujesz gotową listę odpowiedzi z punktami,
        bez potrzeby ręcznego liczenia.
      </div>
    
      <h3 class="m-h3">Sondaż tekstowy</h3>
    
      <p class="m-p">
        W sondażu tekstowym (klasycznym) ankietowani wpisują własne odpowiedzi.
        Po zamknięciu sondażu system przechodzi do etapu porządkowania wyników.
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
        po zamknięciu sondażu
        nie można już zmieniać jego wyników
        bez ponownego uruchomienia sondażu.
      </div>
    
      <h3 class="m-h2">Ponowne uruchomienie sondażu</h3>
    
      <p class="m-p">
        Zamknięty sondaż można uruchomić ponownie,
        co powoduje usunięcie poprzednich wyników
        i rozpoczęcie zbierania odpowiedzi od nowa.
      </p>
    
      <p class="m-p">
        Ta opcja jest przydatna,
        gdy sondaż został uruchomiony testowo
        lub doszło do błędu organizacyjnego.
      </p>`,
      subscriptions: `<p class="m-p">
        Zakładka „Subskrypcje” opisuje wszystko, co dotyczy relacji między użytkownikami:
        zapraszanie subskrybentów, akceptowanie zaproszeń, ponowne wysyłki i usuwanie powiązań.
      </p>

      <p class="m-p">
        Strona „Subskrypcje” jest osobna od strony „Sondaże”.
        Przechodzisz do niej z górnego paska na stronie „Moje gry”,
        przyciskiem <span class="m-code">Subskrypcje 📧</span>.
      </p>

      <h3 class="m-h2">Strona subskrypcji</h3>

      <ul class="m-ul">
        <li><span class="m-strong">Moi subskrybenci</span> — osoby zaproszone przez Ciebie.</li>
        <li><span class="m-strong">Moje subskrypcje</span> — zaproszenia i relacje, które dotyczą Ciebie jako odbiorcy.</li>
      </ul>

      <p class="m-p">
        Złota kropka przy przycisku „Subskrypcje 📧” pokazuje liczbę zaproszeń do zaakceptowania.
      </p>

      <h3 class="m-h3">Moi subskrybenci</h3>
      <p class="m-p">
        Subskrypcja to stałe połączenie między Twoim kontem a zaproszonym użytkownikiem —
        raz zaakceptowana pozwala udostępniać kolejne sondaże bez wpisywania e-maila od nowa.
        Zaproszenie wysyłasz, wpisując e-mail lub nazwę użytkownika
        i klikając <span class="m-code">Zaproś</span>.
      </p>

      <p class="m-p">
        Kolory statusów:
        <span class="m-strong">żółty</span> — oczekujące,
        <span class="m-strong">zielony</span> — aktywne,
        <span class="m-strong">czerwony</span> — odrzucone/anulowane.
        Przyciski <span class="m-code">X</span> usuwa subskrybenta, a <span class="m-code">↻</span> ponawia zaproszenie.
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
        Przyciski: <span class="m-code">✓</span> akceptuje, <span class="m-code">X</span> odrzuca/anuluje.
      </p>

      <p class="m-p">
        W praktyce subskrypcje przyspieszają pracę — do aktywnych subskrybentów możesz
        jednym kliknięciem udostępnić sondaż oraz szybko udostępnić bazę pytań,
        bez ręcznego przepisywania danych i linków.
      </p>
      <p class="m-p">
        Jeśli wpisujesz nazwę użytkownika podczas zapraszania, system najpierw sprawdza,
        czy taki użytkownik istnieje. Jeśli go nie ma, pojawi się komunikat.
        Dla adresu e-mail zaproszenie może trafić także do osoby niezarejestrowanej.
      </p>`,
      logo: `<p class="m-p">
      System pozwala ustawić własne logo, które pojawia się na wyświetlaczu
      (np. na ekranie startowym lub zakończenia). Do tworzenia logo przechodzisz z górnego paska strony „Moje gry”
        za pomocą przycisku <span class="m-code">Logo🖥️</span>.
    </p>

    <div class="m-note">
      <b>Ważne:</b><br/>
      Logo ma rozmiar techniczny <span class="m-code">30×10</span> (kafelki znaków) albo <span class="m-code">150×70</span> (piksele).
      To ograniczenie wynika z fizycznego układu tablicy i ma zapewnić czytelność na żywo.
    </div>

    <h3 class="m-h2">Tryby tworzenia logo</h3>

    <p class="m-p">
      Podczas tworzenia nowego logo wybierasz jeden z trybów.
      Każdy tryb prowadzi do tego samego efektu (logo na wyświetlaczu),
      ale różni się sposobem tworzenia.
    </p>

    <ul class="m-ul">
      <li>
        <span class="m-strong">Napis</span> — klasyczne logo złożone ze znaków (styl „Familiady”).
        Dobre, gdy chcesz szybko zrobić czytelny tytuł.
      </li>
      <li>
        <span class="m-strong">Tekst</span> — edycja tekstu i podgląd w „pikselach”.
        Dobre, gdy potrzebujesz innego kroju/układu niż w „Napis”.
      </li>
      <li>
        <span class="m-strong">Rysunek</span> — rysujesz ręcznie w siatce (jak w prostym edytorze grafiki).
        Dobre do ikon i prostych kształtów.
      </li>
      <li>
        <span class="m-strong">Obraz</span> — importujesz obrazek i dopasowujesz go do tablicy.
        Dobre, gdy masz gotowe logo firmy.
      </li>
    </ul>

    <h3 class="m-h2">Podgląd na wyświetlaczu</h3>

    <p class="m-p">
      W edytorze cały czas widzisz podgląd „jak na tablicy”.
      To ważne, bo to co wygląda dobrze w dużej rozdzielczości,
      może być nieczytelne po sprowadzeniu do <span class="m-code">150×70</span>.
    </p>

    <div class="m-note">
      <b>Praktyczna rada:</b><br/>
      Najlepiej sprawdzają się grube kształty, duże litery i wysoki kontrast.
      Cienkie linie, małe detale i delikatne przejścia zwykle znikają.
    </div>

    <h3 class="m-h2">Zapis i aktywne logo</h3>

    <p class="m-p">
      Logo możesz zapisać pod własną nazwą. Na liście logotypów możesz też ustawić,
      które logo jest <span class="m-strong">aktywne</span>.
      Aktywne logo będzie używane przez wyświetlacz automatycznie.
    </p>

    <p class="m-p">
      Jeśli nie ustawisz żadnego aktywnego logo, system użyje
      <span class="m-strong">domyślnego logo</span>.
    </p>

    <h3 class="m-h2">Import i eksport logo</h3>

    <p class="m-p">
      Edytor pozwala eksportować aktywne logo do pliku oraz importować logo z pliku.
      Dzięki temu możesz przenosić logo pomiędzy kontami lub robić kopie zapasowe.
    </p>

    <div class="m-warn">
      <b>Uwaga:</b><br/>
      Nie edytuj plików logo ręcznie. To format techniczny — ręczna zmiana może spowodować,
      że import się nie powiedzie albo logo będzie działało nieprawidłowo.
    </div>`,
      control: `<p class="m-p">
        Do Panelu sterowania przechodzisz z listy „Moje gry”
        za pomocą przycisku <span class="m-code">Graj</span>.
        Ten tryb jest przeznaczony wyłącznie do prowadzenia rozgrywki na żywo —
        w tym miejscu nie edytujesz już pytań ani wyników sondażu.
      </p>
    
      <p class="m-p">
        Panel sterowania prowadzi operatora krok po kroku:
        najpierw podłączasz urządzenia, potem ustawiasz parametry rozgrywki,
        a na końcu przechodzisz przez rundy i (opcjonalnie) finał.
        Kolejne kroki odblokowują się dopiero wtedy, gdy poprzednie są gotowe,
        co minimalizuje ryzyko pomyłek podczas nagrania.
      </p>
    
      <h3 class="m-h2">Co musi być gotowe, zanim zaczniesz</h3>
    
      <ul class="m-ul">
        <li>
          Gra powinna mieć przygotowane pytania i odpowiedzi (z edytora),
          a jeśli jest to gra sondażowa — sondaż powinien być zakończony i zatwierdzony.
        </li>
        <li>
          Operator powinien mieć komputer z dużym ekranem (panel jest projektowany pod tryb desktopowy).
        </li>
        <li>
          Powinny być przygotowane osobne urządzenia: wyświetlacz (TV/rzutnik), urządzenie prowadzącego,
          oraz urządzenie pełniące rolę przycisku.
        </li>
        <li>
          Stabilne Wi-Fi (najczęstsza przyczyna problemów to ubite karty w tle / przełączanie sieci).
        </li>
      </ul>
    
      <div class="m-note">
        <b>Dlaczego tyle „formalności”?</b><br/>
        Rozgrywka jest na żywo i ma telewizyjne tempo. Panel sterowania ma pilnować procedury,
        a nie dokładać operatorowi stresu. Dlatego system wymusza gotowość sprzętu i ustawień przed startem.
      </div>
    
      <h3 class="m-h2">Kto co widzi</h3>
    
      <p class="m-p">
        System celowo rozdziela ekrany, żeby każdy robił swoje:
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Operator (Panel sterowania)</span> — widzi wszystkie przyciski,
          status gry, bank, X-y, komunikaty i kolejne kroki procedury.
          Operator steruje tym, co pojawia się na tablicy.
        </li>
        <li>
          <span class="m-strong">Wyświetlacz</span> — pokazuje tablicę gry: pytania, odpowiedzi,
          punkty, bank, błędy (X) oraz ekrany startu i zakończenia.
          To ekran widoczny dla uczestników i widowni.
        </li>
        <li>
          <span class="m-strong">Prowadzący</span> — dostaje treści do odczytania i podgląd kontekstu,
          ale nie steruje przebiegiem gry (steruje operator).
        </li>
        <li>
          <span class="m-strong">Przycisk</span> — służy do sygnału w pojedynku (kto pierwszy).
        </li>
      </ul>
    
      <h3 class="m-h2">1) Urządzenia</h3>
    
      <p class="m-p">
        Pierwszy etap w panelu to podłączenie urządzeń.
        W górnym pasku panelu widzisz trzy statusy:
        <span class="m-strong">Wyświetlacz</span>,
        <span class="m-strong">Prowadzący</span>,
        <span class="m-strong">Przycisk</span>.
        Operator rozpoczyna od tego, żeby wszystkie były online.
      </p>
    
      <h3 class="m-h3">Krok 1: Wyświetlacz</h3>
    
      <p class="m-p">
        W tym kroku panel pokazuje kod QR i link dla wyświetlacza.
        Najlepiej otworzyć wyświetlacz na telewizorze lub rzutniku,
        w trybie pełnoekranowym (bez pasków przeglądarki).
        Dopiero gdy wyświetlacz jest online, panel pozwoli przejść dalej.
      </p>
    
      <h3 class="m-h3">Krok 2: Prowadzący i Przycisk</h3>
    
      <p class="m-p">
        W drugim kroku podłączasz urządzenie prowadzącego i urządzenie przycisku.
        Panel również pokazuje QR/link do podłączenia.
        W praktyce najlepiej użyć dwóch osobnych telefonów albo telefonu i tabletu.
      </p>
    
      <p class="m-p">
        W tym kroku jest opcja <span class="m-strong">„QR na wyświetlaczu”</span> —
        po jej użyciu kody QR mogą zostać pokazane na dużym ekranie,
        żeby ekipa mogła szybko zeskanować je telefonami.
        To przyspiesza start na planie, bo nie trzeba przepisywać linków.
      </p>
    
      <div class="m-warn">
        <b>Uwaga:</b><br/>
        Jeśli któreś urządzenie rozłączy się w trakcie, panel potrafi pokazać ostrzeżenie.
        Najczęściej pomaga: wyłączyć oszczędzanie baterii, nie minimalizować przeglądarki
        oraz trzymać urządzenia na jednej stabilnej sieci Wi-Fi.
      </div>
    
      <h3 class="m-h3">Krok 3: Dźwięk</h3>
    
      <p class="m-p">
        Przeglądarki blokują automatyczne odtwarzanie dźwięku,
        dopóki użytkownik nie wykona „gestu” (kliknięcia).
        Dlatego panel ma osobny krok odblokowania dźwięku.
        Bez tego możesz nie usłyszeć sygnałów, które wspierają tempo gry.
      </p>
    
      <h3 class="m-h2">2) Ustawienia</h3>
    
      <p class="m-p">
        Gdy urządzenia są online, przechodzisz do ustawień rozgrywki.
        Ten etap ma dwa cele:
        (1) przygotować czytelne nazwy drużyn na tablicy,
        (2) dopasować parametry rozgrywki do nagrania (dodatkowe ustawienia).
      </p>
    
      <h3 class="m-h3">Nazwy drużyn</h3>
    
      <p class="m-p">
        Ustawiasz nazwę drużyny A i B.
        Są to napisy, które widzą zawodnicy i widownia na wyświetlaczu,
        więc najlepiej ustalić je przed startem rund.
        Panel blokuje przejście dalej, dopóki obie nazwy nie są wpisane.
      </p>
    
      <h3 class="m-h3">Dodatkowe ustawienia (ważne dla operatora)</h3>
    
      <p class="m-p">
        W „Dodatkowych ustawieniach” dopasowujesz rozgrywkę do formatu odcinka.
        Te opcje nie zmieniają sensu zasad, tylko ustawiają tempo i progi gry.
      </p>
    
      <ul class="m-ul">
        <li>
          <span class="m-strong">Mnożniki rund</span> — wpisywane po przecinku (np. <span class="m-code">1,1,1,2,3</span>).
          To odpowiada klasycznemu podwajaniu/potrajaniu wartości w kolejnych etapach.
          W praktyce: bank rundy na końcu jest mnożony przez mnożnik bieżącej rundy.
        </li>
        <li>
          <span class="m-strong">Cel rozgrywki</span> — próg punktów, po którym gra może przejść do finału
          (w klasycznej formule często 300). To pozwala dopasować długość gry.
        </li>
        <li>
          <span class="m-strong">Cel finału</span> — próg punktów w finale (domyślnie 200 w klasycznej formule).
        </li>
        <li>
          <span class="m-strong">Zakończenie gry</span> — co pokazuje wyświetlacz na końcu
          (logo / punkty / kwota po finale). To jest ważne produkcyjnie: „ostatni kadr”.
        </li>
      </ul>
    
      <div class="m-note">
        <b>Dlaczego to jest w Panelu sterowania, a nie w edytorze?</b><br/>
        Bo to są ustawienia odcinka (produkcji), a nie treści pytań.
        Pytania nie powinny się zmieniać podczas rozgrywki, ale parametry gry czasem tak.
      </div>
    
      <h3 class="m-h3">Finał: włącz i wybierz 5 pytań</h3>
    
      <p class="m-p">
        Jeśli rozgrywka ma mieć finał, włączasz finał i wybierasz dokładnie <span class="m-strong">5 pytań finału</span>.
        Panel pokazuje listę pytań oraz listę „Pytania finału (max 5)”.
        Po wybraniu piątki używasz przycisku <span class="m-strong">Zatwierdź</span>.
      </p>
    
      <div class="m-warn">
        <b>Uwaga:</b><br/>
        Finał wymaga zatwierdzonych 5 pytań przed startem rund.
        To celowa blokada — na żywo nie ma czasu na wybieranie pytań „na szybko”.
        Jeśli chcesz zmienić zestaw, używasz trybu <span class="m-strong">Edytuj</span> przy pytaniach finału.
      </div>
    
      <h3 class="m-h2">3) Rundy — przebieg gry krok po kroku</h3>
    
      <p class="m-p">
        W rundach prowadzisz właściwą rozgrywkę: pytania, odpowiedzi, punkty i bank rundy.
        Gracze widzą tablicę na wyświetlaczu, prowadzący zadaje pytania i pilnuje przebiegu,
        a operator odsłania odpowiedzi, nalicza punkty oraz dodaje błędy (X).
      </p>
      
      <p class="m-p">
        Najważniejsza zasada w praktyce: prowadzący skupia się na uczestnikach,
        a operator na obsłudze systemu. Dzięki temu gra jest płynna,
        a tablica zawsze pokazuje to, co powinno być w danym momencie.
      </p>
    
      <h3 class="m-h3">Start rundy: „Gra gotowa” i intro</h3>
    
      <p class="m-p">
        Rozpoczynając rundy, panel najpierw przygotowuje wyświetlacz (czyści tablicę i ustawia stan gry),
        a następnie pozwala uruchomić intro.
        To porządkuje początek nagrania: widzowie dostają czytelny start,
        a operator ma jasny moment wejścia w pierwsze pytanie.
      </p>
    
      <h3 class="m-h3">Pojedynek: kto przejmuje kontrolę</h3>
    
      <p class="m-p">
        Każde pytanie zaczyna się od pojedynku „głów rodzin” przy pulpicie.
        W tym momencie kluczowe jest urządzenie <span class="m-strong">Przycisk</span>:
        sygnał z przycisku informuje panel, że ktoś nacisnął pierwszy.
        Operator zatwierdza, która strona zdobyła pierwszeństwo,
        a prowadzący przechodzi do udzielania odpowiedzi.
      </p>
    
      <p class="m-p">
        Zgodnie z regulaminem, jeśli pierwsza odpowiedź nie jest najwyżej punktowana,
        druga „głowa” ma szansę odpowiedzieć lepiej i przejąć kontrolę.
        Panel prowadzi operatora przez decyzję kontroli rundy,
        a wyświetlacz pokazuje, która drużyna aktualnie gra (wskaźnik drużyny).
      </p>

      <h3 class="m-h3">Oddanie pytania</h3>
    
      <p class="m-p">
        Zgodnie z ustaleniami rozgrywki, po uzyskaniu kontroli drużyna może też zdecydować,
        że <span class="m-strong">oddaje pytanie</span> przeciwnikom.
        Jest to ruch taktyczny: zamiast „dobić” pytanie, drużyna może przekazać szansę rywalom.
        Panel udostępnia tę opcję tylko w odpowiednim momencie i pilnuje, żeby nie dało się jej nadużywać.
      </p>
    
      <h3 class="m-h3">Rozgrywka pytania: odsłanianie odpowiedzi i bank</h3>
    
      <p class="m-p">
        Po ustaleniu kontroli drużyna odpowiada, a operator odsłania trafione odpowiedzi na tablicy.
        Każde trafienie dodaje punkty do <span class="m-strong">banku rundy</span>.
        Bank jest widoczny na wyświetlaczu i rośnie wraz z kolejnymi trafieniami.
      </p>
    
      <p class="m-p">
        Rozgrywka trwa do momentu, gdy:
        wszystkie odpowiedzi zostaną odsłonięte,
        albo drużyna straci trzy „szanse” (trzy X),
        wtedy operator zakończy etap i przejdzie do kradzieży (gdy są spełnione warunki).
      </p>
    
      <h3 class="m-h3">Pudła (X) i limit 3 sekund</h3>
    
      <p class="m-p">
        Błędna odpowiedź jest oznaczana symbolem <span class="m-strong">X</span> na tablicy.
        Trzy błędy oznaczają utratę kontroli i przejście do kradzieży przez przeciwników.
        System ma także mechanikę limitu czasu <span class="m-strong">3 sekund</span> na odpowiedź —
        przekroczenie limitu jest traktowane jak pudło (X).
      </p>
    
      <div class="m-note">
        <b>Po co timer?</b><br/>
        To jest „bat na tempo”. Timer pozwala operatorowi szybko zamknąć zawahanie
        bez dyskusji i utrzymać rytm rozgrywki.
      </div>
    
      <h3 class="m-h3">Kradzież banku (jedna odpowiedź)</h3>
    
      <p class="m-p">
        Gdy drużyna grająca wykorzysta trzy „szanse” zanim odsłoni wszystkie odpowiedzi,
        pytanie przechodzi do drużyny przeciwnej.
        Przeciwnicy mają prawo do <span class="m-strong">jednej odpowiedzi</span>:
        jeśli trafi — bank przechodzi do nich,
        jeśli nie — bank zostaje u drużyny grającej.
        To domyka pytanie i rundę zgodnie z regulaminem.
      </p>
    
      <h3 class="m-h3">Odsłanianie brakujących odpowiedzi i zakończenie rundy</h3>
    
      <p class="m-p">
        Po rozstrzygnięciu pytania operator może odsłonić brakujące odpowiedzi „informacyjnie”,
        żeby widzowie zobaczyli pełną tablicę.
        Następnie operator kończy rundę: bank jest dopisywany właściwej drużynie,
        z uwzględnieniem mnożnika rundy.
      </p>
    
      <div class="m-note">
        <b>Praktyczna uwaga:</b><br/>
        Panel celowo rozdziela „rozgrywkę pytania” od „zakończenia rundy”.
        Dzięki temu operator nie skasuje przypadkiem stanu tablicy,
        zanim prowadzący dopowie puentę lub zanim padnie „dziękujemy”.
      </div>

      <h3 class="m-h3">Zakończenie rund i przejście dalej</h3>
      
      <p class="m-p">
        Po każdej rundzie system aktualizuje wynik drużyn i sprawdza,
        czy spełniono warunek zakończenia rozgrywki (ustawiony w „Dodatkowych ustawieniach”).
        Najczęściej jest to próg punktów, np. <span class="m-strong">300</span>,
        ale może być inny — zależnie od tego, jak chcesz poprowadzić turniej.
      </p>
      
      <p class="m-p">
        Jeśli finał jest <span class="m-strong">włączony</span>, a warunek zakończenia rund został spełniony,
        rozgrywka przechodzi do finału.
        Jeśli finał jest <span class="m-strong">wyłączony</span>, rozgrywka kończy się po rundach
        i system przechodzi do ekranu zakończenia (logo/punkty/kwota — zgodnie z ustawieniami).
      </p>
      
      <div class="m-warn">
        <b>Uwaga:</b><br/>
        Jeśli w trakcie rozgrywki skończą się pytania,
        zanim zostanie osiągnięty próg punktowy,
        system zakończy rundy z powodu braku pytań.
        Wtedy rozgrywka przejdzie do finału (jeśli jest włączony)
        albo do zakończenia gry (jeśli finał jest wyłączony).
      </div>
    
    <h3 class="m-h2">4) Finał</h3>

      <p class="m-p">
        Finał jest osobnym trybem gry. Bierze w nim udział dwóch zawodników
        z drużyny, która wygrała rozgrywkę zasadniczą.
        Odpowiadają na te same <span class="m-strong">5 pytań</span>,
        a ich punkty sumują się. Celem jest osiągnięcie progu finału
        (domyślnie <span class="m-strong">200 punktów</span>, chyba że ustawiono inaczej).
      </p>
      
      <h3 class="m-h3">Przygotowanie finału</h3>
      
      <p class="m-p">
        Zanim rozpoczniesz finał, w ustawieniach gry musisz mieć wybrane i zatwierdzone
        <span class="m-strong">dokładnie 5 pytań finałowych</span>.
        Dzięki temu finał jest gotowy do poprowadzenia bez szukania pytań w trakcie.
      </p>
      
      <p class="m-p">
        Drugi zawodnik nie powinien znać odpowiedzi pierwszego.
        W praktyce na czas tury pierwszego zawodnika
        drugi zawodnik odwraca się albo zakłada słuchawki z muzyką.
      </p>
      
      <h3 class="m-h3">Przygotowanie finału</h3>
      
      <p class="m-p">
        Zanim rozpoczniesz finał, w ustawieniach gry musisz mieć wybrane i zatwierdzone
        <span class="m-strong">dokładnie 5 pytań finałowych</span>.
        Dzięki temu finał jest gotowy do poprowadzenia bez szukania pytań w trakcie.
      </p>
      
      <p class="m-p">
        W finale bardzo ważne jest, żeby drugi zawodnik nie znał odpowiedzi pierwszego.
        Dlatego w czasie rundy pierwszego zawodnika drugi zawodnik
        <span class="m-strong">oddala się i zakłada słuchawki z muzyką</span>,
        żeby nie słyszeć pytań ani odpowiedzi.
      </p>
      
      <h3 class="m-h3">Runda 1 – pierwszy zawodnik (15 sekund)</h3>
      
      <p class="m-p">
        Prowadzący czyta po kolei pięć pytań, a pierwszy zawodnik odpowiada w limicie
        <span class="m-strong">15 sekund</span>.
        Operator w tym czasie <span class="m-strong">wpisuje odpowiedzi</span> w panelu finału.
        Na tym etapie odpowiedzi nie są jeszcze oceniane ani odsłaniane.
      </p>
      
      <p class="m-p">
        Po zakończeniu rundy operator przypisuje wpisane odpowiedzi do listy punktowanych wyników
        i <span class="m-strong">odsłania je na tablicy</span>.
        Jeśli odpowiedź nie pasuje do żadnej pozycji z listy,
        otrzymuje <span class="m-strong">0 punktów</span>.
      </p>
      
      <p class="m-p">
        Po odsłonięciu odpowiedzi pierwszego zawodnika system ukrywa jego połowę tablicy,
        a prowadzący przygotowuje wejście drugiego zawodnika i przypomina zasady finału.
      </p>
      
      <h3 class="m-h3">Runda 2 – drugi zawodnik (20 sekund) i powtórki</h3>
      
      <p class="m-p">
        Drugi zawodnik wraca do gry i odpowiada na te same pytania w limicie
        <span class="m-strong">20 sekund</span>.
        W momencie gdy na tablicy pojawia się połówka z odpowiedziami pierwszego zawodnika,
        drugi zawodnik <span class="m-strong">odwraca się</span>,
        żeby ich nie widzieć i nie sugerować się nimi.
      </p>
      
      <p class="m-p">
        Operator znów najpierw wpisuje wszystkie odpowiedzi drugiego zawodnika,
        bez odsłaniania i bez oceniania „na bieżąco”.
        Jeśli druga osoba poda odpowiedź identyczną jak pierwsza,
        jest to <span class="m-strong">powtórka</span> — zawodnik musi podać inną odpowiedź,
        a operator może oznaczyć tę próbę jako powtórzoną.
        Odpowiedzi powtórzone nie dają punktów.
      </p>
      
      <p class="m-p">
        Po zakończeniu rundy operator przypisuje odpowiedzi drugiego zawodnika do listy punktowanych wyników
        i <span class="m-strong">odsłania je po kolei</span> na tablicy.
        Punkty obu zawodników sumują się.
      </p>
      
      <h3 class="m-h3">Kiedy finał się kończy</h3>
      
      <p class="m-p">
        Finał kończy się w momencie, gdy łączna liczba punktów osiągnie lub przekroczy
        ustalony próg. Może się zdarzyć, że próg zostanie osiągnięty już po turze pierwszego zawodnika
        — wtedy drugi zawodnik nie musi już grać, a rozgrywka przechodzi od razu do zakończenia.
      </p>
      
      <p class="m-p">
        Po zakończeniu finału system wyświetla ekran końcowy zgodnie z ustawieniami zakończenia gry:
        <span class="m-strong">logo</span>, <span class="m-strong">punkty</span> albo
        <span class="m-strong">kwotę wygranej</span>.
      </p>`,
      demo: `<p class="m-p">
        W tej zakładce możesz przywrócić przykładowe materiały startowe:
        bazę pytań, loga oraz gotowe gry różnych kategorii i stanów.
      </p>
  
      <p class="m-p">
        Przydaje się to, gdy:
      </p>
  
      <ul class="m-ul">
        <li>chcesz szybko zobaczyć jak działa system</li>
        <li>testujesz funkcje bez tworzenia własnych danych</li>
        <li>przypadkiem usunąłeś przykładową zawartość</li>
      </ul>
  
      <div class="m-warn">
        Przywracanie demo nie usuwa Twoich danych – dodaje tylko przykładowe materiały.
      </div>
  
      <div class="m-box">
        <button class="btn" id="demoRestoreBtn">
          ↺ Przywróć pliki demo
        </button>
  
        <p class="m-p m-muted" style="margin-top:10px">
          Po kliknięciu nastąpi przejście do widoku Moje gry i automatyczne wgranie demo.
        </p>
      </div>`,
    },
  },
  privacy: {
    title: "Familiada — polityka prywatności",
    pageTitle: "Polityka Prywatności",
    backToManual: "← Wskazówki",
    logout: "Wyloguj",
    content: `
      <h2 class="m-h2">1. Administrator danych</h2>
      <p class="m-p">
        Administratorem danych osobowych jest operator serwisu Familiada dostępnego pod adresem
        <span class="m-code">{site}</span>
      </p>
      <p class="m-p">Kontakt: <span class="m-code">admin@familiada.online</span></p>
  
      <h2 class="m-h2">2. Zakres przetwarzanych danych</h2>
      <p class="m-p">Przetwarzamy wyłącznie dane niezbędne do działania serwisu:</p>
      <ul class="m-ul">
        <li>adres e-mail,</li>
        <li>nazwa użytkownika (login),</li>
        <li>dane związane z uczestnictwem w sondażach i subskrypcjach.</li>
      </ul>
  
      <h2 class="m-h2">3. Cele przetwarzania danych</h2>
      <p class="m-p">Dane osobowe są przetwarzane w celu:</p>
      <ul class="m-ul">
        <li>założenia i obsługi konta użytkownika,</li>
        <li>wysyłania wiadomości systemowych (np. potwierdzenie konta, reset hasła),</li>
        <li>wysyłania powiadomień subskrypcyjnych oraz zaproszeń do udziału w sondażach,</li>
        <li>zapewnienia bezpieczeństwa i poprawnego działania serwisu.</li>
      </ul>
  
      <h2 class="m-h2">4. Wiadomości e-mail</h2>
      <p class="m-p">Wysyłamy wyłącznie:</p>
      <ul class="m-ul">
        <li>wiadomości transakcyjne (systemowe),</li>
        <li>powiadomienia subskrypcyjne wysyłane tylko do użytkowników, którzy wyrazili na nie zgodę.</li>
      </ul>
      <p class="m-p">Nie wysyłamy wiadomości marketingowych ani reklamowych.</p>
      <p class="m-p">Częstotliwość wysyłki jest ograniczona, aby zapobiec nadużyciom.</p>
  
      <h2 class="m-h2">5. Subskrypcje i zaproszenia</h2>
      <p class="m-p">Powiadomienia i zaproszenia do sondaży:</p>
      <ul class="m-ul">
        <li>są wysyłane tylko do znanych i wskazanych odbiorców,</li>
        <li>nie są wysyłane masowo,</li>
        <li>nie są wysyłane częściej niż raz na określony czas dla jednego adresu e-mail.</li>
      </ul>
  
      <h2 class="m-h2">6. Podstawa prawna przetwarzania</h2>
      <p class="m-p">Dane są przetwarzane na podstawie:</p>
      <ul class="m-ul">
        <li>zgody użytkownika (art. 6 ust. 1 lit. a RODO),</li>
        <li>niezbędności do wykonania umowy (art. 6 ust. 1 lit. b RODO),</li>
        <li>prawnie uzasadnionego interesu administratora (art. 6 ust. 1 lit. f RODO).</li>
      </ul>
  
      <h2 class="m-h2">7. Okres przechowywania danych</h2>
      <p class="m-p">Dane są przechowywane:</p>
      <ul class="m-ul">
        <li>przez czas istnienia konta użytkownika,</li>
        <li>lub do momentu cofnięcia zgody lub usunięcia konta.</li>
      </ul>
  
      <h2 class="m-h2">8. Udostępnianie danych</h2>
      <p class="m-p">
        Nie sprzedajemy ani nie udostępniamy danych osobowych podmiotom trzecim, z wyjątkiem:
      </p>
      <ul class="m-ul">
        <li>usług technicznych niezbędnych do działania serwisu (np. hosting, wysyłka e-maili).</li>
      </ul>
  
      <h2 class="m-h2">9. Prawa użytkownika</h2>
      <p class="m-p">Użytkownik ma prawo do:</p>
      <ul class="m-ul">
        <li>dostępu do swoich danych,</li>
        <li>ich poprawiania,</li>
        <li>usunięcia,</li>
        <li>ograniczenia przetwarzania,</li>
        <li>cofnięcia zgody w dowolnym momencie.</li>
      </ul>
  
      <h2 class="m-h2">10. Kontakt</h2>
      <p class="m-p">
        W sprawach związanych z ochroną danych osobowych prosimy o kontakt:
        <span class="m-code">admin@familiada.online</span>
      </p>
    `,
  },
  builderImportExport: {
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
  basesImport: {
    defaults: {
      name: "Nowa baza pytań",
      category: "Kategoria",
      tag: "Tag",
    },
    steps: {
      createBase: "Import: tworzenie bazy…",
      categories: "Import: kategorie…",
      tags: "Import: tagi…",
      questions: "Import: pytania…",
      questionTags: "Import: powiązania tagów…",
      categoryTags: "Import: tagi folderów…",
    },
    errors: {
      missingUserId: "importBase: brak currentUserId",
      invalidFormat: "Zły format pliku (brak base / questions).",
      missingUrl: "importBaseFromUrl: brak URL",
      fetchFailed: "Nie można wczytać pliku JSON ({status}): {url}",
      invalidJson: "Niepoprawny format JSON bazy",
      noUser: "Brak zalogowanego użytkownika.",
    },
  },
  builder: {
    title: "Familiada — moje gry",
    nav: {
      pollsHubPolls: "Sondaże 📊",
      pollsHubMobilePolls: "📊",
      pollsHubSubs: "Subskrypcje 📧",
      pollsHubMobileSubs: "📧",
      bases: "Bazy pytań 🗃️",
      basesMobile: "🗃️",
      manual: "Wskazówki ℹ️",
      manualMobile: "ℹ️",
      logo: "Logo 🖥️",
      logoMobile: "🖥️",
      account: "Ustawienia konta",
      logout: "Wyloguj",
    },
    header: {
      title: "Twoje gry",
      hint: "Kliknij kafelek, żeby go zaznaczyć.",
    },
    actions: {
      edit: "Edytuj",
      editMobile: "Edyt.",
      play: "Graj",
      playMobile: "Graj",
      poll: "Sondaż",
      pollMobile: "Sond.",
      exportFile: "Eksportuj do pliku",
      exportFileMobile: "Exp.plk",
      exportBase: "Eksportuj do bazy",
      exportBaseMobile: "Exp.bz",
      import: "Importuj",
      importMobile: "Imp",
    },
    tabs: {
      pollText: "Typowy sondaż",
      pollPoints: "Punktacja",
      prepared: "Preparowany",
    },
    import: {
      title: "Importuj",
      subtitle: "Wybierz plik JSON lub wklej JSON poniżej.",
      loadFile: "Wczytaj plik",
      placeholder: "Wklej JSON tutaj...",
      confirm: "Importuj",
      cancel: "Zamknij",
      pickFile: "Wybierz plik JSON.",
      loaded: "Plik wczytany.",
      loadFailed: "Nie udało się wczytać pliku.",
      pasteJson: "Wklej JSON lub wybierz plik.",
      invalidJson: "Niepoprawny JSON.",
      dbFailed: "Błąd bazy podczas importu.",
      progress: {
        start: "Importuję…",
        save: "Zapisuję…",
        done: "Gotowe ✅",
        errorLabel: "Błąd ❌",
        failed: "Import nieudany.",
      },
    },
    exportBase: {
      title: "Eksport do bazy",
      subtitle: "Wybierz bazę pytań. Zostanie utworzony folder w głównym katalogu o nazwie jak gra.",
      confirm: "Eksportuj",
      cancel: "Zamknij",
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
        done: "Gotowe ✅",
        errorLabel: "Błąd ❌",
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
        done: "Gotowe ✅",
        errorLabel: "Błąd ❌",
        failed: "Eksport nieudany.",
      },
    },
    card: {
      delete: "Usuń",
      newGame: "Nowa gra",
    },
    types: {
      pollText: "SONDAŻ",
      pollPoints: "PUNKTACJA",
      prepared: "PREPAROWANY",
    },
    status: {
      draft: "SZKIC",
      open: "OTWARTY",
      closed: "ZAMKNIĘTY",
    },
    newGame: {
      pollText: "Nowy sondaż",
      pollPoints: "Nowa punktacja",
      prepared: "Nowy preparowany",
    },
    delete: {
      title: "Usuń grę",
      text: "Czy na pewno chcesz usunąć „{name}”?",
      ok: "Usuń",
      cancel: "Anuluj",
    },
    alert: {
      deleteFailed: "Nie udało się usunąć gry.",
      createFailed: "Nie udało się utworzyć gry.",
      resetPollFailed: "Nie udało się zresetować statusu sondażu.",
      checkFailed: "Nie udało się sprawdzić statusu gry.",
      openPollFailed: "Nie udało się otworzyć sondażu.",
    },
    hint: {
      select: "Zaznacz grę, aby włączyć akcje.",
      selectPlus: "Zaznacz grę, aby włączyć akcje i eksport.",
    },
    editAfterPoll: {
      title: "Zresetować sondaż?",
      text: "Ten sondaż jest już otwarty lub zamknięty. Zresetować, aby edytować?",
      ok: "Resetuj",
      cancel: "Anuluj",
    },
    gameFallback: "Bez nazwy",
  },
  editor: {
    title: "Familiada — edytor",
    backToGames: "← Moje gry",
    logout: "Wyloguj",
    pageTitle: "Edytor",
    gameNamePlaceholder: "Nazwa gry",
    questionsTitle: "Pytania",
    importHint: "Import działa z pliku TXT albo z wklejonej treści.",
    importBtn: "Importuj",
    empty: "Wybierz pytanie po lewej lub dodaj nowe.",
    lockedPoll: "SONDAŻ OTWARTY — EDYCJA ZABLOKOWANA",
    questionLabel: "Treść pytania",
    answerLabel: "Odpowiedź",
    pointsLabel: "Pkt",
    importModal: {
      title: "Import pytań",
      subtitle:
        "Możesz <b>wkleić treść</b> albo <b>wczytać plik TXT</b>. Opcjonalnie na początku dodaj linię <b>@Nazwa gry</b>. Pytania zaczynają się od <b>#</b>. Odpowiedzi mogą mieć numer. Punkty po <b>/</b> są opcjonalne (w sondażach mogą być ignorowane).",
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
      pollText: "TYPOWY SONDAŻ",
      pollPoints: "SONDAŻ PUNKTACJI",
      prepared: "PREPAROWANY",
    },
    config: {
      pollText: {
        title: "Typowy sondaż",
        hintTop: "Minimum {min} pytań.",
        hintBottom: "Odpowiedzi i punkty nie są wymagane.",
      },
      pollPoints: {
        title: "Sondaż punktacji",
        hintTop: "Minimum {min} pytań, każde {answersMin}–{answersMax} odpowiedzi.",
        hintBottom: "Punkty są ignorowane.",
      },
      prepared: {
        title: "Preparowany",
        hintTop: "Minimum {min} pytań, każde {answersMin}–{answersMax} odpowiedzi.",
        hintBottom: "Suma punktów ≤ {sum}.",
      },
    },
    status: {
      nameSaved: "Zapisano nazwę.",
      nameSaveError: "Nie udało się zapisać nazwy.",
      addQuestionLimit: "Nie można dodać pytania — ograniczenie bazy (constraint na questions.ord).",
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
      pointsRejected: "Błąd: punkty odrzucone przez bazę (constraint).",
      pointsSaveError: "Błąd zapisu punktów (konsola).",
      saved: "Zapisano.",
      typing: "Piszesz…",
      answerLimit: "Limit odpowiedzi: {limit}.",
      minQuestions: "Wymagane minimum: {min} (masz {count})",
      minQuestionsOk: "Minimum spełnione",
    },
    confirm: {
      resetPoll: "Zresetować status sondażu do edycji?",
      deleteQuestion: "Usunąć to pytanie i wszystkie jego odpowiedzi?",
      deleteAnswer: "Usunąć tę odpowiedź?",
    },
    sumLabel: "SUMA",
    import: {
      fileFailed: "Nie udało się wczytać pliku.",
      pastePrompt: "Wklej treść albo wczytaj plik.",
      formatError: "Błąd formatu.",
      confirm:
        "Import TXT ZASTĄPI zawartość gry:\n\n- usunie wszystkie dotychczasowe pytania i odpowiedzi\n- wgra dane z tekstu\n\nKontynuować?",
      cancelled: "Anulowano.",
      progress: {
        start: "Start…",
        cleanup: "Czyszczenie gry",
        cleanupOk: "Wyczyszczono",
        ok: "OK",
        question: "Pytanie {ord}/{total}",
        answer: "Odpowiedź {ord}",
        answerOk: "Odpowiedź {ord} OK",
        createQuestionMsg: "Tworzę pytanie…",
        createAnswerMsg: "Odpowiedź {ord}…",
        createAnswerOkMsg: "Odpowiedź {ord} OK",
        renumber: "Porządkuję numerację",
        statuses: "Liczenie statusów",
        render: "Rysuję widok",
        done: "Gotowe ✅",
        errorStep: "Błąd ❌",
      },
      done: "Import zakończony.",
      replaced: "Zaimportowano (zastąpiono zawartość).",
      error: "Błąd: {error}",
      warningClose: "Zamknij",
    },
    alert: {
      missingId: "Brak identyfikatora edytora.",
      cannotEdit: "Nie można edytować w trakcie otwartego sondażu.",
      editorError: "Błąd edytora (konsola).",
    },
  },
  pollText: {
    title: "Familiada — sondaż",
    pollTitle: "Sondaż",
    loading: "Ładuję…",
    placeholder: "Wpisz odpowiedź...",
    send: "Wyślij",
    sendMobile: "OK",
    maxChars: "Maksymalnie 17 znaków.",
    thanks: "Dziękujemy za udział!",
    loadTimeout: "Nie można pobrać pytań (timeout).",
    enterAnswer: "Wpisz odpowiedź.",
    taskInvalid: "Link jest nieważny lub nieaktywny.",
    loginToVote: "Zaloguj się, aby przejść do głosowania.",
    emailRequired: "Podaj e-mail w linku z zaproszenia.",
    openTaskFail: "Nie można otworzyć zadania.",
    pollFallback: "Sondaż",
    pollClosed: "Sondaż jest zamknięty. Dziękujemy!",
    sending: "Wysyłam…",
    error: "Błąd: {error}",
    questionProgress: "Pytanie {current}/{total}",
    beforeUnloadWarn: "Udzielone odpowiedzi nie zostaną uznane.",
    missingParams: "Brak parametru id lub key.",
    alreadyVoted: "Już wziąłeś udział w sondażu.",
    wrongType: "To nie jest typowy sondaż.",
    openPollFail: "Nie można otworzyć sondażu: {error}",
  },
  pollPoints: {
    title: "Familiada — sondaż",
    pollTitle: "Sondaż",
    loading: "Ładuję…",
    thanks: "Dziękujemy za udział!",
    loadTimeout: "Nie można pobrać pytań (timeout).",
    taskInvalid: "Link jest nieważny lub nieaktywny.",
    loginToVote: "Zaloguj się, aby przejść do głosowania.",
    emailRequired: "Podaj e-mail w linku z zaproszenia.",
    openTaskFail: "Nie można otworzyć zadania.",
    pollFallback: "Sondaż",
    pollClosed: "Sondaż jest zamknięty. Dziękujemy!",
    sending: "Wysyłam…",
    error: "Błąd: {error}",
    questionProgress: "Pytanie {current}/{total}",
    beforeUnloadWarn: "Udzielone odpowiedzi nie zostaną uznane.",
    missingParams: "Brak parametru id lub key.",
    alreadyVoted: "Już wziąłeś udział w sondażu.",
    wrongType: "To nie jest sondaż punktacji.",
    openPollFail: "Nie można otworzyć sondażu: {error}",
    answerFallback: "ODP {ord}",
  },
  pollGo: {
    title: "Familiada — zaproszenie",
    loadingTitle: "Ładuję zaproszenie…",
    loadingText: "Proszę czekać.",
    emailPlaceholder: "Podaj e-mail",
    declined: "Odrzucono",
    taskDeclined: "Zadanie zostało odrzucone.",
    error: "Błąd",
    declineTaskFailed: "Nie udało się odrzucić zadania.",
    declineInviteFailed: "Nie udało się odrzucić zaproszenia.",
    subHeading: "Zaproszenie do subskrypcji{owner}",
    taskHeading: "Zaproszenie do głosowania w {name}{owner}",
    taskName: "„{name}”",
    pollFallback: "sondażu",
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
    subscribePrompt: "Jeśli chcesz zasubskrybować podaj adres email.",
    acceptInHub: "Żeby zaakceptować przejdź do Centrum Sondaży.",
    hubLabel: "Centrum Sondaży",
    acceptLabel: "Akceptuj",
    declineLabel: "Odrzuć",
    subscribeLabel: "Subskrybuj",
    loginToAccept: "Żeby zaakceptować musisz się zalogować.",
    loginLabel: "Zaloguj",
    loginToVote: "Żeby zagłosować musisz się zalogować.",
    taskInviteActive: "Zaproszenie do głosowania jest aktywne.",
    voteLabel: "Głosuj",
    missingLinkTitle: "Brak linku",
    missingLinkText: "Brakuje tokenu zaproszenia.",
    invalidLinkTitle: "Link nieważny",
    invalidLinkText: "Link jest nieważny lub nieaktywny.",
    inviteUnknown: "Nie udało się rozpoznać zaproszenia.",
    openInviteFailed: "Nie udało się otworzyć zaproszenia.",
    invitationRecipient: "adresata zaproszenia",
    ownerEmailBlocked: "Ten adres należy do właściciela zaproszenia ({owner}). Już subskrybujesz tego użytkownika.",
  },
  pollQr: {
    title: "Familiada — QR",
    fullscreen: "Pełny ekran",
    scan: "Zeskanuj QR, aby zagłosować",
    missingUrl: "Brak URL",
    qrFailed: "Nie udało się wygenerować QR",
  },
  pollsHub: {
    title: "Familiada — centrum sondaży",
    backToGames: "← Moje gry",
    logout: "Wyloguj",
    header: {
      title: "Centrum sondaży",
      hint: "Zarządzaj sondażami oraz zaproszeniami do głosowania.",
    },
    tabs: {
      polls: "Sondaże",
      subscriptions: "Subskrypcje",
      tasks: "Zadania",
      subscribersMobile: "Subskryb.",
      subscriptionsMobile: "Subskryp.",
    },
    sections: {
      myPolls: "Moje sondaże",
      selectHint: "Kliknij kafelek, aby go zaznaczyć.",
      tasks: "Zadania",
      tasksHint: "Dwuklik otwiera głosowanie.",
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
      placeholder: "Email lub nazwa użytkownika",
      button: "Zaproś",
    },
    share: {
      title: "Udostępnij sondaż",
      subtitle: "Wybierz subskrybentów, którym chcesz wysłać zadanie.",
      save: "Zapisz udostępnienie",
      close: "Zamknij",
    },
    details: {
      title: "Szczegóły głosowania",
      titleWithName: "Szczegóły głosowania — {name}",
      subtitle: "Usuń głos powiązany z zadaniem, jeśli to konieczne.",
      voted: "Zagłosowali",
      pending: "Nie zagłosowali",
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
      text: "Typowy sondaż",
      points: "Punktacja odpowiedzi",
    },
    pollState: {
      open: "Otwarty",
      closed: "Zamknięty",
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
      nameEmailAsc: "Nazwa/Email A–Z",
      nameEmailDesc: "Nazwa/Email Z–A",
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
    anonBadgeTitle: "Anonimowe głosy: {count}.",
    votesBadgeLabel: "Głosy",
    empty: {
      polls: "Brak sondaży do pokazania.",
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
    shareLockedHint: "Zagłosowane — usuń głos, aby odblokować.",
    shareStatusLabel: "Status",
    shareStatusMissing: "Brak",
    shareHintMissing: "Brak",
    errors: {
      mailSend: "Nie udało się wysłać maila.",
      mailSession: "Brak aktywnej sesji do wysyłki maila.",
      declineTask: "Nie udało się odrzucić zadania.",
      invalidEmail: "Niepoprawny e-mail.",
      unknownUser: "Nie znam takiej nazwy użytkownika.",
      invite: "Nie udało się zaprosić.",
      resend: "Nie udało się ponowić zaproszenia.",
      inviteMailFailed: "Zaproszenie zapisane, ale wysyłka maila nie powiodła się.",
      resendMailFailed: "Ponowienie zapisane, ale wysyłka maila nie powiodła się.",
      removeSubscriber: "Nie udało się usunąć subskrybenta.",
      acceptSubscription: "Nie udało się zaakceptować zaproszenia.",
      updateSubscription: "Nie udało się zaktualizować subskrypcji.",
      loadSubscribers: "Nie udało się pobrać subskrybentów.",
      shareSave: "Nie udało się zapisać udostępnienia.",
      loadDetails: "Nie udało się pobrać szczegółów.",
      deleteVote: "Nie udało się usunąć głosu.",
      loadHub: "Nie udało się pobrać danych centrum sondaży.",
    },
    statusMsg: {
      inviteSaved: "Zaproszenie zapisane.",
      mailSending: "Wysyłam mail…",
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
      focusTask: "Masz zadanie do wykonania. Chcesz przejść do głosowania?",
      focusSub: "Masz zaproszenie do subskrypcji. Chcesz je zaakceptować?",
    },
    pollFallback: "sondażu",
    pollNameLabel: "„{name}”",
    ownerFallback: "Użytkownik Familiady",
    mail: {
      subtitle: "Centrum sondaży",
      subscriptionTitle: "Zaproszenie do subskrypcji od użytkownika {owner}",
      subscriptionBody:
        "Użytkownik <strong>{owner}</strong> zaprasza Cię do subskrypcji. Kliknij przycisk, aby zobaczyć zaproszenie.",
      subscriptionAction: "Zobacz zaproszenie",
      taskTitle: "Zaproszenie do głosowania",
      taskSubject: "Zaproszenie do głosowania — {name}",
      taskBody: "Użytkownik <strong>{owner}</strong> zaprasza Cię do udziału w {name}.",
      taskAction: "Przejdź do głosowania",
      ignoreNote: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      linkHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      autoNote: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    pollReadyAlert: "Dokończ grę w Moich grach",
    resendCooldownAlert: "Ponowne wysłanie zaproszenia możliwe za {hours} godz.",
    shareCooldownAlert: "Ponowne zaproszenie do głosowania możliwe za {hours} godz.",
  },
  pollsHubPolls: {
    dash: "-",
    title: "Familiada — centrum sondaży",
    backToGames: "← Moje gry",
    logout: "Wyloguj",
    header: {
      title: "Centrum sondaży",
      hint: "Zarządzaj sondażami oraz zaproszeniami do głosowania.",
    },
    tabs: {
      polls: "Sondaże",
      subscriptions: "Subskrypcje",
      tasks: "Zadania",
      subscribersMobile: "Subskryb.",
      subscriptionsMobile: "Subskryp.",
    },
    sections: {
      myPolls: "Moje sondaże",
      selectHint: "Kliknij kafelek, aby go zaznaczyć.",
      tasks: "Zadania",
      tasksHint: "Dwuklik otwiera głosowanie.",
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
      placeholder: "Email lub nazwa użytkownika",
      button: "Zaproś",
    },
    share: {
      title: "Udostępnij sondaż",
      subtitle: "Wybierz subskrybentów, którym chcesz wysłać zadanie.",
      save: "Zapisz udostępnienie",
      close: "Zamknij",
    },
    details: {
      title: "Szczegóły głosowania",
      titleWithName: "Szczegóły głosowania — {name}",
      subtitle: "Usuń głos powiązany z zadaniem, jeśli to konieczne.",
      voted: "Zagłosowali",
      pending: "Nie zagłosowali",
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
      text: "Typowy sondaż",
      points: "Punktacja odpowiedzi",
    },
    pollState: {
      open: "Otwarty",
      closed: "Zamknięty",
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
      nameEmailAsc: "Nazwa/Email A–Z",
      nameEmailDesc: "Nazwa/Email Z–A",
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
    anonBadgeTitle: "Anonimowe głosy: {count}.",
    votesBadgeLabel: "Głosy",
    empty: {
      polls: "Brak sondaży do pokazania.",
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
    shareLockedHint: "Zagłosowane — usuń głos, aby odblokować.",
    shareStatusLabel: "Status",
    shareStatusMissing: "Brak",
    shareHintMissing: "Brak",
    errors: {
      mailSend: "Nie udało się wysłać maila.",
      mailSession: "Brak aktywnej sesji do wysyłki maila.",
      declineTask: "Nie udało się odrzucić zadania.",
      invalidEmail: "Niepoprawny e-mail.",
      unknownUser: "Nie znam takiej nazwy użytkownika.",
      invite: "Nie udało się zaprosić.",
      resend: "Nie udało się ponowić zaproszenia.",
      inviteMailFailed: "Zaproszenie zapisane, ale wysyłka maila nie powiodła się.",
      resendMailFailed: "Ponowienie zapisane, ale wysyłka maila nie powiodła się.",
      removeSubscriber: "Nie udało się usunąć subskrybenta.",
      acceptSubscription: "Nie udało się zaakceptować zaproszenia.",
      updateSubscription: "Nie udało się zaktualizować subskrypcji.",
      loadSubscribers: "Nie udało się pobrać subskrybentów.",
      shareSave: "Nie udało się zapisać udostępnienia.",
      loadDetails: "Nie udało się pobrać szczegółów.",
      deleteVote: "Nie udało się usunąć głosu.",
      loadHub: "Nie udało się pobrać danych centrum sondaży.",
    },
    statusMsg: {
      inviteSaved: "Zaproszenie zapisane.",
      mailSending: "Wysyłam mail…",
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
      focusTask: "Masz zadanie do wykonania. Chcesz przejść do głosowania?",
      focusSub: "Masz zaproszenie do subskrypcji. Chcesz je zaakceptować?",
    },
    pollFallback: "sondażu",
    pollNameLabel: "„{name}”",
    ownerFallback: "Użytkownik Familiady",
    mail: {
      subtitle: "Centrum sondaży",
      subscriptionTitle: "Zaproszenie do subskrypcji od użytkownika {owner}",
      subscriptionBody:
        "Użytkownik <strong>{owner}</strong> zaprasza Cię do subskrypcji. Kliknij przycisk, aby zobaczyć zaproszenie.",
      subscriptionAction: "Zobacz zaproszenie",
      taskTitle: "Zaproszenie do głosowania",
      taskSubject: "Zaproszenie do głosowania — {name}",
      taskBody: "Użytkownik <strong>{owner}</strong> zaprasza Cię do udziału w {name}.",
      taskAction: "Przejdź do głosowania",
      ignoreNote: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      linkHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      autoNote: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    pollReadyAlert: "Dokończ grę w Moich grach",
    resendCooldownAlert: "Ponowne wysłanie zaproszenia możliwe za {hours} godz.",
    shareCooldownAlert: "Ponowne zaproszenie do głosowania możliwe za {hours} godz.",
  },

  pollsHubSubscriptions: {
    dash: "-",
    title: "Familiada — centrum sondaży",
    backToGames: "← Moje gry",
    logout: "Wyloguj",
    header: {
      title: "Centrum sondaży",
      hint: "Zarządzaj sondażami oraz zaproszeniami do głosowania.",
    },
    tabs: {
      polls: "Sondaże",
      subscriptions: "Subskrypcje",
      tasks: "Zadania",
      subscribersMobile: "Subskryb.",
      subscriptionsMobile: "Subskryp.",
    },
    sections: {
      myPolls: "Moje sondaże",
      selectHint: "Kliknij kafelek, aby go zaznaczyć.",
      tasks: "Zadania",
      tasksHint: "Dwuklik otwiera głosowanie.",
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
      placeholder: "Email lub nazwa użytkownika",
      button: "Zaproś",
    },
    share: {
      title: "Udostępnij sondaż",
      subtitle: "Wybierz subskrybentów, którym chcesz wysłać zadanie.",
      save: "Zapisz udostępnienie",
      close: "Zamknij",
    },
    details: {
      title: "Szczegóły głosowania",
      titleWithName: "Szczegóły głosowania — {name}",
      subtitle: "Usuń głos powiązany z zadaniem, jeśli to konieczne.",
      voted: "Zagłosowali",
      pending: "Nie zagłosowali",
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
      text: "Typowy sondaż",
      points: "Punktacja odpowiedzi",
    },
    pollState: {
      open: "Otwarty",
      closed: "Zamknięty",
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
      nameEmailAsc: "Nazwa/Email A–Z",
      nameEmailDesc: "Nazwa/Email Z–A",
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
    anonBadgeTitle: "Anonimowe głosy: {count}.",
    votesBadgeLabel: "Głosy",
    empty: {
      polls: "Brak sondaży do pokazania.",
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
    shareLockedHint: "Zagłosowane — usuń głos, aby odblokować.",
    shareStatusLabel: "Status",
    shareStatusMissing: "Brak",
    shareHintMissing: "Brak",
    errors: {
      mailSend: "Nie udało się wysłać maila.",
      mailSession: "Brak aktywnej sesji do wysyłki maila.",
      declineTask: "Nie udało się odrzucić zadania.",
      invalidEmail: "Niepoprawny e-mail.",
      unknownUser: "Nie znam takiej nazwy użytkownika.",
      invite: "Nie udało się zaprosić.",
      resend: "Nie udało się ponowić zaproszenia.",
      inviteMailFailed: "Zaproszenie zapisane, ale wysyłka maila nie powiodła się.",
      resendMailFailed: "Ponowienie zapisane, ale wysyłka maila nie powiodła się.",
      removeSubscriber: "Nie udało się usunąć subskrybenta.",
      acceptSubscription: "Nie udało się zaakceptować zaproszenia.",
      updateSubscription: "Nie udało się zaktualizować subskrypcji.",
      loadSubscribers: "Nie udało się pobrać subskrybentów.",
      shareSave: "Nie udało się zapisać udostępnienia.",
      loadDetails: "Nie udało się pobrać szczegółów.",
      deleteVote: "Nie udało się usunąć głosu.",
      loadHub: "Nie udało się pobrać danych centrum sondaży.",
    },
    statusMsg: {
      inviteSaved: "Zaproszenie zapisane.",
      mailSending: "Wysyłam mail…",
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
      focusTask: "Masz zadanie do wykonania. Chcesz przejść do głosowania?",
      focusSub: "Masz zaproszenie do subskrypcji. Chcesz je zaakceptować?",
    },
    pollFallback: "sondażu",
    pollNameLabel: "„{name}”",
    ownerFallback: "Użytkownik Familiady",
    mail: {
      subtitle: "Subskrypcje",
      subscriptionTitle: "Zaproszenie do subskrypcji od użytkownika {owner}",
      subscriptionBody:
        "Użytkownik <strong>{owner}</strong> zaprasza Cię do subskrypcji. Kliknij przycisk, aby zobaczyć zaproszenie.",
      subscriptionAction: "Zobacz zaproszenie",
      taskTitle: "Zaproszenie do głosowania",
      taskSubject: "Zaproszenie do głosowania — {name}",
      taskBody: "Użytkownik <strong>{owner}</strong> zaprasza Cię do udziału w {name}.",
      taskAction: "Przejdź do głosowania",
      ignoreNote: "Jeśli to nie Ty, zignoruj tę wiadomość.",
      linkHint: "Link nie działa? Skopiuj i wklej do przeglądarki:",
      autoNote: "Wiadomość automatyczna — prosimy nie odpowiadać.",
    },
    pollReadyAlert: "Dokończ grę w Moich grach",
    resendCooldownAlert: "Ponowne wysłanie zaproszenia możliwe za {hours} godz.",
    shareCooldownAlert: "Ponowne zaproszenie do głosowania możliwe za {hours} godz.",
  },
  logoEditor: {
    title: "Familiada — edytor logo",
    topbar: {
      backToGames: "← Moje gry",
      logout: "Wyloguj",
    },
    list: {
      title: "Twoje logo",
      hint: "Kliknij kafelek, żeby go zaznaczyć.",
      preview: "Podgląd",
      activate: "Aktywuj",
      export: "Export",
      import: "Import",
      delete: "Usuń",
      deleteDisabled: "Nie można usunąć",
      activeLabel: "Aktywne",
    },
    editor: {
      nameLabel: "Nazwa",
      namePlaceholder: "Np. Moje logo",
      save: "Zapisz",
      newLogoPrefix: "Nowe logo — ",
    },
    modes: {
      text: "Napis",
      textPix: "Tekst",
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
      fixInvalidChars: "Popraw niedozwolone znaki.",
      fixTooWide: "Napis się nie mieści — skróć tekst.",
    },
    textPix: {
      font: "Czcionka",
      systemFont: "Systemowa",
      searchPlaceholder: "Szukaj czcionki…",
      searchClear: "Wyczyść",
      emptyResults: "Brak wyników",
      size: "Rozmiar",
      lineHeight: "Interlinia",
      letterSpacing: "Odstęp",
      paddingTop: "Góra",
      paddingBottom: "Dół",
      boldTitle: "Pogrubienie",
      italicTitle: "Kursywa",
      underlineTitle: "Podkreślenie",
      alignTitle: "Wyrównanie",
      invert: "Odwróć (białe tło)",
      preview: "Podgląd",
      placeholder: "Wpisz tekst…",
      tooltips: {
        bold: "Pogrubienie",
        italic: "Kursywa",
        underline: "Podkreślenie",
        alignCycle: "Wyrównanie (cyklicznie)",
        alignCycleExtra: "Klikaj: lewo → środek → prawo",
      },
      errors: {
        fontsLoad: "Nie mogę wczytać fonts.json",
        fontsInvalid: "fonts.json nie jest tablicą",
        fontsLoadFailed: "Błąd ładowania fontów",
      },
      warnings: {
        clipped: "Wygląda na ucięte — zmniejsz rozmiar albo skróć tekst.",
        screenshotFailed: "Nie mogę zrobić screena edytora (sprawdź TinyMCE/html2canvas w HTML).",
      },
    },
    draw: {
      colors: {
        black: "czarny",
        white: "biały",
      },
      aria: {
        strokeColor: "Kolor obramowania: {color}",
        backgroundColor: "Tło sceny: {color}",
      },
      tooltips: {
        select: "Wskaźnik (zaznacz / przesuń)",
        pan: "Ręka (przesuwanie)\nSpace (przytrzymaj)",
        zoomIn: "Powiększ",
        zoomOut: "Pomniejsz",
        color: "Kolor narzędzia (obramowania)",
        background: "Tło sceny (czarne/białe)",
        brush: "Pędzel\nB",
        eraser: "Gumka\nE",
        line: "Linia\nL",
        rect: "Prostokąt\nR",
        ellipse: "Elipsa\nO",
        poly: "Wielokąt\nP",
        undo: "Cofnij",
        redo: "Ponów",
        settings: "Ustawienia narzędzia",
        polyDone: "Zakończ wielokąt\nEnter / dwuklik",
        clear: "Wyczyść",
        preview: "Podgląd",
      },
      errors: {
        missingFabric: "Brak Fabric.js (script nie wczytany).",
      },
      tools: {
        brush: "Pędzel",
        eraser: "Gumka",
        line: "Linia",
        rect: "Prostokąt",
        ellipse: "Elipsa",
        poly: "Wielokąt",
        pan: "Ręka",
        select: "Wskaźnik",
      },
      noSettings: "To narzędzie nie ma ustawień.",
      stroke: "Grubość",
      fill: "Wypełnij",
      fillColor: "Kolor wypełnienia",
      settingsTitle: "Ustawienia — {tool}",
      confirmClear: "Wyczyścić wszystko?",
    },
    image: {
      pickImage: "Wybierz obraz 📁",
      brightness: "Jasność",
      contrast: "Kontrast",
      gamma: "Gamma",
      black: "Czerń",
      white: "Biel",
      dither: "Dither",
      invert: "Odwróć",
      reset: "Reset",
      displayArea: "Obszar wyświetlacza",
      previewTitle: "Podgląd jak na wyświetlaczu",
      previewHint: "Kliknij podgląd, żeby otworzyć pełny ekran.",
      brightnessValue: "Jasność: {value}",
      contrastValue: "Kontrast: {value}",
      gammaValue: "Gamma: {value}",
      blackValue: "Czerń: {value}",
      whiteValue: "Biel: {value}",
      ditherValue: "Dither: {value}",
      loadError: "Nie udało się wczytać obrazu.",
    },
    create: {
      title: "Nowe logo",
      subtitle: "Wybierz tryb tworzenia.",
      textTitle: "Napis",
      textSubtitle: "Font jak w klasycznym logo Familiady",
      textPixTitle: "Tekst",
      textPixSubtitle: "Tekst jak w edytorze tekstu",
      drawTitle: "Rysunek",
      drawSubtitle: "Można rysować dowolnie",
      imageTitle: "Obraz",
      imageSubtitle: "Import obrazów użytkownika",
    },
    preview: {
      title: "Podgląd",
      subtitle: "Tak będzie wyglądać logo na wyświetlaczu",
    },
    common: {
      close: "Zamknij",
    },
    import: {
      title: "IMPORT…",
      subtitle: "Nie zamykaj strony. Trwa import.",
      steps: {
        readFile: "Czytam plik…",
        validate: "Sprawdzam JSON…",
        saveDb: "Zapisuję w bazie…",
        refresh: "Odświeżam listę…",
      },
      messages: {
        validation: "Walidacja formatu",
        creatingRecord: "Tworzenie nowego rekordu",
        done: "Gotowe",
      },
    },
    export: {
      title: "EXPORT…",
      subtitle: "Nie zamykaj strony. Trwa przygotowanie pliku.",
      steps: {
        prepare: "Przygotowuję dane…",
        createFile: "Tworzę plik…",
        download: "Pobieranie…",
      },
      messages: {
        browserPrompt: "Przeglądarka może zapytać o zapis",
      },
    },
    status: {
      saving: "Zapisuję…",
      saved: "Zapisano.",
      updated: "Zaktualizowano zapis.",
      fixingName: "Poprawiam nazwę i zapisuję ponownie…",
      deleting: "Usuwam…",
      deleted: "Usunięto.",
      imported: "Zaimportowano logo.",
      settingActive: "Ustawiam aktywne…",
      activeSet: "Aktywne ustawione.",
    },
    errors: {
      saveFailed: "Nie mogę zapisać.",
      saveFailedDetailed: "Nie udało się zapisać.\n\n{error}",
      saveError: "Błąd zapisu.",
      importFailedDetailed: "Nie udało się zaimportować.\n\n{error}",
      exportFailedDetailed: "Nie udało się wyeksportować.\n\n{error}",
      setActiveFailedDetailed: "Nie udało się ustawić aktywnego.\n\n{error}",
      fontsLoad: "Nie mogę wczytać fontów. Sprawdź ścieżki display/font_*.json.",
      invalidJson: "To nie jest poprawny JSON.",
      pixSize: "Zły rozmiar PIX. Oczekuję {expectedW}×{expectedH}, a jest {actualW}×{actualH}.",
      missingBits: "Brak bits_b64 w imporcie.",
      unknownImportFormat:
        "Nieznany format importu. Oczekuję kind=GLYPH albo kind=PIX (lub type zawierający GLYPH/PIX).",
      noUser: "Brak zalogowanego użytkownika.",
      invalidPixFormat: "Niepoprawny format PIX.",
      unknownLogoFormat: "Nieznany format importu logo.",
      demoImportFiles: "demoImport4Logos wymaga dokładnie 4 pliki.",
      deleteFailed: "Nie udało się usunąć.\n\n{error}",
    },
    defaults: {
      logoName: "Domyślne logo",
      logoFileName: "logo",
      unnamed: "(bez nazwy)",
    },
    confirm: {
      closeUnsaved: "Jeśli teraz zamkniesz, zmiany nie zostaną zapisane.",
      backUnsaved: "Masz niezapisane zmiany. Cofnąć i je utracić?",
      deleteLogo: "Usunąć logo „{name}“?",
      logoutUnsaved: "Masz niezapisane zmiany. Wylogować i je utracić?",
    },
  },
  baseExplorer: {
    title: "Menadżer bazy pytań",
    headerTitle: "Menadżer bazy pytań",
    backToBases: "← Moje bazy",
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
      typePollText: "Typowy sondaż",
      typePollPoints: "Punktacja",
      typePrepared: "Preparowany",
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
        createFailed: "Nie udało się utworzyć gry (szczegóły w pasku progresu / konsoli).",
      },
      progress: {
        creatingGame: "Tworzenie gry…",
        exporting: "Eksport…",
        done: "Gotowe ✅",
        created: "Utworzono grę.",
        error: "Błąd ❌",
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
      pointsPlaceholder: "(opcjonalnie)",
      errors: {
        maxAnswers: "Max 6 odpowiedzi.",
        pointsRange: "Punkty muszą być w zakresie 0–100 (jeśli wpisane).",
        sumExceeded: "Suma punktów nie może przekroczyć 100.",
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
};

export default pl;
