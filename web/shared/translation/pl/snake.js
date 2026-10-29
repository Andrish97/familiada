// Tłumaczenia PL — część „snake”.
const pl = {
  snake: {
    title: "Familijna — wąż",
    boardLabel: "Plansza Wyświetlacza z grą w węża",
    keysHint: "Strzałki albo WASD, spacja albo kliknięcie planszy — pauza.",
    progressAccount: ({ best, games }) => `Rekord na koncie: ${best} · gry: ${games}`,
    progressLocal: "Zaloguj się, by zapisać rekord",
    login: "Zaloguj się",
    accountLabel: "Konto",
    home: "Familijna",
    rotateMessage: "Obróć telefon poziomo — wąż jeździ po całym Wyświetlaczu.",
    board: {
      title: "WĄŻ FAMILIJNEJ",
      press: "NACIŚNIJ STRZAŁKĘ",
      swipe: "PRZESUŃ PALCEM",
      click: "KLIK = PAUZA",
      tap: "STUKNIJ = PAUZA",
      over: "KONIEC GRY",
      won: "CAŁA PLANSZA!",
      score: ({ score }) => `WYNIK: ${score}`,
      record: "NOWY REKORD!",
      again: "STRZAŁKA = JESZCZE RAZ",
      againTouch: "PRZESUŃ = JESZCZE RAZ",
    },
    long: { score: "WYNIK", best: "REKORD", paused: "PAUZA", bonus: ({ points }) => `BONUS +${points}` },
  },
};

export default pl;
