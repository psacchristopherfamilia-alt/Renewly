import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/components/portfolio";
import { Notice, btn, card } from "@/components/ui";
import { startRenewals } from "@/lib/actions/renewals";
import { atLeast } from "@/lib/roles";
import { getLocale, getT, requireOrg, tpl } from "@/lib/session";
import { deadlineOf } from "@/lib/status";

type Row = { license_id: string; property_name: string; license_name_es: string; license_name_en: string; expires_on: string; filing_deadline: string | null; is_sample: boolean };
type Ren = { id: string; license_id: string; status: string; cycle_expires_on: string };
type Req = { renewal_id: string; required: boolean; status: string };

// Batch view (the prototype's "Renovación en lote"): every current licence with its renewal and readiness.
export default async function Renewals({ searchParams }: { searchParams: Promise<{ ok?: string; n?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const t = await getT();
  const r = t.renewals;
  const lang = await getLocale();
  const isAdmin = atLeast(org.role, "admin");

  const [{ data: lic }, { data: ren }, { data: reqs }] = await Promise.all([
    supabase.from("license_overview").select("license_id, property_name, license_name_es, license_name_en, expires_on, filing_deadline, is_sample").eq("tenant_id", org.id),
    supabase.from("renewals").select("id, license_id, status, cycle_expires_on").eq("tenant_id", org.id),
    supabase.from("renewal_requirement_status").select("renewal_id, required, status").eq("tenant_id", org.id),
  ]);
  const rows = ((lic ?? []) as Row[]).sort((a, b) => deadlineOf(a).localeCompare(deadlineOf(b)));
  const renewals = (ren ?? []) as Ren[];
  const requirements = (reqs ?? []) as Req[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">{r.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">{r.intro}</p>
        <p className="mt-1 text-xs text-warn">{r.provisional}</p>
      </div>
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {sp.ok === "started" && <Notice kind="ok">{tpl(r.started, { n: sp.n ?? "0" })}</Notice>}

      {rows.length === 0 ? <p className={card}>{r.none}</p> : (
        <form action={startRenewals} className={`${card} p-0`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wider text-muted">
                {["", r.colProperty, r.colLicence, r.colDeadline, r.colStatus, r.colReady, ""].map((h, i) => <th key={i} className="px-4 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((x) => {
                  const rn = renewals.find((y) => y.license_id === x.license_id && y.cycle_expires_on === x.expires_on);
                  const mine = rn ? requirements.filter((q) => q.renewal_id === rn.id && q.required) : [];
                  const done = mine.filter((q) => q.status === "uploaded").length;
                  return (
                    <tr key={x.license_id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <input type="checkbox" name="license_id" value={x.license_id} aria-label={`${r.select} ${x.property_name}`} disabled={!isAdmin}
                          defaultChecked={!rn && !x.is_sample} className="h-4 w-4 accent-[var(--brand)]" />
                      </td>
                      <td className="px-4 py-3 font-medium">{x.property_name}</td>
                      <td className="px-4 py-3">{lang === "en" ? x.license_name_en : x.license_name_es}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtDate(deadlineOf(x), lang)}</td>
                      <td className="px-4 py-3">{rn ? r.status[rn.status] : <span className="text-muted">{r.notStarted}</span>}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {rn ? (done === mine.length && rn.status === "preparing" ? <span className="text-ok">{r.ready}</span> : tpl(r.readyCount, { done: String(done), total: String(mine.length) })) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{rn && <Link href={`/renewals/${rn.id}`} className="text-brand underline">{r.open}</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 border-t border-line p-4">
            {isAdmin && <SubmitButton className={btn}>{r.start}</SubmitButton>}
            {renewals.length > 0 && (
              <a href={`/renewals/package?${new URLSearchParams(renewals.filter((x) => x.status !== "withdrawn").map((x) => ["id", x.id]))}`} className="inline-flex items-center rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-brand">
                {r.downloadSelected}
              </a>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
