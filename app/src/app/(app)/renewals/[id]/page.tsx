import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/components/portfolio";
import { Notice, btn, btnDanger, btnGhost, card, input, label } from "@/components/ui";
import { attachDocument, markSubmitted, recordResponse, saveAnswers, saveForm, uploadAndAttach, withdraw } from "@/lib/actions/renewals";
import { atLeast } from "@/lib/roles";
import { getLocale, getT, requireOrg, tpl } from "@/lib/session";

type Renewal = {
  id: string; status: string; answers: Record<string, boolean>; form_data: Record<string, string>; cycle_expires_on: string;
  portal_reference: string | null; submitted_at: string | null; decision_note: string | null; license_id: string;
  licenses: { license_type: string; property_id: string; properties: { name: string }; license_types: { name_es: string; name_en: string; portal_name: string; portal_url: string | null; filing_month: number | null; filing_day: number | null; templates_confirmed: boolean } };
};
type Req = { id: string; code: string; label: string; required: boolean; doc_kind: string; source: string; document_id: string | null; status: "uploaded" | "missing" | "expired"; file_name: string | null; document_expires_on: string | null };
type Q = { code: string; label_es: string; label_en: string };
type Ev = { id: number; kind: string; note: string | null; created_at: string; actor_id: string | null };

const EDITABLE = ["preparing", "info_requested"];
const pill = { uploaded: "bg-ok-soft text-ok", missing: "bg-bad-soft text-bad", expired: "bg-warn-soft text-warn" };

export default async function RenewalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const t = await getT();
  const r = t.renewals;
  const lang = await getLocale();
  const isAdmin = atLeast(org.role, "admin");
  const canWork = atLeast(org.role, "operator");

  const { data: raw } = await supabase.from("renewals")
    .select("*, licenses(license_type, property_id, properties(name), license_types(name_es, name_en, portal_name, portal_url, filing_month, filing_day, templates_confirmed))")
    .eq("id", id).eq("tenant_id", org.id).maybeSingle();
  if (!raw) notFound();
  const ren = raw as unknown as Renewal;
  const lt = ren.licenses.license_types;
  const [{ data: reqRaw }, { data: qs }, { data: docs }, { data: evs }, { data: people }] = await Promise.all([
    supabase.from("renewal_requirement_status").select("*").eq("renewal_id", id).order("sort"),
    supabase.from("renewal_questions").select("code, label_es, label_en").eq("license_type", ren.licenses.license_type).order("sort"),
    supabase.from("documents").select("id, file_name, expires_on").eq("property_id", ren.licenses.property_id).order("created_at", { ascending: false }),
    supabase.from("renewal_events").select("id, kind, note, created_at, actor_id").eq("renewal_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const reqs = (reqRaw ?? []) as Req[];
  const blockers = reqs.filter((q) => q.required && q.status !== "uploaded");
  const editable = EDITABLE.includes(ren.status);
  const year = ren.cycle_expires_on.slice(0, 4);
  const deadline = lt.filing_month ? `${year}-${String(lt.filing_month).padStart(2, "0")}-${String(lt.filing_day).padStart(2, "0")}` : ren.cycle_expires_on;
  const who = (u: string | null) => people?.find((p) => p.id === u)?.full_name || people?.find((p) => p.id === u)?.email || "";
  const docOptions = (docs ?? []) as { id: string; file_name: string; expires_on: string | null }[];

  return (
    <div className="space-y-6">
      <Link href="/renewals" className="text-sm text-muted hover:text-fg">← {r.back}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{ren.licenses.properties.name}</h1>
          <p className="text-sm text-muted">{lang === "en" ? lt.name_en : lt.name_es} · {t.portfolio.colDeadline}: {fmtDate(deadline, lang)}</p>
        </div>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand" data-testid="renewal-status">{r.status[ren.status]}</span>
      </div>
      {!lt.templates_confirmed && <p className="text-xs text-warn">{r.provisional}</p>}
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {sp.ok && <Notice kind="ok">{r.saved}</Notice>}
      {ren.decision_note && <Notice kind={ren.status === "approved" ? "ok" : "error"}>{ren.decision_note}</Notice>}

      {(qs ?? []).length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">{r.step1}</h2>
          <p className="text-xs text-muted">{r.step1Hint}</p>
          <form action={saveAnswers} className="mt-3 space-y-3">
            <input type="hidden" name="renewal_id" value={id} />
            {(qs as Q[]).map((q) => (
              <fieldset key={q.code} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0" disabled={!isAdmin || !editable}>
                <legend className="sr-only">{lang === "en" ? q.label_en : q.label_es}</legend>
                <span className="text-sm">{lang === "en" ? q.label_en : q.label_es}</span>
                <span className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="radio" name={`q_${q.code}`} value="yes" defaultChecked={ren.answers?.[q.code] === true} /> {lang === "en" ? "Yes" : "Sí"}</label>
                  <label className="flex items-center gap-1"><input type="radio" name={`q_${q.code}`} value="no" defaultChecked={ren.answers?.[q.code] !== true} /> No</label>
                </span>
              </fieldset>
            ))}
            {isAdmin && editable && <SubmitButton className={btnGhost}>{r.saveAnswers}</SubmitButton>}
          </form>
        </section>
      )}

      <section id="documents" className={card}>
        <h2 className="font-semibold">{r.step2}</h2>
        <ul className="mt-2 divide-y divide-line">
          {reqs.map((q) => (
            <li key={q.id} className="py-3" data-testid="requirement">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {q.label}
                  {!q.required && <span className="text-xs text-muted"> ({r.optional})</span>}
                  {q.source === "office_request" && <span className="text-xs text-warn"> · {r.fromOffice}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill[q.status]}`}>{r.reqStatus[q.status]}</span>
              </div>
              {q.file_name && (
                <p className="mt-1 text-xs text-muted">
                  <a href={`/documents/${q.document_id}`} target="_blank" rel="noopener" className="underline">{q.file_name}</a>
                  {q.document_expires_on && ` · ${t.portfolio.expiresOn}: ${fmtDate(q.document_expires_on, lang)}`}
                </p>
              )}
              {canWork && editable && (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <form action={attachDocument} className="flex gap-2">
                    <input type="hidden" name="renewal_id" value={id} />
                    <input type="hidden" name="requirement_id" value={q.id} />
                    <select name="document_id" defaultValue={q.document_id ?? ""} aria-label={`${r.chooseDoc}: ${q.label}`} className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-xs">
                      <option value="">{r.chooseDoc}</option>
                      {docOptions.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
                    </select>
                    <SubmitButton className="text-xs text-brand underline">{r.attach}</SubmitButton>
                  </form>
                  <form action={uploadAndAttach} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="renewal_id" value={id} />
                    <input type="hidden" name="requirement_id" value={q.id} />
                    <input type="hidden" name="doc_kind" value={q.doc_kind} />
                    <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" aria-label={`${r.uploadNew}: ${q.label}`} className="min-w-0 flex-1 text-xs" />
                    <input name="expires_on" type="date" aria-label={`${r.expiresOn}: ${q.label}`} className="rounded border border-line bg-surface px-1 py-0.5 text-xs" />
                    <SubmitButton className="text-xs text-brand underline">{r.attachUpload}</SubmitButton>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-semibold">{r.step3}</h2>
        <p className="text-xs text-muted">{r.step3Hint}</p>
        <form action={saveForm} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="renewal_id" value={id} />
          {Object.entries(r.fields).map(([k, l]) => (
            <label key={k} className={label}>{l}<input name={`f_${k}`} defaultValue={ren.form_data?.[k] ?? ""} maxLength={300} disabled={!isAdmin || !editable} className={input} /></label>
          ))}
          {isAdmin && editable && <div className="sm:col-span-2"><SubmitButton className={btnGhost}>{r.saveForm}</SubmitButton></div>}
        </form>
      </section>

      <section className={card}>
        <h2 className="font-semibold">{r.step4}</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <a href={`/renewals/${id}/package`} className={btnGhost}>{r.package}</a>
          {lt.portal_url && <a href={lt.portal_url} target="_blank" rel="noopener noreferrer" className={btnGhost}>{tpl(r.openPortal, { portal: lt.portal_name })} ↗</a>}
        </div>
        {ren.submitted_at && <p className="mt-3 text-sm">{tpl(r.submittedOn, { date: fmtDate(ren.submitted_at.slice(0, 10), lang), ref: ren.portal_reference ?? "" })}</p>}
        {editable && isAdmin && (
          blockers.length > 0 ? (
            <div className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad" data-testid="blockers">
              <p className="font-semibold">{r.blocked}</p>
              <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b.id}>{b.label} — {r.reqStatus[b.status]}</li>)}</ul>
              <button disabled className={`${btn} mt-3`}>{r.markSubmitted}</button>
            </div>
          ) : (
            <form action={markSubmitted} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="renewal_id" value={id} />
              <label className={label}>{r.portalRef}<input name="portal_reference" required minLength={3} maxLength={120} className={input} /></label>
              <label className={label}>{r.receipt}<input name="receipt" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className={input} /></label>
              <SubmitButton className={btn}>{r.markSubmitted}</SubmitButton>
            </form>
          )
        )}
      </section>

      {isAdmin && ["submitted", "info_requested"].includes(ren.status) && (
        <section className={card}>
          <h2 className="font-semibold">{r.step5}</h2>
          <p className="text-xs text-muted">{r.notYet}</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <form action={recordResponse} className="space-y-2 rounded-lg border border-line p-3">
              <input type="hidden" name="renewal_id" value={id} />
              <input type="hidden" name="kind" value="approved" />
              <h3 className="text-sm font-semibold text-ok">{r.approved}</h3>
              <label className={label}>{r.newExpiry}<input name="new_expiry" type="date" required className={input} /></label>
              <label className={label}>{r.newNumber}<input name="new_number" maxLength={60} className={input} /></label>
              <label className={label}>{r.newLicence}<input name="new_licence" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className={input} /></label>
              <SubmitButton className={btn}>{r.recordApproved}</SubmitButton>
            </form>
            <form action={recordResponse} className="space-y-2 rounded-lg border border-line p-3">
              <input type="hidden" name="renewal_id" value={id} />
              <input type="hidden" name="kind" value="info_requested" />
              <h3 className="text-sm font-semibold text-warn">{r.infoRequested}</h3>
              <label className={label}>{r.extraDocs}<textarea name="extra" rows={3} className={input} /></label>
              <label className={label}>{r.note}<input name="note" maxLength={1000} className={input} /></label>
              <SubmitButton className={btnGhost}>{r.recordInfo}</SubmitButton>
            </form>
            <form action={recordResponse} className="space-y-2 rounded-lg border border-line p-3">
              <input type="hidden" name="renewal_id" value={id} />
              <input type="hidden" name="kind" value="rejected" />
              <h3 className="text-sm font-semibold text-bad">{r.rejected}</h3>
              <label className={label}>{r.reason}<textarea name="note" rows={3} required minLength={3} maxLength={1000} className={input} /></label>
              <SubmitButton className={btnDanger}>{r.recordRejected}</SubmitButton>
            </form>
          </div>
        </section>
      )}

      <section className={card}>
        <h2 className="mb-2 font-semibold">{r.timeline}</h2>
        <ol className="space-y-2 text-sm">
          {((evs ?? []) as Ev[]).map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0">
              <span>{r.events[e.kind] ?? e.kind}{e.note && <span className="text-muted"> · {e.note}</span>}{who(e.actor_id) && <span className="text-muted"> · {who(e.actor_id)}</span>}</span>
              <time className="text-xs text-muted">{new Date(e.created_at).toLocaleString(lang === "en" ? "en-GB" : "es", { dateStyle: "short", timeStyle: "short", timeZone: "America/Grand_Turk" })}</time>
            </li>
          ))}
        </ol>
        {isAdmin && !["approved", "withdrawn"].includes(ren.status) && (
          <form action={withdraw} className="mt-4">
            <input type="hidden" name="renewal_id" value={id} />
            <SubmitButton className="text-xs text-bad underline" confirm={r.confirmWithdraw}>{r.withdraw}</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
