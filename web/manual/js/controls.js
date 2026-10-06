// Literal UI controls share one appearance across all manual sections.
// Values, status examples and keyboard shortcuts retain the plain code style.
const labels = {
  pl: ['Ustawienia rozgrywki','Wyślij nową grę do gier społeczności','Edytuj','Bazy pytań','Nowa baza','Przeglądaj','Ankiety','Udostępnij','Szczegóły','QR na wyświetlaczu','Podłącz urządzenie','Podłącz','Subskrypcje','Zaproś','Logo','Ankieta','Graj','Dalej','Przejdź do finału','Zakończ finał','Nie używaj tabletu prowadzącego','Przycisk fizyczny','Drużyna A','Drużyna B','Zatwierdź','Gotowe — przejdź do rozgrywki','Rozpocznij grę','Losuj ponownie','Zmień ustawienia','Rozpocznij rundę','Ponów naciśnięcie','Przejdź do zakończenia gry','Rozpocznij finał','Rozpocznij 2 rundę','Powtórzenie','Zakończ grę','Nie ma na liście (0 pkt)','Przywróć domyślne','Wybierz plik','Zapisz wszystko','Gry Społeczności','Dodaj do biblioteki','Moje wysłane'],
  en: ['Game settings','My submitted games','Edit','Question bases','New base','Browse','Polls','Share','Details','QR on display','Connect device','Connect','Subscriptions','Invite','Logo','Poll','Play','Next','Go to the final','Finish final','No host tablet','Physical buzzer','Team A','Team B','Confirm','Done — start the game','Start game','Reshuffle','Change settings','Start','Retry','Go to end of game','Repeat','Finish game','Not on the list (0 pts)','Restore defaults','Choose file','Save all','Community Games','Add to library','My submissions','Submit a new game'],
  uk: ['Налаштування гри','Мої надіслані ігри','Редагувати','Бази запитань','Нова база','Перегляд','Переглянути','Опитування','Поділитися','Деталі','QR на дисплеї','Підключити пристрій','Підключити','Підписки','Запросити','Лого','Грати','Далі','Перейти до фіналу','Завершити фінал','Без планшета ведучого','Фізична кнопка','Команда A','Команда B','Підтвердити','Готово — почати гру','Розпочати гру','Перемішати ще раз','Змінити налаштування','Розпочати','Старт','Повторити','Перейти до завершення гри','Повтор','Завершити гру','Немає в списку (0 балів)','Відновити типові','Вибрати файл','Зберегти все','Ігри Спільноти','Додати до бібліотеки','Мої надіслані','Надіслати нову гру'],
};
const buttons = Object.fromEntries(Object.entries(labels).map(([lang,values])=>[lang,new Set(values)]));

export function isManualButton(text, lang, {hasIcon=false, context=''}={}) {
  const value=String(text||'').replace(/\s+/g,' ').trim();
  if (/wypowiedziane przez zawodnika|contestant saying|слово.*від учасника/i.test(context)) return false;
  return hasIcon || !!buttons[lang]?.has(value);
}

export function decorateManualControls(root, lang) {
  // Older sections sometimes mark a button reference as bold text.
  for (const element of root.querySelectorAll('.m-doc .m-strong, .m-doc b, .m-doc strong')) {
    const context=element.closest('p,li')?.textContent||'';
    if (/przycisk|\bbuttons?\b|кноп|kliknij|naciśnij|\bclick\b|\bpress\b|натис|відкрий|\bopen\b/i.test(context)
        && isManualButton(element.textContent,lang,{context})) {
      element.classList.remove('m-strong');
      element.classList.add('m-code');
    }
  }
  for (const element of root.querySelectorAll('.m-doc .m-code')) {
    element.classList.toggle('m-control',isManualButton(element.textContent,lang,{
      hasIcon:!!element.querySelector('svg.ico,[data-icon]'),
      context:element.closest('p,li')?.textContent||'',
    }));
  }
}
