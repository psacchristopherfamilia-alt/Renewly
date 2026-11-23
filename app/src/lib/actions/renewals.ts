"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey, requireOrg } from "@/lib/session";

// Renewal actions run as the signed-in user; the database functions check roles, the submit gate and states.

const MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX = 15 * 1024 * 1024;
const KINDS = ["licence", "inspection", "insurance", "signage_photo", "receipt", "form", "other"];

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params)}`);
}

type Ctx = Awaited<ReturnType<typeof requireOrg>>;

/** Uploads a file into the documents bucket and creates its documents row. Returns the document id or an error code. */
async function storeDocument(ctx: Ctx, propertyId: string, licenseId: string | null, file: FormDataEntryValue | null, kind: string, expiresOn?: string) {
  if (!(file instanceof File) || file.size === 0) return { error: "file_missing" };
  if (file.size > MAX) return { error: "file_too_large" };
  if (!MIME.includes(file.type)) return { error: "file_type" };
  const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+/, "").slice(-120) || "file";
  const path = `${ctx.org.id}/${crypto.randomUUID()}/${safe}`;
  const up = await ctx.supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: "forbidden" };
  const { data, error } = await ctx.supabase.from("documents").insert({
    tenant_id: ctx.org.id, property_id: propertyId, license_id: licenseId, kind: KINDS.includes(kind) ? kind : "other",
    storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size,
    expires_on: /^\d{4}-\d{2}-\d{2}$/.test(expiresOn ?? "") ? expiresOn : null,
  }).select("id").single();
  if (error || !data) {
    await ctx.supabase.storage.from("documents").remove([path]);
    return { error: errorKey(error?.message) === "generic" && error?.message?.includes("row-level") ? "forbidden" : errorKey(error?.message) };
  }
  return { id: data.id as string };
}

async function renewalTarget(ctx: Ctx, renewalId: string) {
  const { data } = await ctx.supabase.from("renewals").select("id, license_id, licenses(property_id)").eq("id", renewalId).maybeSingle();
  return data as unknown as { id: string; license_id: string; licenses: { property_id: string } } | null;
}

export async function startRenewals(fd: FormData) {
  const { supabase } = await requireOrg();
  const ids = fd.getAll("license_id").map(String).filter(Boolean).slice(0, 200);
  if (ids.length === 0) back("/renewals", { error: "generic" });
  const { data, error } = await supabase.rpc("start_renewals", { p_licenses: ids });
  if (error) back("/renewals", { error: errorKey(error.message) });
  revalidatePath("/renewals");
  if (ids.length === 1) {
    const { data: r } = await supabase.from("renewals").select("id").eq("license_id", ids[0]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (r) redirect(`/renewals/${r.id}`);
  }
  back("/renewals", { ok: "started", n: String(data ?? ids.length) });
}

export async function saveAnswers(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("renewal_id") ?? "");
  const answers: Record<string, boolean> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("q_")) answers[k.slice(2)] = v === "yes";
  const { error } = await supabase.rpc("save_renewal_answers", { p_renewal: id, p_answers: answers });
  if (error) back(`/renewals/${id}`, { error: errorKey(error.message) });
  revalidatePath(`/renewals/${id}`);
  back(`/renewals/${id}`, { ok: "saved" });
}

export async function saveForm(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("renewal_id") ?? "");
  const form: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("f_")) form[k.slice(2)] = String(v).slice(0, 300);
  const { error } = await supabase.rpc("save_renewal_form", { p_renewal: id, p_form: form });
  if (error) back(`/renewals/${id}`, { error: errorKey(error.message) });
  revalidatePath(`/renewals/${id}`);
  back(`/renewals/${id}`, { ok: "saved" });
}

export async function attachDocument(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("renewal_id") ?? "");
  const doc = String(fd.get("document_id") ?? "") || null;
  const { error } = await supabase.rpc("attach_requirement_document", { p_requirement: String(fd.get("requirement_id") ?? ""), p_document: doc });
  if (error) back(`/renewals/${id}`, { error: errorKey(error.message) });
  revalidatePath(`/renewals/${id}`);
  redirect(`/renewals/${id}#documents`);
}

export async function uploadAndAttach(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get("renewal_id") ?? "");
  const r = await renewalTarget(ctx, id);
  if (!r) back("/renewals", { error: "forbidden" });
  const stored = await storeDocument(ctx, r.licenses.property_id, r.license_id, fd.get("file"), String(fd.get("doc_kind") ?? "other"), String(fd.get("expires_on") ?? ""));
  if ("error" in stored) back(`/renewals/${id}`, { error: stored.error! });
  const { error } = await ctx.supabase.rpc("attach_requirement_document", { p_requirement: String(fd.get("requirement_id") ?? ""), p_document: stored.id });
  if (error) back(`/renewals/${id}`, { error: errorKey(error.message) });
  revalidatePath(`/renewals/${id}`);
  redirect(`/renewals/${id}#documents`);
}

export async function markSubmitted(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get("renewal_id") ?? "");
  const reference = String(fd.get("portal_reference") ?? "").trim();
  // Check the gate before storing the receipt, so a blocked renewal does not leave stray files.
  const { data: blockers } = await ctx.supabase.rpc("renewal_blockers", { p_renewal: id });
  if ((blockers ?? []).length > 0) back(`/renewals/${id}`, { error: "requirements_missing" });
  if (reference.length < 3) back(`/renewals/${id}`, { error: "reference_required" });
  const r = await renewalTarget(ctx, id);
  if (!r) back("/renewals", { error: "forbidden" });
  const stored = await storeDocument(ctx, r.licenses.property_id, r.license_id, fd.get("receipt"), "receipt");
  if ("error" in stored) back(`/renewals/${id}`, { error: stored.error === "file_missing" ? "receipt_required" : stored.error! });
  const { error } = await ctx.supabase.rpc("mark_renewal_submitted", { p_renewal: id, p_portal_reference: reference, p_receipt_document: stored.id });
  if (error) back(`/renewals/${id}`, { error: errorKey(error.message) });
  revalidatePath(`/renewals/${id}`);
  back(`/renewals/${id}`, { ok: "saved" });
}

export async function recordResponse(fd: FormData) {
  const ctx = await requireOrg();
  const id = String(fd.get("renewal_id") ?? "");
  const kind = String(fd.get("kind") ?? "");
  const note = String(fd.get("note") ?? "").slice(0, 1000);
  let evidence: string | null = null;
  if (kind === "approved") {
    const r = await renewalTarget(ctx, id);
    if (!r) back("/renewals", { error: "forbidden" });
    const stored = await storeDocument(ctx, r.licenses.property_id, r.license_id, fd.get("new_licence"), "licence");
    if ("error" in stored) back(`/renewals/${id}`, { error: stored.error === "file_missing" ? "evidence_required" : stored.error! });
    evidence = stored.id!;
  }
  const extra = String(fd.get("extra") ?? "").split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 20);
  const expiry = String(fd.get("new_expiry") ?? "");
  const { error } = await ctx.supabase.rpc("record_office_response", {
    p_renewal: id, p_kind: kind, p_note: note,
    p_new_expiry: /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
    p_new_licence_document: evidence, p_new_licence_number: String(fd.get("new_number") ?? "").slice(0, 60) || null,
    p_extra_requirements: extra,
  });
  if (error) back(`/renewals/${id}`, { error: errorKey(error.message) });
  revalidatePath(`/renewals/${id}`);
  revalidatePath("/dashboard");
  back(`/renewals/${id}`, { ok: "saved" });
}

export async function withdraw(fd: FormData) {
  const { supabase } = await requireOrg();
  const id = String(fd.get("renewal_id") ?? "");
  const { error } = await supabase.rpc("withdraw_renewal", { p_renewal: id, p_note: "" });
  if (error) back(`/renewals/${id}`, { error: errorKey(error.message) });
  revalidatePath(`/renewals/${id}`);
  back(`/renewals/${id}`, { ok: "saved" });
}
