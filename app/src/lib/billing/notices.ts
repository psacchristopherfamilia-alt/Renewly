// Billing notice emails (pure; unit tested). Sent by /api/cron/billing to owners and admins.
import { formatMoney } from "./provider";

export type BillingNotice = {
  id: number; tenant_id: string; organization: string; kind: string; data: Record<string, unknown>;
  invoice_number: string | null; invoice_reference: string | null; invoice_total: number | null; invoice_due: string | null;
  recipients: { email: string; name: string; locale: "es" | "en" }[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const TEXT = {
  es: {
    trial_ending: ["Tu prueba gratis de Renewly termina pronto", "La prueba gratis de {org} termina el {ends}. Elige un plan para seguir sin interrupciones."],
    invoice_issued: ["Factura {number} de Renewly", "Emitimos la factura {number} por {total}, con vencimiento el {due}. Paga con la referencia {ref} y sube el comprobante en Plan."],
    due_soon: ["Tu factura {number} vence el {due}", "Recuerda pagar {total} con la referencia {ref} antes del {due} y subir el comprobante en Plan."],
    proof_received: ["Recibimos tu comprobante", "Recibimos el comprobante de la factura {number}. Te avisamos cuando lo aprobemos."],
    payment_approved: ["Pago aprobado · {number}", "Aprobamos el pago de la factura {number}. Tu recibo está disponible en Plan. ¡Gracias!"],
    proof_rejected: ["Comprobante rechazado · {number}", "No pudimos aprobar el comprobante de la factura {number}: {reason}. Sube uno nuevo en Plan."],
    past_due: ["Pago vencido en Renewly", "El período pagado de {org} terminó sin un pago nuevo. Paga pronto para evitar la suspensión."],
    suspended: ["Cuenta de Renewly suspendida", "La cuenta de {org} quedó suspendida por falta de pago: puedes ver tus datos pero no hacer cambios. Paga para reactivarla."],
    reactivated: ["Cuenta de Renewly reactivada", "La cuenta de {org} está activa de nuevo."],
    canceled: ["Suscripción de Renewly cancelada", "La suscripción de {org} terminó. Tus datos siguen disponibles en solo lectura."],
    cta: "Abrir Plan",
  },
  en: {
    trial_ending: ["Your Renewly free trial ends soon", "The free trial of {org} ends on {ends}. Choose a plan to keep going without interruption."],
    invoice_issued: ["Renewly invoice {number}", "We issued invoice {number} for {total}, due {due}. Pay with reference {ref} and upload the proof under Plan."],
    due_soon: ["Your invoice {number} is due {due}", "Please pay {total} with reference {ref} by {due} and upload the proof under Plan."],
    proof_received: ["We received your proof of payment", "We received the proof for invoice {number}. We will let you know once it is approved."],
    payment_approved: ["Payment approved · {number}", "We approved the payment for invoice {number}. Your receipt is available under Plan. Thank you!"],
    proof_rejected: ["Proof rejected · {number}", "We could not approve the proof for invoice {number}: {reason}. Please upload a new one under Plan."],
    past_due: ["Renewly payment past due", "The paid period of {org} ended without a new payment. Pay soon to avoid suspension."],
    suspended: ["Renewly account suspended", "The account of {org} is suspended for non-payment: you can view your data but not make changes. Pay to reactivate it."],
    reactivated: ["Renewly account reactivated", "The account of {org} is active again."],
    canceled: ["Renewly subscription canceled", "The subscription of {org} has ended. Your data is still available read only."],
    cta: "Open Plan",
  },
};

export function buildBillingEmail(n: BillingNotice, locale: "es" | "en", appUrl: string) {
  const t = TEXT[locale];
  const pair = (t as Record<string, unknown>)[n.kind] as [string, string] | undefined;
  if (!pair) return null;
  const vars: Record<string, string> = {
    org: n.organization, number: n.invoice_number ?? "", ref: n.invoice_reference ?? "",
    total: n.invoice_total != null ? formatMoney(Number(n.invoice_total)) : "", due: n.invoice_due ?? "",
    ends: String(n.data?.ends ?? ""), reason: String(n.data?.reason ?? ""),
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  const subject = fill(pair[0]);
  const body = fill(pair[1]);
  const link = `${appUrl.replace(/\/$/, "")}/billing`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:520px">
<p style="font-size:20px;font-weight:bold;color:#1d4ed8;margin:0 0 16px">Renewly</p>
<p style="font-size:16px">${esc(body)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(t.cta)}</a></p>
<p style="color:#55637d;font-size:12px">Never miss a license renewal.</p></div>`;
  return { subject, html, text: `${body}\n${link}` };
}
