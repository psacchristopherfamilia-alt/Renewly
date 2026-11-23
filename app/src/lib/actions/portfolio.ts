"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseImport } from "@/lib/csv";
import { requireOrg } from "@/lib/session";

// Every action runs as the signed-in user: RLS decides what is allowed. These checks only give clean messages.

const ISLANDS = ["providenciales", "grand_turk", "north_caicos", "middle_caicos", "south_caicos", "salt_cay", "other"] as const;
const KINDS = ["licence", "inspection", "insurance", "signage_photo", "receipt", "form", "other"] as const;
const MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 15 * 1024 * 1024;

const propertySchema = z.object({
  name: z.string().trim().min(2).max(120),
  island: z.enum(ISLANDS),
  area: z.string().trim().max(80),
  address: z.string().trim().max(200),
  owner_name: z.string().trim().max(120),
  has_pool: z.boolean(),
  notes: z.string().trim().max(2000),
});

function readProperty(fd: FormData) {
  return propertySchema.safeParse({
    name: fd.get("name"), island: fd.get("island") ?? "providenciales", area: fd.get("area") ?? "", address: fd.get("address") ?? "",
    owner_name: fd.get("owner_name") ?? "", has_pool: fd.get("has_pool") === "on", notes: fd.get("notes") ?? "",
  });
}

// When a write affected no rows, tell apart "your role can't" from "the account is suspended".
async function deniedCode(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], tenant: string, msg?: string) {
  const c = code(msg ?? "forbidden");
  if (c !== "forbidden") return c;
  const { data } = await supabase.rpc("tenant_writable", { p_tenant: tenant });
  return data === false ? "subscription_suspended" : "forbidden";
}

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`);
}
const code = (msg?: string) =>
  msg?.includes("plan_limit") ? "plan_limit"
  : msg?.includes("subscription_suspended") ? "subscription_suspended"
  : msg?.includes("row-level security") || msg?.includes("permission denied") || msg?.includes("forbidden") ? "forbidden"
  : "generic";

export async function createProperty(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const p = readProperty(fd);
  if (!p.success) back("/properties", { error: "invalid_name" });
  const { data, error } = await supabase.from("properties").insert({ ...p.data, tenant_id: org.id }).select("id").single();
  if (error || !data) back("/properties", { error: code(error?.message) });
  revalidatePath("/dashboard");
  redirect(`/properties/${data.id}?ok=saved`);
}

export async function updateProperty(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const id = String(fd.get("id") ?? "");
  const p = readProperty(fd);
  if (!p.success) back(`/properties/${id}`, { error: "invalid_name" });
  const { error, count } = await supabase.from("properties").update(p.data, { count: "exact" }).eq("id", id);
  if (error || !count) back(`/properties/${id}`, { error: await deniedCode(supabase, org.id, error?.message) });
  revalidatePath(`/properties/${id}`);
  back(`/properties/${id}`, { ok: "saved" });
}

export async function deleteProperty(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const id = String(fd.get("id") ?? "");
  // Remove the stored files first (RLS on storage applies), then the rows (cascades licences, checklist, documents).
  const { data: docs } = await supabase.from("documents").select("storage_path").eq("property_id", id);
  const { error, count } = await supabase.from("properties").delete({ count: "exact" }).eq("id", id);
  if (error || !count) back(`/properties/${id}`, { error: await deniedCode(supabase, org.id, error?.message) });
  if (docs?.length) await supabase.storage.from("documents").remove(docs.map((d) => d.storage_path));
  revalidatePath("/dashboard");
  redirect("/dashboard?ok=saved");
}

export async function addLicence(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const property = String(fd.get("property_id") ?? "");
  const type = String(fd.get("license_type") ?? "");
  let expires = String(fd.get("expires_on") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    const { data } = await supabase.rpc("next_expiry", { p_type: type });
    expires = (data as string | null) ?? "";
  }
  const fee = String(fd.get("fee_estimate") ?? "").trim();
  const { error } = await supabase.from("licenses").insert({
    tenant_id: org.id, property_id: property, license_type: type, expires_on: expires,
    license_number: String(fd.get("license_number") ?? "").trim().slice(0, 60),
    fee_estimate: /^\d+(\.\d{1,2})?$/.test(fee) ? Number(fee) : null,
  });
  if (error) back(`/properties/${property}`, { error: error.code === "23505" ? "duplicate_licence" : code(error.message) });
  revalidatePath(`/properties/${property}`);
  back(`/properties/${property}`, { ok: "saved" });
}

export async function toggleItem(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const id = String(fd.get("id") ?? "");
  const property = String(fd.get("property_id") ?? "");
  const { error, count } = await supabase.from("checklist_items").update({ done: fd.get("done") === "true" }, { count: "exact" }).eq("id", id);
  if (error || !count) back(`/properties/${property}`, { error: await deniedCode(supabase, org.id, error?.message) });
  revalidatePath(`/properties/${property}`);
  redirect(`/properties/${property}#item-${id}`);
}

export async function saveItemNote(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const id = String(fd.get("id") ?? "");
  const property = String(fd.get("property_id") ?? "");
  const { error, count } = await supabase.from("checklist_items")
    .update({ notes: String(fd.get("notes") ?? "").trim().slice(0, 2000) }, { count: "exact" }).eq("id", id);
  if (error || !count) back(`/properties/${property}`, { error: await deniedCode(supabase, org.id, error?.message) });
  revalidatePath(`/properties/${property}`);
  redirect(`/properties/${property}#item-${id}`);
}

export async function uploadDocument(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const property = String(fd.get("property_id") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(`/properties/${property}`, { error: "file_missing" });
  if (file.size > MAX_BYTES) back(`/properties/${property}`, { error: "file_too_large" });
  if (!MIME.includes(file.type)) back(`/properties/${property}`, { error: "file_type" });
  const kind = KINDS.includes(fd.get("kind") as (typeof KINDS)[number]) ? (fd.get("kind") as string) : "other";
  const licence = String(fd.get("license_id") ?? "") || null;
  const item = String(fd.get("checklist_item_id") ?? "") || null;
  const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+/, "").slice(-120) || "file";
  const path = `${org.id}/${crypto.randomUUID()}/${safe}`;

  const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) back(`/properties/${property}`, { error: code(up.error.message) });
  const { error } = await supabase.from("documents").insert({
    tenant_id: org.id, property_id: property, license_id: licence, checklist_item_id: item, kind,
    storage_path: path, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("documents").remove([path]);
    back(`/properties/${property}`, { error: code(error.message) });
  }
  revalidatePath(`/properties/${property}`);
  back(`/properties/${property}`, { ok: "saved" });
}

export async function deleteDocument(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const id = String(fd.get("id") ?? "");
  const property = String(fd.get("property_id") ?? "");
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).single();
  const { error, count } = await supabase.from("documents").delete({ count: "exact" }).eq("id", id);
  if (error || !count || !doc) back(`/properties/${property}`, { error: await deniedCode(supabase, org.id, error?.message) });
  await supabase.storage.from("documents").remove([doc.storage_path]);
  revalidatePath(`/properties/${property}`);
  back(`/properties/${property}`, { ok: "saved" });
}

export async function importCsv(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const csv = String(fd.get("csv") ?? "");
  const { rows, errors } = parseImport(csv);
  if (errors.length || rows.length === 0) back("/import", { error: "invalid_file" });
  const { data, error } = await supabase.rpc("import_properties", { p_tenant: org.id, p_rows: rows });
  if (error) {
    const row = error.message.match(/import_row_(\d+)/)?.[1];
    const c = code(error.message);
    back("/import", { error: c === "generic" ? "import_failed" : c, ...(row ? { row: String(Number(row) + 1) } : {}) });
  }
  revalidatePath("/dashboard");
  back("/dashboard", { ok: "imported", n: String(data) });
}

export async function clearSample() {
  const { supabase, org } = await requireOrg();
  const { error } = await supabase.rpc("clear_sample_data", { p_tenant: org.id });
  if (error) back("/dashboard", { error: code(error.message) });
  revalidatePath("/dashboard");
  back("/dashboard", { ok: "sampleCleared" });
}

export async function loadSample() {
  const { supabase, org } = await requireOrg();
  const { error } = await supabase.rpc("load_sample_data", { p_tenant: org.id });
  if (error) back("/dashboard", { error: code(error.message) });
  revalidatePath("/dashboard");
  back("/dashboard", { ok: "sampleLoaded" });
}

export async function finishTour() {
  const { supabase, user } = await requireOrg();
  await supabase.from("profiles").update({ tour_done_at: new Date().toISOString() }).eq("id", user.id);
  revalidatePath("/", "layout");
}

export async function restartTour() {
  const { supabase, user } = await requireOrg();
  await supabase.from("profiles").update({ tour_done_at: null }).eq("id", user.id);
  redirect("/dashboard");
}
