// Raport moderatora: wynik pełny, niepełny i niedostępny mają różne komunikaty.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const exactCopy = report => Boolean(report?.matches?.some(match => match.exact_content));
export const needsReview = report => !report?.semantic?.complete || Boolean(report?.matches?.length);
export function uniquenessSummary(report) {
  if (!report) return 'Nie sprawdzono podobieństwa.';
  if (exactCopy(report)) return 'Dokładna kopia opublikowanej lub zgłoszonej gry.';
  const top = report.matches?.[0];
  if (top) return `Podobne pytania: ${top.matched_questions}/${report.question_count} · ${top.title}`;
  return report.semantic?.complete ? 'Nie znaleziono kopii ani istotnej zbieżności pytań i odpowiedzi.' : 'Brak zbieżności tekstowych; porównanie znaczenia jest niepełne.';
}
export function uniquenessReportHtml(report) {
  if (!report?.ok) return '<p class="callout callout--bad">Nie udało się sprawdzić podobieństwa. Spróbuj ponownie.</p>';
  const s = report.semantic || {};
  const semantic = s.complete
    ? `Porównanie znaczenia pytań i odpowiedzi: ${Number(s.corpus_indexed) || 0}/${Number(s.corpus_total) || 0} pytań w katalogu; sprawdzono wszystkie pytania tej gry.`
    : `Porównanie znaczenia jest ${s.status === 'unavailable' ? 'niedostępne' : 'niepełne'}. Gotowe pytania katalogu: ${Number(s.corpus_indexed) || 0}/${Number(s.corpus_total) || 0}; tej gry: ${Number(s.source_indexed) || 0}/${Number(s.source_total) || 0}. Wynik obejmuje sprawdzenie dokładnych kopii i tekstu.`;
  const methods = { exact_question: 'to samo pytanie', semantic: 'zbliżone znaczenie', semantic_and_answers: 'zbliżone znaczenie pytania z odpowiedziami', text_and_answers: 'podobny tekst lub odpowiedzi' };
  const matches = (report.matches || []).map(match => `<details class="uniqueness-match">
    <summary>${match.exact_content ? 'Dokładna kopia' : `Zbieżne pytania: ${Number(match.matched_questions) || 0}/${Number(report.question_count) || 0}`} · ${esc(match.title)} · ${esc(String(match.lang || '').toUpperCase())}</summary>
    <ol>${(match.question_pairs || []).map(pair => `<li><div class="uniqueness-pair"><div><p><strong>Pytanie ${Number(pair.source_pos) || 0}</strong><br>${esc(pair.source_text)}</p>${pair.source_answers?.length ? `<p class="hint">Odpowiedzi: ${esc(pair.source_answers.join(", "))}</p>` : ""}</div><div><p><strong>W porównywanej grze: ${Number(pair.candidate_pos) || 0}</strong><br>${esc(pair.candidate_text)}</p>${pair.candidate_answers?.length ? `<p class="hint">Odpowiedzi: ${esc(pair.candidate_answers.join(", "))}</p>` : ""}</div></div><p class="hint">${esc(methods[pair.method] || 'porównanie tekstu')}</p></li>`).join('')}</ol>
  </details>`).join('');
  return `<div class="stack"><p class="callout ${exactCopy(report) ? 'callout--bad' : 'callout--info'}">${esc(uniquenessSummary(report))}</p><p class="hint">${esc(semantic)}</p>${matches}</div>`;
}
export function uniquenessErrorMessage(code) {
  return code === 'duplicate_content' ? 'Taki zestaw pytań i odpowiedzi został już zgłoszony lub opublikowany. Zmiana tytułu, kolejności albo punktów nie tworzy nowej gry.' : code;
}
