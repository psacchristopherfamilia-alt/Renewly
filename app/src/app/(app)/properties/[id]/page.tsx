import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertyFields } from "@/components/PropertyFields";
import { SubmitButton } from "@/components/SubmitButton";
import { StatusPill, fmtDate, money } from "@/components/portfolio";
import { Notice, btn, btnDanger, btnGhost, card, input, label } from "@/components/ui";
import {
  addLicence, deleteDocument, deleteProperty, saveItemNote, toggleItem, updateProperty, uploadDocument,
} from "@/lib/actions/portfolio";
import { atLeast } from "@/lib/roles";
import { getLocale, getT, requireOrg, tpl } from "@/lib/session";
import { daysBetween, deadlineOf, licenceStatus, todayTci } from "@/lib/status";

type Item = { id: string; label: string; required: boolean; requires_document: boolean; done: boolean; done_by: string | null; notes: string; sort: number };
type Licence = {
  id: string; license_type: string; license_number: string; expires_on: string; fee_estimate: number | null;
  license_types: { name_es: string; name_en: string; filing_month: number | null; filing_day: number | null; rules_confirmed: boolean };
  checklist_items: Item[];
};
type Doc = { id: string; file_name: string; kind: string; checklist_item_id: string | null; created_at: string };

const KINDS = ["licence", "inspection", "insurance", "signage_photo", "receipt", "form", "other"];

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const t = await getT();
  const p = t.portfolio;
  const lang = await getLocale();
  const today = todayTci();
  const isAdmin = atLeast(org.role, "admin");
  const canWork = atLeast(org.role, "operator");

  const { data: prop } = await supabase.from("properties").select("*").eq("id", id).eq("tenant_id", org.id).maybeSingle();
  if (!prop) notFound();
  const { data: licRaw } = await supabase.from("licenses")
    .select("id, license_type, license_number, expires_on, fee_estimate, license_types(name_es, name_en, filing_month, filing_day, rules_confirmed), checklist_items(id, label, required, requires_document, done, done_by, notes, sort)")
    .eq("property_id", id).is("archived_at", null).order("expires_on");
  const licences = (licRaw ?? []) as unknown as Licence[];
  const { data: docRaw } = await supabase.from("documents").select("id, file_name, kind, checklist_item_id, created_at").eq("property_id", id).order("created_at", { ascending: false });
  const docs = (docRaw ?? []) as Doc[];
  const { data: types } = await supabase.from("license_types").select("code, name_es, name_en");
  const { data: people } = await supabase.from("profiles").select("id, full_name, email");
  const who = (uid: string | null) => people?.find((x) => x.id === uid)?.full_name || people?.find((x) => x.id === uid)?.email || "—";
  const okText = sp.ok === "saved" ? p.saved : undefined;

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-muted hover:text-fg">← {p.back}</Link>
      <div>
        <h1 className="font-display text-3xl">{prop.name}</h1>
        <p className="mt-1 text-sm text-muted">{[p.islands[prop.island], prop.area, prop.owner_name].filter(Boolean).join(" · ")}</p>
      </div>
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {okText && <Notice kind="ok">{okText}</Notice>}

      {licences.map((l) => {
        const filing = l.license_types.filing_month ? `${l.expires_on.slice(0, 4)}-${String(l.license_types.filing_month).padStart(2, "0")}-${String(l.license_types.filing_day).padStart(2, "0")}` : null;
        const items = [...l.checklist_items].sort((a, b) => a.sort - b.sort);
        const required = items.filter((i) => i.required);
        const row = { expires_on: l.expires_on, filing_deadline: filing, required_items: required.length, required_done: required.filter((i) => i.done).length };
        const status = licenceStatus(row, today);
        const days = daysBetween(today, deadlineOf(row));
        const pending = required.length - row.required_done;
        return (
          <section key={l.id} className="grid gap-4 lg:grid-cols-[1fr_1.4fr]" data-tour="checklist">
            <div className={card}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-xl">{lang === "en" ? l.license_types.name_en : l.license_types.name_es}</h2>
                <StatusPill status={status} label={p.status[status]} />
              </div>
              {l.license_number && <p className="text-xs text-muted">#{l.license_number}</p>}
              <p className="mt-3 font-display text-4xl tabular-nums">{Math.abs(days)}</p>
              <p className="text-sm">{days < 0 ? tpl(p.overdue, { n: String(-days) }) : tpl(p.daysLeft, { n: String(days) })}</p>
              <p className="mt-2 text-xs text-muted">
                {tpl(p.deadline, { date: fmtDate(deadlineOf(row), lang) })}{!l.license_types.rules_confirmed && ` (${p.toConfirm})`} · {tpl(p.expires, { date: fmtDate(l.expires_on, lang) })} · {p.fee.replace(" (USD)", "")}: {money(l.fee_estimate)}
              </p>
              {days <= 14 && <p className="mt-3 rounded-md bg-bad-soft p-3 text-sm text-bad">{p.renewNow}</p>}
            </div>
            <div className={card}>
              <h3 className="font-display text-lg">{p.checklist}</h3>
              <p className="text-xs text-muted">{pending ? tpl(p.pending, { n: String(pending) }) : p.allDone}</p>
              <ul className="mt-2">
                {items.map((i) => (
                  <li key={i.id} id={`item-${i.id}`} className="border-t border-line py-3 first:border-t-0">
                    <div className="flex items-start gap-3">
                      <form action={toggleItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="property_id" value={id} />
                        <input type="hidden" name="done" value={String(!i.done)} />
                        <button disabled={!canWork} aria-pressed={i.done} aria-label={i.label}
                          className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs ${i.done ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface"} disabled:opacity-60`}>
                          {i.done ? "✓" : ""}
                        </button>
                      </form>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${i.done ? "text-muted line-through" : ""}`}>{i.label}</p>
                        <p className="text-xs text-muted">
                          {i.done && tpl(p.doneBy, { name: who(i.done_by) })}
                          {i.requires_document && <>{i.done ? " · " : ""}{p.needsDoc}{docs.some((d) => d.checklist_item_id === i.id) ? " ✓" : ""}</>}
                        </p>
                        {canWork ? (
                          <form action={saveItemNote} className="mt-1 flex gap-2">
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="property_id" value={id} />
                            <input name="notes" defaultValue={i.notes} placeholder={p.notesPlaceholder} maxLength={2000} aria-label={p.notesPlaceholder}
                              className="w-full rounded border border-line bg-surface px-2 py-1 text-xs" />
                            <SubmitButton className="whitespace-nowrap text-xs text-brand underline">{p.saveNote}</SubmitButton>
                          </form>
                        ) : i.notes ? <p className="text-xs">{i.notes}</p> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">{p.documents}</h2>
        {docs.length === 0 ? <p className="text-sm text-muted">{p.noDocs}</p> : (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{d.file_name} <span className="text-xs text-muted">· {p.kinds[d.kind]} · {fmtDate(d.created_at.slice(0, 10), lang)}</span></span>
                <span className="flex items-center gap-3">
                  <a href={`/documents/${d.id}`} target="_blank" rel="noopener" className="text-brand underline">{p.open}</a>
                  {isAdmin && (
                    <form action={deleteDocument}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="property_id" value={id} />
                      <SubmitButton className={btnDanger} confirm={p.confirmRemove}>{p.remove}</SubmitButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canWork && (
          <form action={uploadDocument} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <input type="hidden" name="property_id" value={id} />
            <label className={`${label} sm:col-span-2`}>
              {p.upload}
              <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className={input} />
              <span className="text-xs font-normal text-muted">{p.uploadHint}</span>
            </label>
            <label className={label}>
              {p.kind}
              <select name="kind" defaultValue="inspection" className={input}>
                {KINDS.map((k) => <option key={k} value={k}>{p.kinds[k]}</option>)}
              </select>
            </label>
            <label className={label}>
              {p.attachTo}
              <select name="checklist_item_id" defaultValue="" className={input}>
                <option value="">{p.none}</option>
                {licences.flatMap((l) => l.checklist_items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>))}
              </select>
            </label>
            <input type="hidden" name="license_id" value={licences.length === 1 ? licences[0].id : ""} />
            <div className="sm:col-span-2"><SubmitButton className={btn}>{p.upload}</SubmitButton></div>
          </form>
        )}
      </section>

      {isAdmin && (
        <>
          <section className={card}>
            <h2 className="mb-3 text-lg font-semibold">{p.addLicence}</h2>
            <form action={addLicence} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="property_id" value={id} />
              <label className={label}>
                {p.licenceType}
                <select name="license_type" className={input}>
                  {(types ?? []).map((x) => <option key={x.code} value={x.code}>{lang === "en" ? x.name_en : x.name_es}</option>)}
                </select>
              </label>
              <label className={label}>
                {p.expiresOn}
                <input name="expires_on" type="date" className={input} />
                <span className="text-xs font-normal text-muted">{p.expiresHint}</span>
              </label>
              <label className={label}>{p.number}<input name="license_number" maxLength={60} className={input} /></label>
              <label className={label}>{p.fee}<input name="fee_estimate" inputMode="decimal" pattern="\d+(\.\d{1,2})?" className={input} /></label>
              <div className="sm:col-span-2"><SubmitButton className={btnGhost}>{p.addLicence}</SubmitButton></div>
            </form>
          </section>

          <section className={card}>
            <form action={updateProperty} className="space-y-4">
              <input type="hidden" name="id" value={id} />
              <PropertyFields p={p} v={prop} />
              <SubmitButton className={btn}>{p.save}</SubmitButton>
            </form>
            <form action={deleteProperty} className="mt-6 border-t border-line pt-4">
              <input type="hidden" name="id" value={id} />
              <SubmitButton className={btnDanger} confirm={p.confirmDelete}>{p.delete}</SubmitButton>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
