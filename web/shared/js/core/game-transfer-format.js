// The existing .famgame definition is also the snapshot used for a sent copy.
// Runtime state, ownership, settings, contacts and files are outside this format.
export function gameTransferType(value) {
  return ['poll_text', 'poll_points', 'prepared'].includes(String(value || '')) ? String(value) : 'poll_text';
}
export function gameExportSnapshot(game, questions, fallbackName) {
  const type = gameTransferType(game?.type);
  const status = String(game?.status || '').trim().toLowerCase();
  const exportType = status === 'ready' && type !== 'prepared' ? 'prepared' : type;
  return {
    game: { name: game?.name ?? fallbackName, type: exportType },
    questions: (questions || []).map(question => ({
      text: question.text,
      answers: exportType === 'poll_text' ? [] : (question.answers || [])
        .map((answer, index) => ({ answer, index }))
        .sort((a, b) => {
          const ao = Number(a.answer?.ord);
          const bo = Number(b.answer?.ord);
          return Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo
            ? ao - bo : a.index - b.index;
        })
        .map(({ answer }) => ({
        text: answer.text,
        fixed_points: exportType === 'poll_points' && status === 'draft' ? 0 : Number(answer.fixed_points) || 0,
      })),
    })),
  };
}
