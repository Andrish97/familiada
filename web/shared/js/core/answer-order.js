// Presentation order for scored answer lists. Keep answers without a positive
// score at the end in their saved order; never mutate the source array.
export function sortAnswersByPoints(answers) {
  return (Array.isArray(answers) ? answers : [])
    .map((answer, index) => ({ answer, index }))
    .sort((a, b) => {
      const ap = Number(a.answer?.fixed_points);
      const bp = Number(b.answer?.fixed_points);
      const aScored = Number.isFinite(ap) && ap > 0;
      const bScored = Number.isFinite(bp) && bp > 0;
      if (aScored !== bScored) return aScored ? -1 : 1;
      if (aScored && ap !== bp) return bp - ap;
      const ao = Number(a.answer?.ord);
      const bo = Number(b.answer?.ord);
      if (Number.isFinite(ao) && Number.isFinite(bo) && ao !== bo) return ao - bo;
      if (Number.isFinite(ao) !== Number.isFinite(bo)) return Number.isFinite(ao) ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ answer }) => answer);
}
