import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/components/portfolio";
import { Notice, btn, btnDanger, btnGhost, card, input, label } from "@/components/ui";
import { approvePayment, rejectProof, setSuspended, updatePlan, updateSettings } from "@/lib/actions/billing";
import { formatMoney } from "@/lib/billing/provider";
import { getLocale, getT, requireUser } from "@/lib/session";

type Overview = { mrr: number; active: number; trialing: number; pending: number; past_due: number; suspended: number; canceled_30d: number;
  open_amount: number; overdue_amount: number; proofs_waiting: number; paid_30d: number };
type Customer = { tenant_id: string; organization: string; owner_email: string | null; status: string; plan: string | null; quantity: number;
  properties: number; trial_ends_at: string | null; current_period_end: string | null; cancel_at: string | null; open_total: number };
type ProofInvoice = { id: string; number: string; reference: string; total: number; tenant_id: string; organizations: { name: string } | null;
  payment_proofs: { id: string; file_name: string; note: string; created_at: string }[] };

// The Renewly operator's billing dashboard. Every read and action is checked again in the database.
export default async function Platform({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) notFound();
  const t = await getT();
  const p = t.platform;
  const b = t.billing;
  const lang = await getLocale();

  const [{ data: ov }, { data: cust }, { data: proofs }, { data: settings }, { data: plans }] = await Promise.all([
    supabase.rpc("platform_overview"),
    supabase.rpc("platform_customers"),
    supabase.from("invoices").select("id, number, reference, total, tenant_id, organizations(name), payment_proofs(id, file_name, note, created_at)")
      .eq("status", "proof_received").order("issued_on"),
    supabase.from("billing_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("plans").select("*").order("sort"),
  ]);
  const o = (ov ?? {}) as Overview;
  const customers = (cust ?? []) as Customer[];
  const waiting = (proofs ?? []) as unknown as ProofInvoice[];
  const money = (n: number) => formatMoney(Number(n ?? 0));

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">{p.title}</h1>
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {sp.ok && <Notice kind="ok">{b.saved}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="platform-kpis">
        {([[money(o.mrr), p.mrr], [String(o.active ?? 0), p.active], [String(o.trialing ?? 0), p.trialing], [String(o.pending ?? 0), p.pending],
          [String(o.past_due ?? 0), p.pastDue], [String(o.suspended ?? 0), p.suspended], [String(o.canceled_30d ?? 0), p.canceled30],
          [money(o.paid_30d), p.paid30], [money(o.open_amount), p.openAmount], [money(o.overdue_amount), p.overdueAmount]] as const).map(([v, l]) => (
          <div key={l} className={`${card} p-4`}><b className="block font-display text-2xl tabular-nums">{v}</b><span className="text-xs text-muted">{l}</span></div>
        ))}
      </div>

      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">{p.proofs} ({waiting.length})</h2>
        {waiting.length === 0 ? <p className="text-sm text-muted">{p.noProofs}</p> : (
          <ul className="divide-y divide-line">
            {waiting.map((inv) => (
              <li key={inv.id} className="py-4" data-testid="proof-row">
                <p className="font-medium">{inv.organizations?.name} · {inv.number} · <span className="font-mono">{inv.reference}</span> · {money(inv.total)}</p>
                <ul className="mt-1 text-sm">
                  {inv.payment_proofs.map((pf) => (
                    <li key={pf.id}>
                      <a href={`/billing/proofs/${pf.id}`} target="_blank" rel="noopener" className="text-brand underline">{p.viewProof}: {pf.file_name}</a>
                      <span className="text-muted"> · {fmtDate(pf.created_at.slice(0, 10), lang)}{pf.note && ` · ${pf.note}`}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <form action={approvePayment} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="invoice_id" value={inv.id} />
                    <label className={label}>{p.method}
                      <select name="method" className={input}>{Object.entries(p.methods).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    </label>
                    <label className={label}>{p.bankRef}<input name="reference" maxLength={120} className={input} /></label>
                    <SubmitButton className={btn}>{p.approve}</SubmitButton>
                  </form>
                  <form action={rejectProof} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="invoice_id" value={inv.id} />
                    <label className={`${label} flex-1`}>{p.reason}<input name="reason" required maxLength={500} className={input} /></label>
                    <SubmitButton className={btnDanger}>{p.reject}</SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} p-0`}>
        <h2 className="p-5 pb-2 text-lg font-semibold">{p.customers} ({customers.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-muted">
              {[p.colOrg, p.colStatus, p.colPlan, p.colProps, p.colUntil, p.colOpen, ""].map((h, i) => <th key={i} className="px-4 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.tenant_id} className="border-t border-line">
                  <td className="px-4 py-2"><b className="font-medium">{c.organization}</b><div className="text-xs text-muted">{c.owner_email}</div></td>
                  <td className="px-4 py-2">{b.status[c.status]}</td>
                  <td className="px-4 py-2">{c.plan ?? "—"}{c.plan === "per_property" && ` × ${c.quantity}`}</td>
                  <td className="px-4 py-2 tabular-nums">{c.properties}</td>
                  <td className="px-4 py-2 tabular-nums">{c.current_period_end ? fmtDate(c.current_period_end, lang) : c.trial_ends_at ? fmtDate(c.trial_ends_at, lang) : "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{money(c.open_total)}</td>
                  <td className="px-4 py-2">
                    <form action={setSuspended}>
                      <input type="hidden" name="tenant_id" value={c.tenant_id} />
                      <input type="hidden" name="suspend" value={String(c.status !== "suspended")} />
                      <SubmitButton className={c.status === "suspended" ? btnGhost : btnDanger} confirm={c.status === "suspended" ? undefined : p.confirmSuspend}>
                        {c.status === "suspended" ? p.reactivate : p.suspend}
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">{p.settings}</h2>
        <form action={updateSettings} className="grid gap-4 sm:grid-cols-3">
          {([["trial_days", p.trialDays], ["grace_days", p.graceDays], ["invoice_due_days", p.dueDays], ["renewal_notice_days", p.renewalDays],
            ["volume_discount_from", p.discountFrom], ["volume_discount_pct", p.discountPct], ["tax_pct", p.taxPct]] as const).map(([k, l]) => (
            <label key={k} className={label}>{l}<input name={k} inputMode="decimal" defaultValue={String(settings?.[k] ?? "")} className={input} /></label>
          ))}
          <label className={label}>{p.taxLabel}<input name="tax_label" maxLength={60} defaultValue={settings?.tax_label ?? ""} className={input} /></label>
          <label className={label}>{p.payee}<input name="payee_name" maxLength={160} defaultValue={settings?.payee_name ?? ""} className={input} /></label>
          <label className={label}>{p.support}<input name="support_email" type="email" maxLength={200} defaultValue={settings?.support_email ?? ""} className={input} /></label>
          <label className={`${label} sm:col-span-3`}>{p.payeeAddress}<textarea name="payee_address" rows={2} maxLength={400} defaultValue={settings?.payee_address ?? ""} className={input} /></label>
          <label className={`${label} sm:col-span-3`}>{p.bank}<textarea name="bank_details" rows={4} maxLength={2000} defaultValue={settings?.bank_details ?? ""} className={input} /></label>
          <label className={`${label} sm:col-span-3`}>{p.payNote}<textarea name="payment_note" rows={2} maxLength={1000} defaultValue={settings?.payment_note ?? ""} className={input} /></label>
          <div className="sm:col-span-3"><SubmitButton className={btn}>{t.common.save}</SubmitButton></div>
        </form>
      </section>

      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">{p.plansTitle}</h2>
        <div className="space-y-3">
          {(plans ?? []).map((pl) => (
            <form key={pl.code} action={updatePlan} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
              <input type="hidden" name="code" value={pl.code} />
              <p className="font-medium">{lang === "en" ? pl.name_en : pl.name_es}</p>
              <label className={label}>{p.price}<input name="unit_price" inputMode="decimal" defaultValue={String(pl.unit_price)} className={input} /></label>
              <label className={label}>{p.maxProps}<input name="max_properties" inputMode="numeric" defaultValue={pl.max_properties ?? ""} className={input} /></label>
              <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={pl.active} /> {p.activePlan}</label>
              <SubmitButton className={btnGhost}>{t.common.save}</SubmitButton>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
