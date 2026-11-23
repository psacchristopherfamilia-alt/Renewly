import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { type DueReminder, buildReminderEmail } from "@/lib/reminders";
import { todayTci } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily job (Vercel Cron or any scheduler): GET with "Authorization: Bearer <CRON_SECRET>".
// Asks the database which reminders are due today in TCI, emails owners and admins, and records each one,
// so a second run on the same day sends nothing.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!url || !key || !resendKey || !from) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const db = createClient(url, key, { auth: { persistSession: false } });
  const today = req.nextUrl.searchParams.get("date") ?? todayTci();
  const { data, error } = await db.rpc("due_reminders", { p_today: today });
  if (error) {
    console.error(JSON.stringify({ level: "error", msg: "due_reminders failed", error: error.message }));
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  let sent = 0, failed = 0;
  for (const r of (data ?? []) as DueReminder[]) {
    let delivered = 0;
    for (const to of r.recipients) {
      const mail = buildReminderEmail(r, to.locale === "en" ? "en" : "es", appUrl);
      const { error: e } = await resend.emails.send({ from, to: to.email, subject: mail.subject, html: mail.html, text: mail.text });
      if (e) { failed++; console.error(JSON.stringify({ level: "error", msg: "reminder email failed", license: r.license_id, error: e.message })); }
      else delivered++;
    }
    // Recorded only when at least one person got it; otherwise tomorrow's run tries again.
    if (delivered > 0 || r.recipients.length === 0) {
      await db.rpc("mark_reminder_sent", { p_license: r.license_id, p_deadline: r.deadline, p_kind: r.kind, p_recipients: delivered });
      sent += delivered;
    }
  }
  return NextResponse.json({ ok: true, date: today, reminders: data?.length ?? 0, emails: sent, failed });
}
