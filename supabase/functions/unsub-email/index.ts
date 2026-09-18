// Tier One Outreach: unsubscribe endpoint behind https://outreach.benefitsotb.com/unsubscribe.html
//   POST {"email": "..."}  generic unsubscribe: adds the address to to_suppressed_emails.
//   POST {"t": "<uuid>"}   per contact unsubscribe: sets unsubscribed_at on the contact with that token.
// Returns JSON only: Supabase serves HTML from edge functions as text/plain, so the confirm page
// itself is a static page on the site. verify_jwt is off because the person clicking is a consumer.
// The service role key comes from the function environment, never from a file.
// The older unsub function (GET ?t=) stays deployed so links in emails already sent keep working.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://outreach.benefitsotb.com"]);
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://outreach.benefitsotb.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, origin);

  let email = "", t = "";
  try {
    const body = await req.json();
    email = String((body && body.email) || "").trim().toLowerCase();
    t = String((body && body.t) || "").trim();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400, origin);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (t) {
    if (!TOKEN.test(t)) return json({ ok: false, error: "invalid_token" }, 400, origin);
    const { error } = await sb
      .from("to_contacts")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("unsub_token", t)
      .is("unsubscribed_at", null);
    if (error) return json({ ok: false, error: "server" }, 500, origin);
    // Same answer whether the token matched, was already used, or matched nothing.
    return json({ ok: true }, 200, origin);
  }

  if (email.length > 320 || !EMAIL.test(email)) return json({ ok: false, error: "invalid_email" }, 400, origin);
  const { error } = await sb
    .from("to_suppressed_emails")
    .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  if (error) return json({ ok: false, error: "server" }, 500, origin);

  // Same answer for a new or a repeat address, so the endpoint never reveals who is on the list.
  return json({ ok: true }, 200, origin);
});
