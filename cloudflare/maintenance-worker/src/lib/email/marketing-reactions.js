// src/lib/email/marketing-reactions.js -- reakcje odbiorców maili marketingowych
// (Lead Finder 2, familijna-server/docs/lead-finder-nowy-plan.md „Reakcje odbiorców”).
// Poczta przychodząca: nadawca porównany z e-mailami kontaktów (RPC
// marketing_mark_reaction dopasowuje adres; nieznany adres nic nie zmienia).
// Zwrotka serwera pocztowego -> „bounced” dla adresata z raportu.
// Prośba o rezygnację -> „declined”. Zwykła odpowiedź -> „replied”.
import { supabaseRpc, summarizeSupabaseError } from "../core/supabase.js";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const BOUNCE_FROM_RE = /^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)@/i;
const BOUNCE_SUBJECT_RE = /(undeliver|delivery status notification|delivery has failed|failure notice|returned mail|mail delivery failed|niedostarcz|nie można dostarczyć|zwrot wiadomości)/i;
const DECLINE_RE = /(nie jeste[śs]my zainteresowan|nie jestem zainteresowan|nie interesuje (mnie|nas)|prosz[ęe] (o )?(nie (pisa[ćc]|wysy[łl]a[ćc]|przysy[łl]a[ćc])|usuni[ęe]cie|wypisanie)|usu[ńn](cie)? (m[óo]j|nasz) adres|wypisz(cie)? mnie|rezygnuj[ęe]|unsubscribe|not interested|remove me|stop (sending|emailing))/i;
// Zacytowana treść odpowiedzi (nasz mail) nie może wywołać „declined”.
const QUOTE_START_RE = /^(>|-{2,}\s*(original|oryginalna)|On .+wrote:|W dniu .+napisał|Dnia .+napisał|From: |Od: )/im;
const OWN_DOMAIN_RE = /@(?:[a-z0-9-]+\.)*(?:familiada\.online|familijna\.app)$/i;

function ownText(body) {
  const text = String(body || "");
  const m = QUOTE_START_RE.exec(text);
  return (m ? text.slice(0, m.index) : text).slice(0, 3000);
}

function bounceRecipients(body) {
  const text = String(body || "");
  const final = [...text.matchAll(/(?:final|original)-recipient:\s*rfc822;\s*<?([^\s>]+@[^\s>]+)/gi)].map((m) => m[1]);
  const all = final.length ? final : (text.match(EMAIL_RE) || []);
  return [...new Set(all.map((e) => e.toLowerCase().replace(/[.>]+$/, "")))].filter((e) => !OWN_DOMAIN_RE.test(e)).slice(0, 5);
}

// [{ email, reaction }] do zapisania dla wiadomości przychodzącej.
export function marketingReactions({ from, subject, body }) {
  const sender = String(from || "").trim().toLowerCase();
  if (!sender || OWN_DOMAIN_RE.test(sender)) return [];
  if (BOUNCE_FROM_RE.test(sender) || BOUNCE_SUBJECT_RE.test(String(subject || ""))) {
    return bounceRecipients(body).map((email) => ({ email, reaction: "bounced" }));
  }
  const reaction = DECLINE_RE.test(`${subject || ""}\n${ownText(body)}`) ? "declined" : "replied";
  return [{ email: sender, reaction }];
}

// Zapis reakcji; zwraca true, gdy któryś adres był kontaktem marketingowym.
export async function recordMarketingReactions(env, msg) {
  let matched = false;
  for (const { email, reaction } of marketingReactions(msg)) {
    const res = await supabaseRpc(env, "marketing_mark_reaction", { p_email: email, p_reaction: reaction });
    if (!res.ok) {
      console.error("[email] marketing reaction failed:", summarizeSupabaseError(res));
      continue;
    }
    if (Number(res.data) > 0) {
      matched = true;
      console.log("[email] marketing reaction:", reaction);
    }
  }
  return matched;
}
