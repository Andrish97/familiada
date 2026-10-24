// Tłumaczenia EN — część „questionForm”.
const en = {
  questionForm: {
    addAnswer: "Add answer",
    answerLimit: "Answer limit reached",
    deleteAnswer: "Delete answer",
    sumLabel: "Total",
    answersHeading: "Answers",
    pointsSuffix: "pts",
    confirmDiscard: "Discard unsaved changes to this question?",
    keepEditing: "Keep editing",
    discard: "Discard",
    saveFailed: "Could not save the question. Try again.",
    hints: {
      answerLimit: "At most {max} characters. Longer ones will be cut.",
      finalDisplay: "In the final the display fits {final} characters. Longer answers will be shortened there.",
    },
    errors: {
      textEmpty: "Question text cannot be empty.",
      answerEmpty: "Answer {ord} cannot be empty.",
      answersMin: "A question needs at least {min} answers (has {count}).",
      answersMax: "Max {max} answers.",
      answerMinPoints: "Each answer needs at least {min} points (answer {ord}).",
      sumOver: "Points total cannot exceed {max} (is {sum}).",
      answerChars: "Answer {ord} contains characters the Display does not have: {chars}. Remove them to save the answer.",
    },
  },
};

export default en;
