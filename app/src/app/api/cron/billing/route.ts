import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { type BillingNotice, buildBillingEmail } from "@/lib/billing/notices";
import { todayTci } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily billing job: "Authorization: Bearer <CRON_SECRET>". Runs the billing cycle in the database (renewal
// invoices, overdue, suspension, cancellation) and emails the pending notices. Safe to run more than once a day.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: changes, error } = await db.rpc("billing_tick", { p_today: todayTci() });
  if (error) {
    console.error(JSON.stringify({ level: "error", msg: "billing_tick failed", error: error.message }));
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  const resendKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!resendKey || !from) return NextResponse.json({ ok: true, changes, emails: 0, note: "email not configured" });
  const resend = new Resend(resendKey);
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const { data: notices } = await db.rpc("pending_billing_notices");
  let emails = 0;
  for (const n of (notices ?? []) as BillingNotice[]) {
    let ok = n.recipients.length === 0;
    for (const to of n.recipients) {
      const mail = buildBillingEmail(n, to.locale === "en" ? "en" : "es", appUrl);
      if (!mail) { ok = true; continue; }
      const { error: e } = await resend.emails.send({ from, to: to.email, subject: mail.subject, html: mail.html, text: mail.text });
      if (e) console.error(JSON.stringify({ level: "error", msg: "billing email failed", notice: n.id, error: e.message }));
      else { ok = true; emails++; }
    }
    if (ok) await db.rpc("mark_billing_notice_sent", { p_id: n.id });
  }
  return NextResponse.json({ ok: true, changes, emails });
}
