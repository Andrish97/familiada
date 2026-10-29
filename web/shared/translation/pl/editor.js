// Tłumaczenia PL — część „editor”.
const pl = {
  editor: {
    pageTitlePrefix: "Edytor gry",
    title: "Familijna — edytor gry",
    backToQuestions: "Wstecz",
    gameNamePlaceholder: "Nazwa gry",
    questionsTitle: "Pytania",
    importHint: "Import działa z pliku TXT albo z wklejonej treści.",
    importBtn: "Importuj",
    empty: "Wybierz pytanie z listy lub dodaj nowe.",
    questionLabel: "Treść pytania",
    importModal: {
      invalidChars: "Pytanie {q}, odpowiedź {ord}: znaki, których nie ma Wyświetlacz: {chars}. Usuń je, aby zaimportować.",
      title: "Import pytań",
      subtitle:
        "Możesz <b>wkleić treść</b> albo <b>wczytać plik TXT</b>. Opcjonalnie na początku dodaj linię <b>@Nazwa gry</b>. Pytania zaczynają się od <b>#</b>. Odpowiedzi mogą mieć numer. Punkty po <b>/</b> są opcjonalne (w ankietach mogą być ignorowane).",
      placeholder:
        "@Moja gra\n#Zwierzeta w Afryce\n1 Słoń /29\n2 Lew /19\n3 Małpa /16\n\n#Drugie pytanie\n1 Odpowiedź 1\n2 Odpowiedź 2\n3 Odpowiedź 3",
      formatHint:
        "Działa też format bez numerów (po prostu linie z odpowiedziami). Import toleruje spacje/taby, „1.”, „2)” itp. Jeśli odpowiedź ma więcej niż 17 znaków, zostanie ucięta.",
      previewLabel: "Podgląd importu",
      previewTitle: "Podgląd na żywo",
      previewEmpty: "Wpisz pytania, aby zobaczyć podgląd.",
      previewSummary: "{questions} pytań · {answers} odpowiedzi",
      previewError: "Popraw format, aby zobaczyć podgląd: {error}",
      previewMore: "i {count} kolejnych pytań",
      confirm: "Importuj",
    },
    defaultGameName: "Nowa gra",
    defaults: {
      question: "Pytanie {ord}",
      answer: "ODP {ord}",
    },
    actions: {
      delete: "Usuń",
      addQuestion: "Dodaj pytanie",
    },
    labels: {
      questionNumber: "Pytanie {ord}",
      questionsOnly: "Tylko pytania",
      answersSum: "{count}/{max} odpowiedzi • suma {sum}/{sumMax}",
      answersCount: "{count}/{max} odpowiedzi",
    },
    config: {
      pollText: {
        title: "Ankieta tekstowa",
        hintTop: "Ankietę uruchomisz, gdy:",
        hintBottom: "Odpowiedzi wpiszą uczestnicy ankiety.",
      },
      pollPoints: {
        title: "Punktacja",
        hintTop: "Ankietę uruchomisz, gdy:",
        hintBottom: "Punktów nie wpisujesz — policzy je ankieta z głosów uczestników.",
      },
      prepared: {
        title: "Preparowana",
        hintTop: "Gra będzie gotowa, gdy:",
      },
    },
    rules: {
      questions: "Co najmniej {min} pytań (jest {n})",
      answers: "W każdym pytaniu {min}–{max} odpowiedzi",
      minPoints: "Każda odpowiedź co najmniej {min} pkt",
      sum: "Suma punktów w pytaniu najwyżej {max}",
      where: "pytania: {list}",
    },
    status: {
      nameSaveError: "Nie udało się zapisać nazwy.",
      addQuestionError: "Błąd dodawania pytania (konsola).",
      questionDeleteError: "Błąd usuwania pytania (konsola).",
      answerAddError: "Błąd dodawania odpowiedzi (konsola).",
      answerDeleteError: "Błąd usuwania odpowiedzi (konsola).",
      answerLimitReached: "Limit odpowiedzi osiągnięty.",
      saveError: "Błąd zapisu (konsola).",
      pointsSaveError: "Błąd zapisu punktów (konsola).",
      rowGone: "Ten element został zmieniony lub usunięty w innym miejscu. Odśwież stronę.",
      loadError: "Nie udało się wczytać odpowiedzi. Spróbuj ponownie.",
      minQuestions: "Wymagane minimum: {min} (masz {count})",
      minQuestionsOk: "Minimum spełnione",
    },
    confirm: {
      deleteQuestion: "Usunąć to pytanie i wszystkie jego odpowiedzi?",
      deleteAnswer: "Usunąć tę odpowiedź?",
    },
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
      error: "Błąd: {error}",
    },
    alert: {
      missingId: "Brak identyfikatora edytora.",
      cannotEdit: "Nie można edytować w trakcie otwartej ankiety.",
      editorError: "Błąd edytora (konsola).",
      gameNotFound: "Ta gra nie istnieje albo nie masz do niej dostępu.",
    },
  },
};

export default pl;
