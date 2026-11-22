import "server-only";
import { Resend } from "resend";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Sends the invitation email. Returns false when email is not configured or sending failed. */
export async function sendInviteEmail(opts: { to: string; org: string; inviter: string; link: string; locale: "es" | "en" }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const es = opts.locale === "es";
  const subject = es ? `${opts.inviter} te invitó a ${opts.org} en Renewly` : `${opts.inviter} invited you to ${opts.org} on Renewly`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:520px">
<p style="font-size:20px;font-weight:bold;color:#1d4ed8;margin:0 0 16px">Renewly</p>
<p>${es ? `${esc(opts.inviter)} te invitó a unirte a <b>${esc(opts.org)}</b>.` : `${esc(opts.inviter)} invited you to join <b>${esc(opts.org)}</b>.`}</p>
<p><a href="${esc(opts.link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${es ? "Aceptar invitación" : "Accept invitation"}</a></p>
<p style="color:#55637d;font-size:13px">${es ? "El enlace vence en 7 días. Si no esperabas este correo, ignóralo." : "The link expires in 7 days. If you weren't expecting this email, ignore it."}</p>
<p style="color:#55637d;font-size:12px">Never miss a license renewal.</p></div>`;
  try {
    const { error } = await new Resend(key).emails.send({ from, to: opts.to, subject, html });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error("[invite-email]", (e as Error).message);
    return false;
  }
}
