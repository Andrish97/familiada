// Tłumaczenia EN — część „snake”.
const en = {
  snake: {
    title: "Familiada — snake",
    boardLabel: "Display board with a snake game",
    keysHint: "Arrow keys or WASD, space or a click on the board — pause.",
    progressAccount: ({ best, games }) => `Account record: ${best} · games: ${games}`,
    progressLocal: "Log in to save your record",
    login: "Log in",
    accountLabel: "Account",
    home: "Familiada",
    rotateMessage: "Turn your phone sideways — the snake uses the whole Display.",
    board: {
      title: "FAMILIADA SNAKE",
      press: "PRESS AN ARROW",
      swipe: "SWIPE TO PLAY",
      click: "CLICK = PAUSE",
      tap: "TAP = PAUSE",
      over: "GAME OVER",
      won: "FULL BOARD!",
      score: ({ score }) => `SCORE: ${score}`,
      record: "NEW RECORD!",
      again: "ARROW = PLAY AGAIN",
      againTouch: "SWIPE = PLAY AGAIN",
    },
    long: { score: "SCORE", best: "RECORD", paused: "PAUSED", bonus: ({ points }) => `BONUS +${points}` },
  },
};

export default en;
