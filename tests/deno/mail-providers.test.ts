import {
  createMailTransport,
  type MailDelivery,
  mailHtmlToText,
  type MailProvider,
} from "../../supabase/functions/_shared/mail-providers.ts";

function eq(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const credentials: Record<string, string> = {
  BREVO_API_KEY: "brevo-test",
  MAILGUN_API_KEY: "mailgun-test",
  MAILGUN_DOMAIN: "mg.example.test",
  SENDPULSE_ID: "sendpulse-id",
  SENDPULSE_SECRET: "sendpulse-secret",
  ZEPTOMAIL_API_KEY: "zepto-test",
  ZEPTOMAIL_BOUNCE_ADDRESS: "bounce@example.test",
  MAIL_FROM_EMAIL: "default@example.test",
  MAIL_FROM_NAME: "Familijna",
};
const attachment = {
  filename: "note.txt",
  content: btoa("note"),
  contentType: "text/plain",
};
const mail: MailDelivery = {
  to: "recipient@example.test",
  subject: "Subject",
  html: "<p>Hi &amp; bye</p>",
  mode: "immediate",
};

function mockTransport(
  env = credentials,
  response = new Response("{}", { status: 200 }),
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init || {} });
    if (String(url).includes("access_token")) {
      return Response.json({ access_token: "token-test" });
    }
    return response;
  };
  return {
    calls,
    transport: createMailTransport({
      env: { get: (key) => env[key] },
      fetcher: fetcher as typeof fetch,
    }),
  };
}

Deno.test("shared normalization keeps the 500-character mail preview contract", () => {
  eq(mailHtmlToText("<b>A&nbsp;&amp;&lt;&gt;&quot;&#39;</b>"), "A &<>\"'");
  eq(mailHtmlToText("x".repeat(510)).length, 500);
});

Deno.test("Brevo immediate omits worker text and attachments; worker keeps both", async () => {
  const { calls, transport } = mockTransport();
  await transport.send("brevo", mail);
  eq(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  const immediate = JSON.parse(String(calls[0].init.body));
  eq(immediate, {
    sender: { email: "default@example.test", name: "Familijna" },
    to: [{ email: mail.to }],
    subject: mail.subject,
    htmlContent: mail.html,
  });
  await transport.send("brevo", {
    ...mail,
    mode: "worker",
    fromEmail: "other@example.test",
    attachments: [attachment],
    plainText: "Plain",
  });
  const worker = JSON.parse(String(calls[1].init.body));
  eq(worker.sender.email, "other@example.test");
  eq(worker.textContent, "Plain");
  eq(worker.attachment, [{
    name: "note.txt",
    content: attachment.content,
    contentType: "text/plain",
  }]);
});

Deno.test("Brevo worker retains extension filtering and link fallback", async () => {
  const { calls, transport } = mockTransport();
  const blocked = {
    filename: "unknown.bin",
    content: btoa("blocked"),
    contentType: "application/octet-stream",
  };
  await transport.send("brevo", {
    ...mail,
    mode: "worker",
    attachments: [attachment, blocked],
    attachmentsMeta: [
      { filename: "note.txt", storage_path: "message-attachments/note.txt" },
      {
        filename: "unknown.bin",
        storage_path: "message-attachments/unknown.bin",
      },
    ],
  });
  const payload = JSON.parse(String(calls[0].init.body));
  eq(payload.attachment.map((a: { name: string }) => a.name), ["note.txt"]);
  if (
    !payload.htmlContent.includes("unknown.bin") &&
    !payload.htmlContent.includes("unknown")
  ) throw new Error("missing fallback link");
});

Deno.test("Mailgun preserves region, sender, text and multipart attachment rules", async () => {
  const { calls, transport } = mockTransport({
    ...credentials,
    MAILGUN_REGION: "us",
  });
  await transport.send("mailgun", mail);
  eq(calls[0].url, "https://api.mailgun.net/v3/mg.example.test/messages");
  const immediate = calls[0].init.body as FormData;
  eq(immediate.get("text"), null);
  eq(immediate.get("from"), "Familijna <default@example.test>");
  await transport.send("mailgun", {
    ...mail,
    mode: "worker",
    fromEmail: "other@example.test",
    attachments: [attachment],
    plainText: "Plain",
  });
  const worker = calls[1].init.body as FormData;
  eq(worker.get("text"), "Plain");
  eq(worker.get("from"), "Familijna <other@example.test>");
  eq((worker.get("attachment") as File).name, "note.txt");
});

Deno.test("SendPulse reuses OAuth token and only worker sends binary attachments", async () => {
  const { calls, transport } = mockTransport();
  await transport.send("sendpulse", mail);
  await transport.send("sendpulse", {
    ...mail,
    mode: "worker",
    attachments: [attachment],
  });
  eq(calls.filter((c) => c.url.includes("access_token")).length, 1);
  const messages = calls.filter((c) => c.url.includes("smtp/emails"));
  const immediate = JSON.parse(String(messages[0].init.body)).email;
  const worker = JSON.parse(String(messages[1].init.body)).email;
  eq(immediate.text, "Hi & bye");
  eq(immediate.attachments_binary, undefined);
  eq(worker.attachments_binary, { "note.txt": attachment.content });
});

Deno.test("SendPulse refuses missing or malformed OAuth tokens before SMTP", async () => {
  for (const value of [undefined, null, "", " ", 14]) {
    let smtpCalls = 0;
    const fetcher = async (url: string | URL | Request) => {
      if (String(url).includes("access_token")) {
        return Response.json({ access_token: value });
      }
      smtpCalls++;
      return Response.json({});
    };
    const transport = createMailTransport({
      env: { get: (key) => credentials[key] },
      fetcher: fetcher as typeof fetch,
    });
    try {
      await transport.send("sendpulse", mail);
      throw new Error("invalid OAuth accepted");
    } catch (error) {
      if (!String(error).includes("sendpulse_auth_missing_token")) throw error;
    }
    eq(smtpCalls, 0);
  }
});

Deno.test("ZeptoMail preserves region, bounce and worker attachment payload", async () => {
  const { calls, transport } = mockTransport({
    ...credentials,
    ZEPTOMAIL_REGION: "in",
  });
  await transport.send("zeptomail", mail);
  eq(calls[0].url, "https://api.zeptomail.in/v1.1/email");
  const immediate = JSON.parse(String(calls[0].init.body));
  eq(immediate.bounce_address, "bounce@example.test");
  eq(immediate.attachments, undefined);
  await transport.send("zeptomail", {
    ...mail,
    mode: "worker",
    attachments: [attachment],
  });
  const worker = JSON.parse(String(calls[1].init.body));
  eq(worker.attachments, [{
    content: attachment.content,
    mime_type: "text/plain",
    name: "note.txt",
  }]);
});

Deno.test("each provider fails closed on absent credentials or HTTP failure", async () => {
  for (
    const provider of [
      "brevo",
      "mailgun",
      "sendpulse",
      "zeptomail",
    ] as MailProvider[]
  ) {
    const missing = mockTransport({});
    if (missing.transport.hasAnyProvider) {
      throw new Error("unexpected provider");
    }
    try {
      await missing.transport.send(provider, mail);
      throw new Error("missing credentials accepted");
    } catch (error) {
      if (String(error).includes("accepted")) throw error;
    }
    eq(missing.calls.length, 0);
    const denied = mockTransport(
      credentials,
      new Response("denied", { status: 403 }),
    );
    try {
      await denied.transport.send(provider, mail);
      throw new Error("HTTP failure accepted");
    } catch (error) {
      if (String(error).includes("accepted")) throw error;
    }
  }
});
