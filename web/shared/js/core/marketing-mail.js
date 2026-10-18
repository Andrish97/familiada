import { renderRichMailDocument } from "./mail-document.js?v=v2026-10-14T23162";

// Treść kampanii pozostaje edytowalnym HTML. Podgląd i wysyłka mają jeden dokument.
export function buildMarketingMailHtml({ template, subject, bodyHtml = '' }) {
  const invitation = template === 'invitation';
  const invitationBody = `
    <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.9)">Dzień dobry,</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)"><strong style="color:#fff">Familiada Online</strong> pomaga przygotować pytania, zebrać odpowiedzi i poprowadzić grę podczas wydarzenia. Możesz ułożyć własny zestaw albo zacząć od gotowej gry społeczności.</p>
    <div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div>
    <h2 style="margin:0 0 8px;font-size:16px;color:#ffeaa6">Przygotuj grę po swojemu</h2>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:rgba(255,255,255,.78)">Dodaj pytania i odpowiedzi, użyj materiałów z Baz pytań albo wybierz zestaw przygotowany przez społeczność. Dopasuj drużyny, wygląd planszy, dźwięki i logo do wydarzenia.</p>
    <h2 style="margin:0 0 8px;font-size:16px;color:#ffeaa6">Zbierz odpowiedzi przed grą</h2>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:rgba(255,255,255,.78)">W ankiecie tekstowej goście wpisują odpowiedzi, a w Punktacji wybierają spośród podanych propozycji. Udostępnij link lub kod QR; możesz też wysłać wybranym osobom zadanie głosowania.</p>
    <h2 style="margin:0 0 8px;font-size:16px;color:#ffeaa6">Poprowadź rozgrywkę na żywo</h2>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:rgba(255,255,255,.78)">Panel sterowania prowadzi przez rundy i finał, a Wyświetlacz pokazuje planszę na telewizorze lub rzutniku. Widok prowadzącego i Przycisk do pojedynku możesz podłączyć, jeśli przydadzą się podczas wydarzenia.</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">Możesz zacząć jako gość. Korzystanie z własnych materiałów na różnych urządzeniach i udostępnianie ich znajomym jest wygodniejsze po zalogowaniu.</p>
    <p style="margin:0 0 18px;font-size:14px;color:rgba(255,255,255,.88)">Pozdrawiam,<br/>Twórca familiada.online</p>`;
  return renderRichMailDocument({
    lang: 'pl', title: subject, subtitle: 'familiada.online',
    bodyHtml: invitation ? invitationBody : String(bodyHtml || ''),
    actionLabel: invitation ? 'Poznaj system familiada.online' : '',
    actionUrl: invitation ? 'https://familiada.online' : '',
    ignoreNote: `${invitation ? 'Wiadomość ma charakter informacyjny i została wysłana jednorazowo do osób związanych z branżą eventową. ' : ''}W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.`,
    footerText: 'Familiada Online — bezpłatny system.\nWysłano z kontakt@familiada.online',
    footerLinks: [{ label: 'familiada.online', url: 'https://familiada.online' }],
  });
}
