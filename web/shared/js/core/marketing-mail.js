import { renderRichMailDocument } from "./mail-document.js?v=v2026-10-25T17340";


// Treść kampanii pozostaje edytowalnym HTML. Podgląd i wysyłka mają jeden dokument.
export function buildMarketingMailHtml({ template, subject, bodyHtml = '' }) {
  const invitation = template === 'invitation';
  // Kadry z systemu zrzutów (scripts/screens), te same co na stronie głównej;
  // wersja podglądu (960 px) wystarcza dla maila szerokiego na 516 px.
  const IMG_BASE = 'https://familiada.online/assets/img/pl/shots';
  // Pierwszy obraz: grafika OG strony w wersji do maila (og-image-mail.webp,
  // odświeżana razem z og-image przez scripts/screens/publish-homepage.cjs).
  const OG_IMG = 'https://familiada.online/assets/img/og/og-image-mail.webp?v=v2026-10-25T17340';
  const invitationBody = `<p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.9)">Dzień dobry,</p><p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">chcę tylko dać znać, że istnieje <strong style="color:#fff">familiada.online</strong> — darmowy system, z którego mogą Państwo korzystać przy swoich wydarzeniach i zajęciach z grupami. <strong style="color:#fff">To nie jest oferta handlowa:</strong> niczego nie sprzedaję, system jest bezpłatny i nie ma płatnych wersji.</p><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tbody><tr><td><img src="${OG_IMG}" width="516" alt="Familiada Online — tablica gry z wynikami drużyn" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr></tbody></table><p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">Grę w stylu telewizyjnej „Familiady” prowadzi się w przeglądarce, bez instalowania aplikacji i bez zakładania konta: wystarczy komputer do sterowania i telewizor lub rzutnik dla uczestników. Własne logo, kolory i dźwięki ustawia się przed grą.</p><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tbody><tr><td style="padding:0 0 8px"><img src="${IMG_BASE}/control-round-preview.webp?v=v2026-10-25T17340" width="516" alt="Panel sterowania rozgrywką" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Panel sterowania</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Prowadzi przez rundy, pojedynki i finał: odsłanianie odpowiedzi, błędy, punkty i dźwięki jednym kliknięciem.</td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px"><tbody><tr><td style="padding:0 0 8px"><img src="${IMG_BASE}/host-round-preview.webp?v=v2026-10-25T17340" width="516" alt="Widok prowadzącego" style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/></td></tr><tr><td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">Widok prowadzącego i Przycisk do pojedynku</td></tr><tr><td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">Prowadzący widzi pytania i odpowiedzi na telefonie lub tablecie, a drużyny zgłaszają się do pojedynku przyciskiem w telefonie. Urządzenia podłącza się kodem QR.</td></tr></tbody></table><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);padding:14px;border-radius:12px"><p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#ffeaa6">Pytania na trzy sposoby</p><p style="margin:0;font-size:12px;color:rgba(255,255,255,.7);line-height:1.6">• gotowe gry z Gier Społeczności — dodaje się je do swojej biblioteki i można od razu grać;<br/>• własne pytania i odpowiedzi, które można zachować w Bazach pytań;<br/>• ankieta wśród gości przed wydarzeniem — link lub kod QR, odpowiedzi z telefonów, punkty liczą się same.</p></div><div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div><p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">Jeśli system się przyda — wystarczy wejść na stronę i zacząć. Będę też wdzięczny za krótką opinię.</p><p style="margin:0 0 18px;font-size:14px;color:rgba(255,255,255,.88)">Pozdrawiam,<br/>Twórca familiada.online</p>`;

  return renderRichMailDocument({
    lang: 'pl', title: subject, subtitle: 'familiada.online',
    bodyHtml: invitation ? invitationBody : String(bodyHtml || ''),
    actionLabel: invitation ? 'Poznaj system familiada.online' : '',
    actionUrl: invitation ? 'https://familiada.online' : '',
    ignoreNote: `${invitation ? 'Wiadomość ma charakter wyłącznie informacyjny (nie jest ofertą) i została wysłana jednorazowo. ' : ''}W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną na adres kontakt@familiada.online.`,
    // Zapasowy link przycisku ma podpis jak w innych mailach -- bez niego ramka
    // z adresem strony wyglądała na adres do odpowiedzi.
    linkHint: invitation ? 'Link nie działa? Skopiuj i wklej do przeglądarki:' : '',
    footerText: 'Familiada Online — bezpłatny system.\nWysłano z kontakt@familiada.online',
    footerLinks: [{ label: 'familiada.online', url: 'https://familiada.online' }],
  });
}
