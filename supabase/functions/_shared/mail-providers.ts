import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export type MailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};
export type MailProvider = "brevo" | "mailgun" | "sendpulse" | "zeptomail";
export type MailDelivery = {
  to: string;
  subject: string;
  html: string;
  mode: "immediate" | "worker";
  fromEmail?: string;
  attachments?: MailAttachment[];
  plainText?: string;
  attachmentsMeta?: Array<{ filename: string; storage_path: string }>;
};

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "doc",
  "docm",
  "rtf",
  "txt",
  "csv",
  "ods",
  "xlsx",
  "xls",
  "msg",
  "pub",
  "mobi",
  "odt",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "tif",
  "tiff",
  "bmp",
  "eps",
  "cgm",
  "ppt",
  "pptx",
  "mp3",
  "m4a",
  "m4v",
  "wma",
  "ogg",
  "flac",
  "wav",
  "aif",
  "aifc",
  "aiff",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "mpeg",
  "mpg",
  "wmv",
  "zip",
  "tar",
  "xml",
  "html",
  "htm",
  "shtml",
  "css",
  "ics",
  "ez",
  "pkpass",
]);

export function mailHtmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim().slice(0, 500);
}

function attachmentLinks(
  rows: Array<{ filename: string; storage_path: string }>,
): string {
  const items = rows.map((a) => {
    const name = a.filename.replace(/\.[^.]+$/, "");
    const url =
      `https://api.familiada.online/storage/v1/object/public/${a.storage_path}`;
    return `<a href="${url}" style="display: block; padding: 8px 12px; margin: 4px 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; text-decoration: none; color: #3b82f6;">📎 ${name}</a>`;
  }).join("");
  return `<div style="margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 12px;">${items}</div>`;
}

export function createMailTransport({ env = Deno.env, fetcher = fetch }: {
  env?: { get(name: string): string | undefined };
  fetcher?: typeof fetch;
} = {}) {
  const BREVO_KEY = env.get("BREVO_API_KEY") || "";
  const MAILGUN_KEY = env.get("MAILGUN_API_KEY") || "";
  const MAILGUN_DOMAIN = env.get("MAILGUN_DOMAIN") || "";
  const MAILGUN_REGION = (env.get("MAILGUN_REGION") || "eu").toLowerCase();
  const SENDPULSE_ID = env.get("SENDPULSE_ID") || "";
  const SENDPULSE_SECRET = env.get("SENDPULSE_SECRET") || "";
  const ZEPTOMAIL_KEY = env.get("ZEPTOMAIL_API_KEY") || "";
  const ZEPTOMAIL_BOUNCE = env.get("ZEPTOMAIL_BOUNCE_ADDRESS") || "";
  const ZEPTOMAIL_REGION = env.get("ZEPTOMAIL_REGION") || "com";
  const FROM_EMAIL = env.get("MAIL_FROM_EMAIL") || "no-reply@familiada.online";
  const FROM_NAME = env.get("MAIL_FROM_NAME") || "Familiada";
  let sendpulseToken: string | null = null;

  async function getSendpulseToken(
    mode: MailDelivery["mode"],
  ): Promise<string> {
    if (sendpulseToken) return sendpulseToken;
    if (!SENDPULSE_ID || !SENDPULSE_SECRET) {
      throw new Error("missing_SENDPULSE_credentials");
    }
    const res = await fetcher("https://api.sendpulse.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: SENDPULSE_ID,
        client_secret: SENDPULSE_SECRET,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `sendpulse_auth_failed:${await res.text().catch(() => "")}`,
      );
    }
    const data = await res.json();
    const token = data.access_token;
    if (typeof token !== "string" || !token.trim()) {
      throw new Error(
        mode === "worker"
          ? "sendpulse_auth_invalid_response"
          : "sendpulse_auth_missing_token",
      );
    }
    sendpulseToken = token;
    return token;
  }

  async function sendBrevo(mail: MailDelivery) {
    if (!BREVO_KEY) throw new Error("missing_BREVO_API_KEY");
    let html = mail.html;
    let attachments = mail.attachments;
    if (
      mail.mode === "worker" && attachments?.length &&
      mail.attachmentsMeta?.length
    ) {
      const allowed = mail.attachmentsMeta.filter((a) =>
        ALLOWED_ATTACHMENT_EXTENSIONS.has(
          a.filename.split(".").pop()?.toLowerCase() || "",
        )
      );
      const discard = mail.attachmentsMeta.filter((a) =>
        !ALLOWED_ATTACHMENT_EXTENSIONS.has(
          a.filename.split(".").pop()?.toLowerCase() || "",
        )
      );
      if (discard.length) {
        html = html.includes("</body>")
          ? html.replace(/<\/body>/i, attachmentLinks(discard) + "</body>")
          : html + attachmentLinks(discard);
      }
      const allowedSet = new Set(allowed.map((a) => a.filename));
      attachments = attachments.filter((a) => allowedSet.has(a.filename));
    }
    const payload: Record<string, unknown> = {
      sender: { email: mail.fromEmail || FROM_EMAIL, name: FROM_NAME },
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: html,
    };
    if (mail.mode === "worker") {
      payload.textContent = mail.plainText || mailHtmlToText(mail.html);
      if (attachments?.length) {
        payload.attachment = attachments.map((a) => ({
          name: a.filename,
          content: a.content,
          contentType: a.contentType,
        }));
      }
    }
    const res = await fetcher("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`brevo_failed:${await res.text().catch(() => "")}`);
    }
  }

  async function sendMailgun(mail: MailDelivery) {
    if (!MAILGUN_KEY) throw new Error("missing_MAILGUN_API_KEY");
    if (!MAILGUN_DOMAIN) throw new Error("missing_MAILGUN_DOMAIN");
    const base = MAILGUN_REGION === "eu"
      ? "https://api.eu.mailgun.net"
      : "https://api.mailgun.net";
    const form = new FormData();
    form.append("from", `${FROM_NAME} <${mail.fromEmail || FROM_EMAIL}>`);
    form.append("to", mail.to);
    form.append("subject", mail.subject);
    if (mail.mode === "worker") {
      form.append("text", mail.plainText || mailHtmlToText(mail.html));
    }
    form.append("html", mail.html);
    if (mail.mode === "worker" && mail.attachments?.length) {
      for (const a of mail.attachments) {
        form.append(
          "attachment",
          new Blob([Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0))], {
            type: a.contentType,
          }),
          a.filename,
        );
      }
    }
    const res = await fetcher(`${base}/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_KEY}`)}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`mailgun_failed:${await res.text().catch(() => "")}`);
    }
  }

  async function sendSendpulse(mail: MailDelivery) {
    if (!SENDPULSE_ID || !SENDPULSE_SECRET) {
      throw new Error("missing_SENDPULSE_credentials");
    }
    const token = await getSendpulseToken(mail.mode);
    const email: Record<string, unknown> = {
      subject: mail.subject,
      text: mailHtmlToText(mail.html),
      html: encodeBase64(new TextEncoder().encode(mail.html)),
      from: { name: FROM_NAME, email: mail.fromEmail || FROM_EMAIL },
      to: [{ email: mail.to, name: "" }],
    };
    if (mail.mode === "worker" && mail.attachments?.length) {
      email.attachments_binary = Object.fromEntries(
        mail.attachments.map((a) => [a.filename, a.content]),
      );
    }
    const res = await fetcher("https://api.sendpulse.com/smtp/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      throw new Error(`sendpulse_failed:${await res.text().catch(() => "")}`);
    }
  }

  async function sendZeptomail(mail: MailDelivery) {
    if (!ZEPTOMAIL_KEY) throw new Error("missing_ZEPTOMAIL_API_KEY");
    const host = ZEPTOMAIL_REGION === "eu"
      ? "api.zeptomail.eu"
      : ZEPTOMAIL_REGION === "in"
      ? "api.zeptomail.in"
      : "api.zeptomail.com";
    const payload: Record<string, unknown> = {
      from: { address: mail.fromEmail || FROM_EMAIL, name: FROM_NAME },
      to: [{ email_address: { address: mail.to, name: "" } }],
      subject: mail.subject,
      htmlbody: mail.html,
      textbody: mailHtmlToText(mail.html),
    };
    if (ZEPTOMAIL_BOUNCE) payload.bounce_address = ZEPTOMAIL_BOUNCE;
    if (mail.mode === "worker" && mail.attachments?.length) {
      payload.attachments = mail.attachments.map((a) => ({
        content: a.content,
        mime_type: a.contentType,
        name: a.filename,
      }));
    }
    const res = await fetcher(`https://${host}/v1.1/email`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-enczapikey ${ZEPTOMAIL_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`zeptomail_failed:${await res.text().catch(() => "")}`);
    }
  }

  return {
    hasAnyProvider: Boolean(
      BREVO_KEY || MAILGUN_KEY || SENDPULSE_ID || ZEPTOMAIL_KEY,
    ),
    send(provider: MailProvider, mail: MailDelivery) {
      if (provider === "brevo") return sendBrevo(mail);
      if (provider === "sendpulse") return sendSendpulse(mail);
      if (provider === "zeptomail") return sendZeptomail(mail);
      return sendMailgun(mail);
    },
  };
}
