import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/components/portfolio";
import { Notice, btn, btnGhost, card, input, label } from "@/components/ui";
import { choosePlan, setCancel, uploadProof } from "@/lib/actions/billing";
import { formatMoney, paymentProvider } from "@/lib/billing/provider";
import { atLeast } from "@/lib/roles";
import { getLocale, getT, requireOrg, tpl } from "@/lib/session";

type Plan = { code: string; name_es: string; name_en: string; pricing: "per_unit" | "flat"; unit_price: number; max_properties: number | null };
type Sub = {
  plan: string | null; quantity: number; status: string; trial_ends_at: string | null; current_period_end: string | null;
  pending_plan: string | null; pending_quantity: number | null; cancel_at: string | null;
};
type Invoice = {
  id: string; number: string; reference: string; kind: string; total: number; currency: string; status: string;
  issued_on: string; due_on: string; period_start: string; period_end: string; rejected_reason: string | null;
};

export default async function Billing({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  if (!atLeast(org.role, "admin")) redirect("/dashboard");
  const t = await getT();
  const b = t.billing;
  const lang = await getLocale();
  const isOwner = org.role === "owner";

  const [{ data: sub }, { data: plans }, { data: settings }, { data: invoices }, { data: used }, { data: limit }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("tenant_id", org.id).maybeSingle(),
    supabase.from("plans").select("*").eq("active", true).order("sort"),
    supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("invoices").select("*").eq("tenant_id", org.id).order("issued_on", { ascending: false }).order("number", { ascending: false }),
    supabase.rpc("properties_in_use", { p_tenant: org.id }),
    supabase.rpc("property_limit", { p_tenant: org.id }),
  ]);
  const s = sub as Sub | null;
  const ps = (plans ?? []) as Plan[];
  const invs = (invoices ?? []) as Invoice[];
  const open = invs.filter((i) => i.status === "open" || i.status === "proof_received");
  const planName = (code: string | null) => { const p = ps.find((x) => x.code === code); return p ? (lang === "en" ? p.name_en : p.name_es) : "—"; };
  const provider = paymentProvider();
  const pct = Number(settings?.volume_discount_pct ?? 0);
  const steps = await Promise.all(open.map((inv) => provider.paymentStep({ ...inv, total: Number(inv.total) }, {
    payee_name: settings?.payee_name ?? "", payee_address: settings?.payee_address ?? "", bank_details: settings?.bank_details ?? "",
    payment_note: settings?.payment_note ?? "", support_email: settings?.support_email ?? "",
  })));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">{b.title}</h1>
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {sp.ok && <Notice kind="ok">{sp.ok === "proofSent" ? b.proofSent : b.saved}</Notice>}

      <section className={`${card} grid gap-4 sm:grid-cols-3`}>
        <div>
          <p className="text-xs text-muted">{b.current}</p>
          <p className="font-display text-2xl">{s?.plan ? planName(s.plan) : b.status.trialing}</p>
          <p className="mt-1 inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand" data-testid="sub-status">{b.status[s?.status ?? "trialing"]}</p>
        </div>
        <div className="text-sm">
          {s?.status === "trialing" && s.trial_ends_at && <p>{tpl(b.trialUntil, { date: fmtDate(s.trial_ends_at, lang) })}</p>}
          {s?.current_period_end && <p>{tpl(b.activeUntil, { date: fmtDate(s.current_period_end, lang) })}</p>}
          {s?.cancel_at && <p className="text-bad">{tpl(b.cancelsOn, { date: fmtDate(s.cancel_at, lang) })}</p>}
          {s?.pending_plan && <p className="text-muted">{tpl(b.pendingChange, { plan: planName(s.pending_plan), n: String(s.pending_quantity ?? 1) })}</p>}
        </div>
        <div>
          <p className="text-xs text-muted">{b.usage}</p>
          <p className="font-display text-2xl tabular-nums">{tpl(b.usageOf, { used: String(used ?? 0), limit: String(limit ?? 0) })}</p>
          <p className="text-xs text-muted">{b.sampleNotCounted}</p>
        </div>
      </section>

      {open.map((inv, idx) => {
        const step = steps[idx];
        return (
          <section key={inv.id} className={`${card} border-brand`} data-testid="pay-box">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{b.payTitle} · {inv.number}</h2>
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">{b.invStatus[inv.status]}</span>
            </div>
            {inv.rejected_reason && <div className="mt-3"><Notice kind="error">{tpl(b.rejected, { reason: inv.rejected_reason })}</Notice></div>}
            {step.kind === "instructions" && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="text-sm">
                  <p>{b.payIntro}</p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-wider" data-testid="pay-reference">{step.reference}</p>
                  <p className="mt-2">{b.amount}: <b>{step.amount}</b> · {tpl(b.dueOn, { date: fmtDate(inv.due_on, lang) })}</p>
                </div>
                <div className="rounded-lg bg-bg p-3 text-sm">
                  <p className="font-semibold">{step.payee}</p>
                  <p className="whitespace-pre-line">{step.bankDetails || b.noBank}</p>
                  {step.note && <p className="mt-2 text-xs text-muted">{step.note}</p>}
                </div>
              </div>
            )}
            <form action={uploadProof} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="invoice_id" value={inv.id} />
              <label className={label}>{b.uploadProof}<input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className={input} />
                <span className="text-xs font-normal text-muted">{b.proofHint}</span></label>
              <label className={label}>{b.proofNote}<input name="note" maxLength={500} className={input} /></label>
              <SubmitButton className={btn}>{b.uploadProof}</SubmitButton>
            </form>
            <a href={`/billing/invoices/${inv.id}/pdf`} className="mt-3 inline-block text-sm text-brand underline">{b.download}</a>
          </section>
        );
      })}

      <section className={card}>
        <h2 className="text-lg font-semibold">{b.plans}</h2>
        <p className="text-xs text-muted">{b.estimate}{pct > 0 && ` · ${tpl(b.discountNote, { pct: String(pct), n: String(settings?.volume_discount_from ?? 10) })}`}</p>
        {!isOwner && <p className="mt-2 text-sm text-muted">{b.onlyOwner}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {ps.map((p) => (
            <form key={p.code} action={choosePlan} className={`rounded-xl border p-5 ${s?.plan === p.code ? "border-brand" : "border-line"}`}>
              <input type="hidden" name="plan" value={p.code} />
              <h3 className="font-semibold">{lang === "en" ? p.name_en : p.name_es}</h3>
              <p className="mt-2"><b className="font-display text-3xl">{formatMoney(Number(p.unit_price))}</b><span className="text-muted">{b.perMonth}</span></p>
              <p className="text-sm text-muted">{p.pricing === "per_unit" ? b.perProperty : tpl(b.upTo, { n: String(p.max_properties ?? "∞") })}</p>
              {p.pricing === "per_unit" && (
                <label className={`${label} mt-3`}>{b.quantity}
                  <input name="quantity" type="number" min={Math.max(1, Number(used ?? 0))} max={5000} defaultValue={s?.plan === p.code ? s.quantity : Math.max(1, Number(used ?? 1))} className={input} disabled={!isOwner} />
                </label>
              )}
              {isOwner && <SubmitButton className={`${s?.plan === p.code ? btnGhost : btn} mt-4`}>{b.choose}</SubmitButton>}
            </form>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">{b.invoices}</h2>
        {invs.length === 0 ? <p className="text-sm text-muted">{b.noInvoices}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody>
                {invs.map((i) => (
                  <tr key={i.id} className="border-t border-line first:border-t-0">
                    <td className="py-2 pr-3 font-medium">{i.number}</td>
                    <td className="py-2 pr-3 text-muted">{fmtDate(i.period_start, lang)} – {fmtDate(i.period_end, lang)}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatMoney(Number(i.total), i.currency)}</td>
                    <td className="py-2 pr-3">{b.invStatus[i.status]}</td>
                    <td className="py-2 text-right"><a href={`/billing/invoices/${i.id}/pdf`} className="text-brand underline">{i.status === "paid" ? b.receipt : b.download}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOwner && s?.plan && s.status !== "canceled" && (
        <form action={setCancel}>
          <input type="hidden" name="cancel" value={String(!s.cancel_at)} />
          <SubmitButton className={s.cancel_at ? btnGhost : "text-sm text-bad underline"} confirm={s.cancel_at ? undefined : b.confirmCancel}>
            {s.cancel_at ? b.resume : b.cancel}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
