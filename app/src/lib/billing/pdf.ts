// Invoice and receipt PDFs (Letter size), with the Renewly logo. Pure function: data in, bytes out.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney } from "./provider";

export type InvoicePdfData = {
  locale: "es" | "en";
  number: string;
  reference: string;
  status: "open" | "proof_received" | "paid" | "void";
  kind: "subscription" | "proration";
  issued_on: string;
  due_on: string;
  period_start: string;
  period_end: string;
  plan_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount: number;
  tax: number;
  tax_label: string;
  total: number;
  currency: string;
  paid_at: string | null;
  paid_method: string | null;
  paid_reference: string | null;
  customer_name: string;
  customer_email: string;
  payee_name: string;
  payee_address: string;
  bank_details: string;
  payment_note: string;
  support_email: string;
};

const BLUE = rgb(29 / 255, 78 / 255, 216 / 255);
const LIGHT = rgb(147 / 255, 197 / 255, 253 / 255);
const INK = rgb(15 / 255, 23 / 255, 42 / 255);
const MUTED = rgb(85 / 255, 99 / 255, 125 / 255);
const LINE = rgb(216 / 255, 224 / 255, 238 / 255);

const T = {
  es: {
    invoice: "FACTURA", receipt: "RECIBO", number: "Número", reference: "Referencia de pago", issued: "Emitida", due: "Vence",
    billTo: "Facturar a", from: "De", description: "Descripción", qty: "Cant.", unit: "Precio", amount: "Importe",
    subscription: "Suscripción", proration: "Ajuste prorrateado por cambio de plan", period: "Período",
    subtotal: "Subtotal", discount: "Descuento por volumen", total: "Total", paid: "PAGADA", paidOn: "Pagada el", method: "Medio",
    methods: { transfer: "Transferencia", deposit: "Depósito", cash: "Efectivo", cheque: "Cheque", stripe: "Tarjeta" } as Record<string, string>,
    howToPay: "Cómo pagar", useRef: "Incluye la referencia {ref} en la descripción del pago y sube el comprobante en Renewly → Plan.",
    void: "ANULADA", thanks: "Gracias por tu pago.", questions: "Preguntas:",
  },
  en: {
    invoice: "INVOICE", receipt: "RECEIPT", number: "Number", reference: "Payment reference", issued: "Issued", due: "Due",
    billTo: "Bill to", from: "From", description: "Description", qty: "Qty", unit: "Price", amount: "Amount",
    subscription: "Subscription", proration: "Prorated adjustment for plan change", period: "Period",
    subtotal: "Subtotal", discount: "Volume discount", total: "Total", paid: "PAID", paidOn: "Paid on", method: "Method",
    methods: { transfer: "Bank transfer", deposit: "Deposit", cash: "Cash", cheque: "Cheque", stripe: "Card" } as Record<string, string>,
    howToPay: "How to pay", useRef: "Include the reference {ref} in the payment description and upload the proof in Renewly → Plan.",
    void: "VOID", thanks: "Thank you for your payment.", questions: "Questions:",
  },
};

function drawLogo(page: PDFPage, x: number, y: number, size: number) {
  const s = size / 64;
  page.drawRectangle({ x, y, width: size, height: size, color: BLUE });
  // Ring arrow and dot of the brand mark (SVG paths use a top-left origin).
  page.drawSvgPath("M44 24a15 15 0 1 0 3 12", { x, y: y + size, scale: s, borderColor: rgb(1, 1, 1), borderWidth: 4 * s });
  page.drawSvgPath("M45 14v11H34", { x, y: y + size, scale: s, borderColor: LIGHT, borderWidth: 4 * s });
  page.drawCircle({ x: x + 32 * s, y: y + size - 34 * s, size: 3.5 * s, color: rgb(1, 1, 1) });
}

// Standard PDF fonts only cover Latin-1; keep the text printable.
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, (c) => ({ "—": "-", "–": "-", "→": "->", "·": "·", "“": '"', "”": '"', "’": "'" })[c] ?? "?");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function invoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const t = T[d.locale];
  const doc = await PDFDocument.create();
  const paid = d.status === "paid";
  doc.setTitle(`${paid ? t.receipt : t.invoice} ${d.number}`);
  doc.setAuthor("Renewly");
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = (s: string, x: number, y: number, o: { size?: number; f?: PDFFont; color?: typeof INK } = {}) =>
    page.drawText(safe(s), { x, y, size: o.size ?? 10, font: o.f ?? font, color: o.color ?? INK });
  const right = (s: string, xr: number, y: number, o: { size?: number; f?: PDFFont; color?: typeof INK } = {}) =>
    text(s, xr - (o.f ?? font).widthOfTextAtSize(safe(s), o.size ?? 10), y, o);
  const money = (n: number) => formatMoney(n, d.currency);

  // Header
  drawLogo(page, 48, 712, 36);
  text("Renewly", 92, 724, { size: 20, f: bold });
  text("Never miss a license renewal.", 92, 712, { size: 9, color: MUTED });
  right(paid ? t.receipt : d.status === "void" ? t.void : t.invoice, 564, 724, { size: 20, f: bold, color: paid ? rgb(23 / 255, 112 / 255, 58 / 255) : BLUE });
  right(`${t.number}: ${d.number}`, 564, 708, { size: 9, color: MUTED });

  // Parties and dates
  let y = 660;
  text(t.from, 48, y, { size: 8, f: bold, color: MUTED });
  text(t.billTo, 230, y, { size: 8, f: bold, color: MUTED });
  y -= 14;
  const fromLines = [d.payee_name, ...wrap(d.payee_address, font, 9, 170)].filter(Boolean);
  fromLines.forEach((l, i) => text(l, 48, y - i * 12, { size: 9 }));
  [d.customer_name, d.customer_email].filter(Boolean).forEach((l, i) => text(l, 230, y - i * 12, { size: 9 }));
  const meta: [string, string][] = [[t.issued, d.issued_on], [paid ? t.paidOn : t.due, paid ? (d.paid_at ?? "").slice(0, 10) : d.due_on], [t.reference, d.reference]];
  meta.forEach(([k, v], i) => { right(k, 470, y - i * 12, { size: 9, color: MUTED }); right(v, 564, y - i * 12, { size: 9, f: bold }); });

  // Line item
  y = 570;
  page.drawLine({ start: { x: 48, y: y + 14 }, end: { x: 564, y: y + 14 }, thickness: 0.8, color: LINE });
  text(t.description, 48, y, { size: 8, f: bold, color: MUTED });
  right(t.qty, 380, y, { size: 8, f: bold, color: MUTED });
  right(t.unit, 470, y, { size: 8, f: bold, color: MUTED });
  right(t.amount, 564, y, { size: 8, f: bold, color: MUTED });
  y -= 20;
  text(`${d.kind === "proration" ? t.proration : t.subscription} · ${d.plan_name}`, 48, y);
  text(`${t.period}: ${d.period_start} - ${d.period_end}`, 48, y - 12, { size: 8, color: MUTED });
  right(String(d.quantity), 380, y);
  right(money(d.unit_price), 470, y);
  right(money(d.subtotal), 564, y);
  y -= 34;
  page.drawLine({ start: { x: 330, y }, end: { x: 564, y }, thickness: 0.8, color: LINE });
  const totals: [string, string, boolean][] = [[t.subtotal, money(d.subtotal), false]];
  if (d.discount > 0) totals.push([t.discount, `- ${money(d.discount)}`, false]);
  if (d.tax > 0) totals.push([d.tax_label || "Tax", money(d.tax), false]);
  totals.push([t.total, money(d.total), true]);
  totals.forEach(([k, v, strong], i) => {
    const yy = y - 16 - i * 16;
    right(k, 470, yy, { size: strong ? 11 : 9, f: strong ? bold : font, color: strong ? INK : MUTED });
    right(v, 564, yy, { size: strong ? 11 : 9, f: strong ? bold : font });
  });
  y = y - 16 - totals.length * 16 - 24;

  // Payment block
  page.drawRectangle({ x: 48, y: y - 110, width: 516, height: 118, color: rgb(244 / 255, 247 / 255, 252 / 255), borderColor: LINE, borderWidth: 0.8 });
  if (paid) {
    text(t.paid, 60, y - 16, { size: 14, f: bold, color: rgb(23 / 255, 112 / 255, 58 / 255) });
    text(`${t.paidOn} ${(d.paid_at ?? "").slice(0, 10)} · ${t.method}: ${t.methods[d.paid_method ?? ""] ?? d.paid_method ?? ""}${d.paid_reference ? ` · ${d.paid_reference}` : ""}`, 60, y - 34, { size: 9 });
    text(t.thanks, 60, y - 52, { size: 9, color: MUTED });
  } else if (d.status !== "void") {
    text(t.howToPay, 60, y - 16, { size: 11, f: bold });
    const lines = [...wrap(d.bank_details, font, 9, 490), "", ...wrap(t.useRef.replace("{ref}", d.reference), font, 9, 490), ...wrap(d.payment_note, font, 9, 490)];
    lines.slice(0, 7).forEach((l, i) => text(l, 60, y - 34 - i * 12, { size: 9 }));
  }

  // Footer
  if (d.support_email) text(`${t.questions} ${d.support_email}`, 48, 48, { size: 8, color: MUTED });
  right("renewly", 564, 48, { size: 8, color: MUTED });
  return doc.save();
}
