import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { Progress, StatusPill, fmtDate, money } from "@/components/portfolio";
import { Notice, btn, btnGhost, card } from "@/components/ui";
import { clearSample, loadSample } from "@/lib/actions/portfolio";
import { atLeast } from "@/lib/roles";
import { getLocale, getT, requireOrg, tpl } from "@/lib/session";
import { type Status, daysBetween, deadlineOf, licenceStatus, todayTci } from "@/lib/status";

type Row = {
  license_id: string; property_id: string; property_name: string; owner_name: string; area: string; is_sample: boolean;
  license_type: string; license_name_es: string; license_name_en: string; expires_on: string; filing_deadline: string | null;
  fee_estimate: number | null; required_items: number; required_done: number;
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; n?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, profile, user } = await requireOrg();
  const t = await getT();
  const p = t.portfolio;
  const lang = await getLocale();
  const today = todayTci();
  const isAdmin = atLeast(org.role, "admin");

  const { data } = await supabase.from("license_overview").select("*").eq("tenant_id", org.id);
  const rows = ((data ?? []) as Row[])
    .map((r) => ({ ...r, status: licenceStatus(r, today) as Status, days: daysBetween(today, deadlineOf(r)) }))
    .sort((a, b) => a.days - b.days);
  const { count: propertyCount } = await supabase.from("properties").select("id", { count: "exact", head: true }).eq("tenant_id", org.id);
  const hasSample = rows.some((r) => r.is_sample);
  const filter = (["bad", "warn", "ok"] as const).find((f) => f === sp.f);
  const shown = filter ? rows.filter((r) => r.status === filter) : rows;
  const n = (s: Status) => rows.filter((r) => r.status === s).length;
  const okMessages: Record<string, string> = { saved: p.saved, sampleCleared: p.sampleCleared, sampleLoaded: p.sampleLoaded, imported: tpl(p.imported, { n: sp.n ?? "0" }) };
  const okText = sp.ok ? okMessages[sp.ok] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{tpl(t.dashboard.welcome, { name: profile?.full_name || user.email || "" })}</h1>
          <p className="mt-1 text-sm text-muted">{org.name} · {t.dashboard.yourRole}: {t.roles[org.role]}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2" data-tour="import">
            <Link href="/properties#new" className={btnGhost}>{p.addProperty}</Link>
            <Link href="/import" className={btn}>{p.importCta}</Link>
          </div>
        )}
      </div>

      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {okText && <Notice kind="ok">{okText}</Notice>}

      {hasSample && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft p-4 text-sm">
          <span>{p.sampleBanner}</span>
          {isAdmin && (
            <form action={clearSample}><SubmitButton className={btnGhost} confirm={p.confirmClearSample}>{p.clearSample}</SubmitButton></form>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-tour="kpis">
        {[
          [String(rows.length), p.kpiLicences, ""],
          [String(n("bad")), p.kpiUrgent, "text-bad"],
          [String(n("warn")), p.kpiAttention, "text-warn"],
          [money(rows.reduce((s, r) => s + Number(r.fee_estimate ?? 0), 0)), p.kpiFees, ""],
        ].map(([v, l, c]) => (
          <div key={l} className={`${card} min-w-0 p-4`}>
            <b className={`block font-display text-3xl tabular-nums ${c}`}>{v}</b>
            <span className="text-xs text-muted">{l}</span>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className={`${card} text-center`}>
          <h2 className="text-lg font-semibold">{p.empty}</h2>
          <p className="mt-1 text-sm text-muted">{p.addFirst}</p>
          {isAdmin && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/import" className={btn}>{p.importCta}</Link>
              <Link href="/properties#new" className={btnGhost}>{p.addProperty}</Link>
              {!propertyCount && <form action={loadSample}><SubmitButton className={btnGhost}>{p.loadSample}</SubmitButton></form>}
            </div>
          )}
        </div>
      ) : (
        <section className={`${card} p-0`} data-tour="table">
          <nav className="flex flex-wrap gap-2 p-4" aria-label={p.colStatus}>
            {([["", p.filterAll], ["bad", p.status.bad], ["warn", p.status.warn], ["ok", p.status.ok]] as const).map(([f, label]) => (
              <Link key={f} href={f ? `/dashboard?f=${f}` : "/dashboard"} aria-current={(filter ?? "") === f ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${(filter ?? "") === f ? "border-brand bg-brand text-brand-fg" : "border-line"}`}>
                {label}{f ? ` · ${n(f)}` : ""}
              </Link>
            ))}
          </nav>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted">
                  {[p.colProperty, p.colType, p.colDeadline, p.colDays, p.colChecklist, p.colStatus].map((c) => <th key={c} className="px-4 py-2 font-medium">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.license_id} className="border-t border-line hover:bg-brand-soft/50">
                    <td className="px-4 py-3">
                      <Link href={`/properties/${r.property_id}`} className="font-semibold hover:underline">{r.property_name}</Link>
                      {r.is_sample && <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-[10px] uppercase text-muted">{p.sample}</span>}
                      <div className="text-xs text-muted">{[r.owner_name, r.area].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3">{lang === "en" ? r.license_name_en : r.license_name_es}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtDate(deadlineOf(r), lang)}</td>
                    <td className={`px-4 py-3 tabular-nums ${r.days < 0 ? "text-bad" : ""}`}>{r.days}</td>
                    <td className="px-4 py-3"><Progress done={r.required_done} total={r.required_items} /></td>
                    <td className="px-4 py-3"><StatusPill status={r.status} label={p.status[r.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line p-4 text-xs text-muted">{p.rulesNote}</p>
        </section>
      )}
    </div>
  );
}
