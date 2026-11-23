import { NextResponse, type NextRequest } from "next/server";
import { invoicePdf } from "@/lib/billing/pdf";
import { getLocale } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Invoice (or receipt once paid) as PDF. RLS decides access: owners/admins of the organisation, platform admins.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("*, organizations(name), plans(name_es, name_en)").eq("id", id).maybeSingle();
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const [{ data: s }, { data: owner }] = await Promise.all([
    supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("memberships").select("profiles!memberships_user_id_profiles_fkey(email)").eq("tenant_id", inv.tenant_id).eq("role", "owner").limit(1).maybeSingle(),
  ]);
  const locale = await getLocale();
  const bytes = await invoicePdf({
    locale, number: inv.number, reference: inv.reference, status: inv.status, kind: inv.kind,
    issued_on: inv.issued_on, due_on: inv.due_on, period_start: inv.period_start, period_end: inv.period_end,
    plan_name: (locale === "en" ? inv.plans?.name_en : inv.plans?.name_es) ?? inv.plan,
    quantity: inv.quantity, unit_price: Number(inv.unit_price), subtotal: Number(inv.subtotal), discount: Number(inv.discount),
    tax: Number(inv.tax), tax_label: s?.tax_label ?? "", total: Number(inv.total), currency: inv.currency,
    paid_at: inv.paid_at, paid_method: inv.paid_method, paid_reference: inv.paid_reference,
    customer_name: inv.organizations?.name ?? "", customer_email: (owner as { profiles?: { email?: string } } | null)?.profiles?.email ?? "",
    payee_name: s?.payee_name ?? "Renewly", payee_address: s?.payee_address ?? "", bank_details: s?.bank_details ?? "",
    payment_note: s?.payment_note ?? "", support_email: s?.support_email ?? "",
  });
  const kind = inv.status === "paid" ? (locale === "en" ? "receipt" : "recibo") : (locale === "en" ? "invoice" : "factura");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${kind}-${inv.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
