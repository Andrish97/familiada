// src/lib/contact-email.js -- contact form email templates (pure).

export function buildContactEmail(opts) {
  const { type, lang = "pl", ticket, subject, message, originalMessage, replyMessage } = opts;

  const copy = {
    pl: {
      greeting: "Witaj,",
      closing: "Pozdrawiamy,\nZespół Familiada",
      confirmation: {
        body: `Dziękujemy za kontakt. Twoje zgłoszenie zostało przyjęte.\n\nNumer zgłoszenia: ${ticket || ""}\nTemat: ${subject || ""}`,
        quote: message || "",
        mailSubject: `Potwierdzenie zgłoszenia [${ticket || ""}]`,
      },
      reply: {
        quoteLabel: `Twoje zgłoszenie [${ticket || ""}]:`,
        mailSubject: `Re: [${ticket || ""}] ${subject || ""}`,
      },
      compose: {
        mailSubject: subject || "Wiadomość od Familiada",
      },
    },
    en: {
      greeting: "Hello,",
      closing: "Best regards,\nFamiliada Team",
      confirmation: {
        body: `Thank you for reaching out. Your report has been received.\n\nTicket number: ${ticket || ""}\nSubject: ${subject || ""}`,
        quote: message || "",
        mailSubject: `Report confirmation [${ticket || ""}]`,
      },
      reply: {
        quoteLabel: `Your report [${ticket || ""}]:`,
        mailSubject: `Re: [${ticket || ""}] ${subject || ""}`,
      },
      compose: {
        mailSubject: subject || "Message from Familiada",
      },
    },
    uk: {
      greeting: "Вітаємо,",
      closing: "З повагою,\nКоманда Familiada",
      confirmation: {
        body: `Дякуємо за звернення. Ваше звернення прийнято.\n\nНомер звернення: ${ticket || ""}\nТема: ${subject || ""}`,
        quote: message || "",
        mailSubject: `Підтвердження звернення [${ticket || ""}]`,
      },
      reply: {
        quoteLabel: `Ваше звернення [${ticket || ""}]:`,
        mailSubject: `Re: [${ticket || ""}] ${subject || ""}`,
      },
      compose: {
        mailSubject: subject || "Повідомлення від Familiada",
      },
    },
  };

  const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";
  const c = copy[safeLang];
  const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

  let mailSubject = "";
  let contentHtml = "";

  if (type === "confirmation") {
    mailSubject = c.confirmation.mailSubject;
    contentHtml = `
      <p style="margin:0 0 20px">${nl2br(c.confirmation.body)}</p>
      ${c.confirmation.quote ? `<blockquote style="margin:0 0 0 0;padding:12px 16px;border-left:3px solid rgba(255,234,166,.4);background:rgba(0,0,0,.25);border-radius:0 8px 8px 0;color:rgba(255,255,255,.7);font-size:13px;white-space:pre-wrap">${esc(c.confirmation.quote)}</blockquote>` : ""}
    `;
  } else if (type === "reply") {
    mailSubject = c.reply.mailSubject;
    contentHtml = `
      ${originalMessage ? `<blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid rgba(255,234,166,.4);background:rgba(0,0,0,.25);border-radius:0 8px 8px 0;color:rgba(255,255,255,.7);font-size:13px"><strong>${esc(c.reply.quoteLabel)}</strong><br><br><span style="white-space:pre-wrap">${esc(originalMessage)}</span></blockquote>` : ""}
      <p style="margin:0">${nl2br(replyMessage || "")}</p>
    `;
  } else {
    // compose
    mailSubject = c.compose.mailSubject;
    contentHtml = `
      ${opts.reply_as ? `<blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid rgba(255,234,166,.4);background:rgba(0,0,0,.25);border-radius:0 8px 8px 0;color:rgba(255,255,255,.7);font-size:13px;white-space:pre-wrap">${esc(opts.reply_as)}</blockquote>` : ""}
      <p style="margin:0">${nl2br(message || "")}</p>
    `;
  }

  const closingLines = c.closing.split("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <style>:root{color-scheme:dark}</style>
</head>
<body style="margin:0;padding:0;background:#050914;color:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff;">
  <div style="padding:14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;margin-bottom:14px;">
    <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
    <div style="margin-top:4px;font-size:11px;opacity:.7;letter-spacing:.06em;">familiada.online</div>
  </div>
  <div style="padding:22px 20px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);">
    <p style="margin:0 0 18px;font-size:14px;opacity:.9;">${esc(c.greeting)}</p>
    ${contentHtml}
    <p style="margin:24px 0 0;font-size:14px;opacity:.7;white-space:pre-line;">${closingLines.map(esc).join("<br>")}</p>
  </div>
</div>
</body>
</html>`;

  return { subject: mailSubject, html };
}
