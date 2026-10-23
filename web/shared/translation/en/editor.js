// Tłumaczenia EN — część „editor”.
const en = {
  editor: {
    pageTitlePrefix: "Game editor",
    title: "Familiada — game editor",
    backToQuestions: "Back",
    gameNamePlaceholder: "Game name",
    questionsTitle: "Questions",
    importHint: "Import works from a TXT file or pasted content.",
    importBtn: "Import",
    empty: "Select a question on the left or add a new one.",
    questionLabel: "Question text",
    importModal: {
      invalidChars: "Question {q}, answer {ord}: characters the Display does not have: {chars}. Remove them to import.",
      title: "Import questions",
      subtitle:
        "You can <b>paste text</b> or <b>load a TXT file</b>. Optionally start with <b>@Game name</b>. Questions start with <b>#</b>. Answers can include numbers. Points after <b>/</b> are optional (polls may ignore them).",
      placeholder:
        "@My game\n#Animals in Africa\n1 Elephant /29\n2 Lion /19\n3 Monkey /16\n\n#Second question\n1 Answer 1\n2 Answer 2\n3 Answer 3",
      formatHint:
        "The format also works without numbers (just answer lines). Import tolerates spaces/tabs, “1.”, “2)” etc. Answers longer than 17 characters will be trimmed.",
      previewLabel: "Import preview",
      previewTitle: "Live preview",
      previewEmpty: "Enter questions to see a preview.",
      previewSummary: "{questions} questions · {answers} answers",
      previewError: "Fix the format to see a preview: {error}",
      previewMore: "and {count} more questions",
      confirm: "Import",
    },
    defaultGameName: "New game",
    defaults: {
      question: "Question {ord}",
      answer: "ANS {ord}",
    },
    actions: {
      delete: "Delete",
      addQuestion: "Add question",
    },
    labels: {
      questionNumber: "Question {ord}",
      questionsOnly: "Questions only",
      answersSum: "{count}/{max} answers • sum {sum}/{sumMax}",
      answersCount: "{count}/{max} answers",
    },
    config: {
      pollText: {
        title: "Text poll",
        hintTop: "You can start the poll when:",
        hintBottom: "Poll respondents type the answers.",
      },
      pollPoints: {
        title: "Scoring",
        hintTop: "You can start the poll when:",
        hintBottom: "You do not enter points — the poll calculates them from respondents' votes.",
      },
      prepared: {
        title: "Prepared",
        hintTop: "The game is ready when:",
      },
    },
    rules: {
      questions: "At least {min} questions ({n} now)",
      answers: "{min}–{max} answers in every question",
      minPoints: "Each answer at least {min} points",
      sum: "At most {max} points per question",
      where: "questions: {list}",
    },
    status: {
      nameSaveError: "Failed to save name.",
      addQuestionError: "Error adding question (console).",
      questionDeleteError: "Error deleting question (console).",
      answerAddError: "Error adding answer (console).",
      answerDeleteError: "Error deleting answer (console).",
      answerLimitReached: "Answer limit reached.",
      saveError: "Save error (console).",
      pointsSaveError: "Error saving points (console).",
      rowGone: "This item was changed or deleted elsewhere. Refresh the page.",
      loadError: "Could not load answers. Try again.",
      minQuestions: "Required minimum: {min} (you have {count})",
      minQuestionsOk: "Minimum met",
    },
    confirm: {
      deleteQuestion: "Delete this question and all its answers?",
      deleteAnswer: "Delete this answer?",
    },
    import: {
      fileFailed: "Failed to read file.",
      pastePrompt: "Paste content or load a file.",
      chooseFile: "Choose a TXT file first.",
      running: "Importing…",
      errors: {
        answerBeforeQuestion: "Layout error: answer before the first question (line {line}).",
        noQuestions: "No questions. Remember lines starting with #.",
      },
      confirm:
        "TXT import will REPLACE the game contents:\n\n- removes all existing questions and answers\n- loads data from text\n\nContinue?",
      cancelled: "Cancelled.",
      error: "Error: {error}",
    },
    alert: {
      missingId: "Missing editor id.",
      cannotEdit: "Cannot edit while poll is open.",
      editorError: "Editor error (console).",
      gameNotFound: "This game does not exist or you do not have access to it.",
    },
  },
};

export default en;
