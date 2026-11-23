import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { invoicePdf, type InvoicePdfData } from "@/lib/billing/pdf";
import { formatMoney, manualProvider } from "@/lib/billing/provider";
import { buildBillingEmail, type BillingNotice } from "@/lib/billing/notices";

const base: InvoicePdfData = {
  locale: "es", number: "RNW-2026-00001", reference: "RNW-AB12-CD34", status: "open", kind: "subscription",
  issued_on: "2026-11-23", due_on: "2026-12-07", period_start: "2026-12-08", period_end: "2027-01-07",
  plan_name: "Por propiedad", quantity: 12, unit_price: 39, subtotal: 468, discount: 46.8, tax: 0, tax_label: "", total: 421.2, currency: "USD",
  paid_at: null, paid_method: null, paid_reference: null, customer_name: "Island Villas", customer_email: "olga@iv.tc",
  payee_name: "Renewly Ltd", payee_address: "Providenciales, TCI", bank_details: "FirstCaribbean — Acc 0000 → Renewly Ltd",
  payment_note: "", support_email: "help@renewly.example",
};

describe("billing", () => {
  it("formats money in US dollars", () => {
    expect(formatMoney(421.2)).toBe("US$421.20");
    expect(formatMoney(1450)).toBe("US$1,450.00");
  });

  it("manual provider gives bank instructions with the invoice reference", async () => {
    const step = await manualProvider.paymentStep(
      { id: "i", number: "RNW-2026-00001", reference: "RNW-AB12-CD34", total: 117, currency: "USD", due_on: "2026-12-07" },
      { payee_name: "Renewly Ltd", payee_address: "", bank_details: "Bank X", payment_note: "", support_email: "" },
    );
    expect(step).toMatchObject({ kind: "instructions", reference: "RNW-AB12-CD34", amount: "US$117.00", bankDetails: "Bank X" });
  });

  it("renders an invoice PDF and a receipt PDF, even with characters outside Latin-1", async () => {
    const inv = await invoicePdf(base);
    const doc = await PDFDocument.load(inv);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("FACTURA RNW-2026-00001");
    const rec = await invoicePdf({ ...base, locale: "en", status: "paid", paid_at: "2026-11-30T10:00:00Z", paid_method: "transfer", paid_reference: "FCIB-1" });
    expect((await PDFDocument.load(rec)).getTitle()).toBe("RECEIPT RNW-2026-00001");
  });
});


describe("billing notices", () => {
  const n: BillingNotice = { id: 1, tenant_id: "t", organization: "Bay <Villas>", kind: "invoice_issued", data: {}, invoice_number: "RNW-2026-00001",
    invoice_reference: "RNW-AB12-CD34", invoice_total: 117, invoice_due: "2026-12-07", recipients: [] };
  it("includes the reference, amount and due date, escaped", () => {
    const m = buildBillingEmail(n, "es", "https://app.x")!;
    expect(m.subject).toBe("Factura RNW-2026-00001 de Renewly");
    expect(m.text).toContain("RNW-AB12-CD34");
    expect(m.text).toContain("US$117.00");
    expect(m.text).toContain("https://app.x/billing");
  });
  it("explains suspension in English and ignores unknown kinds", () => {
    expect(buildBillingEmail({ ...n, kind: "suspended" }, "en", "https://x")!.text).toContain("not make changes");
    expect(buildBillingEmail({ ...n, kind: "trial_started" }, "en", "https://x")).toBeNull();
    expect(buildBillingEmail({ ...n, kind: "suspended" }, "en", "https://x")!.html).toContain("Bay &lt;Villas&gt;");
  });
});
