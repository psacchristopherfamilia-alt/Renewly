import "server-only";
import en from "@/i18n/en";
import es from "@/i18n/es";
import type { createClient } from "@/lib/supabase/server";
import type { PackageData } from "./package";

type Client = Awaited<ReturnType<typeof createClient>>;

const FIELDS = ["property_name", "island", "area", "address", "owner_name", "operator_name", "license_number", "current_expiry",
  "contact_name", "contact_email", "contact_phone", "rooms", "authority"];

/** Builds the package data of one renewal as the signed-in user (RLS applies to every read and download). */
export async function loadPackage(supabase: Client, renewalId: string, locale: "es" | "en"): Promise<PackageData | null> {
  const { data: r } = await supabase.from("renewals")
    .select("id, form_data, cycle_expires_on, licenses(license_type, license_types(name_es, name_en, portal_name, portal_url, filing_month, filing_day, templates_confirmed))")
    .eq("id", renewalId).maybeSingle();
  if (!r) return null;
  const lt = (r as unknown as { licenses: { license_types: { name_es: string; name_en: string; portal_name: string; portal_url: string | null; filing_month: number | null; filing_day: number | null; templates_confirmed: boolean } } }).licenses.license_types;
  const { data: reqs } = await supabase.from("renewal_requirement_status")
    .select("label, required, status, file_name, source, document_id, sort").eq("renewal_id", renewalId).order("sort");
  const t = locale === "en" ? en : es;
  const rows = (reqs ?? []) as { label: string; required: boolean; status: "uploaded" | "missing" | "expired"; file_name: string | null; source: string; document_id: string | null }[];

  const documents: PackageData["documents"] = [];
  for (const q of rows) {
    if (!q.document_id) continue;
    const { data: d } = await supabase.from("documents").select("storage_path, file_name, mime_type").eq("id", q.document_id).maybeSingle();
    if (!d) continue;
    const { data: blob } = await supabase.storage.from("documents").download(d.storage_path);
    documents.push({ label: q.label, file_name: d.file_name, mime: d.mime_type, bytes: blob ? new Uint8Array(await blob.arrayBuffer()) : null });
  }
  const year = String(r.cycle_expires_on).slice(0, 4);
  const deadline = lt.filing_month ? `${year}-${String(lt.filing_month).padStart(2, "0")}-${String(lt.filing_day).padStart(2, "0")}` : String(r.cycle_expires_on);
  return {
    locale,
    licence_name: locale === "en" ? lt.name_en : lt.name_es,
    authority: lt.portal_name,
    portal_url: lt.portal_url,
    deadline,
    provisional: !lt.templates_confirmed,
    form: Object.fromEntries(FIELDS.map((k) => [k, String((r.form_data as Record<string, unknown>)?.[k] ?? "")])),
    field_labels: Object.fromEntries(FIELDS.map((k) => [k, t.renewals.fields[k] ?? k])),
    requirements: rows.map(({ label, required, status, file_name, source }) => ({ label, required, status, file_name, source })),
    documents,
  };
}
