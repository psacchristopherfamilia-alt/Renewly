// Payment provider layer. The rest of the app only talks to this interface, so a card gateway (Stripe or
// another) can be plugged in later without touching screens, limits or the database rules.
//
// Today only the manual provider exists: the customer pays by transfer, deposit, cash or cheque using the
// invoice reference, uploads the proof, and a platform admin approves it.

export type InvoiceForPayment = {
  id: string;
  number: string;
  reference: string;
  total: number;
  currency: string;
  due_on: string;
};

export type BillingSettings = {
  payee_name: string;
  payee_address: string;
  bank_details: string;
  payment_note: string;
  support_email: string;
};

export type PaymentStep =
  | { kind: "instructions"; payee: string; bankDetails: string; reference: string; amount: string; note: string; acceptsProof: true }
  | { kind: "redirect"; url: string };

export interface PaymentProvider {
  id: "manual" | "stripe";
  /** What the customer must do to pay this invoice. */
  paymentStep(invoice: InvoiceForPayment, settings: BillingSettings): Promise<PaymentStep>;
  /** Where the customer manages cards and cancels, when the provider has its own portal. */
  portalUrl?(tenantId: string): Promise<string | null>;
}

export function formatMoney(amount: number, currency = "USD") {
  return `${currency === "USD" ? "US$" : `${currency} `}${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const manualProvider: PaymentProvider = {
  id: "manual",
  async paymentStep(invoice, settings) {
    return {
      kind: "instructions",
      payee: settings.payee_name,
      bankDetails: settings.bank_details,
      reference: invoice.reference,
      amount: formatMoney(invoice.total, invoice.currency),
      note: settings.payment_note,
      acceptsProof: true,
    };
  },
};

/** The active provider. Set BILLING_PROVIDER=stripe once a gateway is wired in (not available yet). */
export function paymentProvider(): PaymentProvider {
  const id = process.env.BILLING_PROVIDER ?? "manual";
  if (id !== "manual") console.warn(`[billing] provider "${id}" is not implemented; using manual payments`);
  return manualProvider;
}
