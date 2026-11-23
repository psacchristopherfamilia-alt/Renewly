// Reminder emails: pure builders (unit tested) used by the daily job in /api/cron/reminders.
import en from "@/i18n/en";
import es from "@/i18n/es";

export type DueReminder = {
  tenant_id: string; organization: string; license_id: string; property_name: string; license_type: string;
  deadline: string; expires_on: string; days_left: number; kind: string; required_items: number; required_done: number;
  recipients: { email: string; name: string; locale: "es" | "en" }[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

function date(iso: string, locale: "es" | "en") {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === "en" ? "en-GB" : "es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function buildReminderEmail(r: DueReminder, locale: "es" | "en", appUrl: string) {
  const t = (locale === "en" ? en : es).reminders;
  const types = { accommodation: locale === "en" ? "accommodation licence" : "licencia de alojamiento", business: locale === "en" ? "business licence" : "licencia comercial" };
  const type = types[r.license_type as keyof typeof types] ?? r.license_type;
  const vars = { property: r.property_name, date: date(r.deadline, locale), type, org: r.organization };
  const overdue = r.days_left < 0;
  const days = r.days_left === 0 ? t.today : r.days_left === 1 ? t.tomorrow : fill(t.inDays, { n: String(r.days_left) });
  const subject = fill(overdue ? t.subjectOverdue : t.subject, vars);
  const body = fill(overdue ? t.bodyOverdue : t.body, { ...vars, days });
  const checklist = fill(t.checklist, { done: String(r.required_done), total: String(r.required_items) });
  const link = `${appUrl.replace(/\/$/, "")}/dashboard`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:520px">
<p style="font-size:20px;font-weight:bold;color:#1d4ed8;margin:0 0 16px">Renewly</p>
<p style="font-size:16px">${esc(body)}</p>
<p style="color:#55637d">${esc(checklist)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(t.cta)}</a></p>
<p style="color:#55637d;font-size:12px">${esc(fill(t.footer, vars))}<br>Never miss a license renewal.</p></div>`;
  const text = `${body}\n${checklist}\n${link}\n\n${fill(t.footer, vars)}`;
  return { subject, html, text };
}
