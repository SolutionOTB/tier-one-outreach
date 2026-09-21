// Tier One Outreach: QR redirect and scan counter.
// GET /r?m=QR-<slug>-<where>&u=<destination>
// Writes one row to to_scans, then sends the person on to the associate's link.
// verify_jwt is off because the person scanning is a consumer.
// The service role key comes from the function environment, never from a file.
import { createClient } from "npm:@supabase/supabase-js@2";

const HOME = "https://outreach.benefitsotb.com/";

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const marker = (u.searchParams.get("m") || "").slice(0, 120);
  let dest = u.searchParams.get("u") || HOME;
  if (!/^https?:\/\//i.test(dest)) dest = HOME;

  // markers look like QR-<slug>-<where it was shown>
  const m = marker.match(/^QR-([^-]+)-/);
  const slug = (m ? m[1] : "").toLowerCase().slice(0, 60);

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await sb.from("to_scans").insert({
      agent_slug: slug,
      marker,
      dest: dest.slice(0, 500),
      user_agent: (req.headers.get("user-agent") || "").slice(0, 200),
    });
  } catch (_e) {
    // a logging problem must never stop the person reaching the link
  }

  return new Response(null, { status: 302, headers: { Location: dest, "Cache-Control": "no-store" } });
});
