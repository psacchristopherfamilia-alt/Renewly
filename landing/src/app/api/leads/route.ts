import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { hashIp, isRateLimited, leadEmailHtml, leadSchema } from "@/lib/lead";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 10_000;

export async function POST(req: NextRequest) {
  // Same-origin only: the form lives on this site.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(json);
  if (!parsed.success) {
    // A filled honeypot means a bot: answer as if it worked and store nothing.
    if (typeof json === "object" && json && "website" in json && (json as { website?: string }).website) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const lead = parsed.data;

  const db = supabaseAdmin();
  if (!db) {
    console.error("[leads] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await hashIp(ip, process.env.LEADS_IP_SALT ?? "renewly");

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (countError) {
    console.error("[leads] rate-limit query failed", countError.message);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (isRateLimited(count ?? 0)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const row = {
    name: lead.name, email: lead.email, phone: lead.phone, company: lead.company, properties: lead.properties,
    plan: lead.plan, message: lead.message, locale: lead.locale,
    utm_source: lead.utm_source, utm_medium: lead.utm_medium, utm_campaign: lead.utm_campaign, ip_hash: ipHash,
  };
  const { data: inserted, error } = await db.from("leads").insert(row).select("id").single();
  if (error || !inserted) {
    console.error("[leads] insert failed", error?.message);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // Owner notification. A failed email never loses the lead: it is already stored.
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_NOTIFY_EMAIL;
  if (resendKey && to) {
    try {
      const { error: mailError } = await new Resend(resendKey).emails.send({
        from: process.env.LEADS_FROM_EMAIL ?? "Renewly <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()),
        replyTo: lead.email,
        subject: `Nuevo lead: ${lead.name} · ${lead.properties} propiedades`,
        html: leadEmailHtml(lead),
      });
      if (mailError) throw new Error(mailError.message);
      await db.from("leads").update({ notified_at: new Date().toISOString() }).eq("id", inserted.id);
    } catch (e) {
      console.error("[leads] notification email failed", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true });
}
