"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey, requireOrg, requireUser } from "@/lib/session";

// Billing actions run as the signed-in user; the database functions check roles (owner chooses the plan,
// owner/admin upload proofs, platform admins approve) and enforce every rule.

const PROOF_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const PROOF_MAX = 10 * 1024 * 1024;

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params)}`);
}

export async function choosePlan(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const plan = String(fd.get("plan") ?? "");
  const qty = Math.max(1, Math.min(5000, Number.parseInt(String(fd.get("quantity") ?? "1"), 10) || 1));
  const { error } = await supabase.rpc("choose_plan", { p_tenant: org.id, p_plan: plan, p_quantity: qty });
  if (error) back("/billing", { error: errorKey(error.message) });
  revalidatePath("/", "layout");
  back("/billing", { ok: "saved" });
}

export async function uploadProof(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const invoice = String(fd.get("invoice_id") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/billing", { error: "file_missing" });
  if (file.size > PROOF_MAX) back("/billing", { error: "file_too_large" });
  if (!PROOF_MIME.includes(file.type)) back("/billing", { error: "file_type" });
  const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+/, "").slice(-120) || "proof";
  const path = `${org.id}/${crypto.randomUUID()}/${safe}`;
  const up = await supabase.storage.from("billing").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) back("/billing", { error: "forbidden" });
  const { error } = await supabase.rpc("submit_payment_proof", {
    p_invoice: invoice, p_path: path, p_file_name: file.name.slice(0, 200), p_mime: file.type, p_size: file.size,
    p_note: String(fd.get("note") ?? "").slice(0, 500),
  });
  // The proof file stays even if the call fails: proofs are never deleted through the API (payment record).
  if (error) back("/billing", { error: errorKey(error.message) });
  revalidatePath("/", "layout");
  back("/billing", { ok: "proofSent" });
}

export async function setCancel(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const { error } = await supabase.rpc("cancel_subscription", { p_tenant: org.id, p_cancel: fd.get("cancel") === "true" });
  if (error) back("/billing", { error: errorKey(error.message) });
  revalidatePath("/", "layout");
  back("/billing", { ok: "saved" });
}

// ---- Platform (Renewly operator) ----

export async function approvePayment(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("platform_approve_payment", {
    p_invoice: String(fd.get("invoice_id") ?? ""), p_method: String(fd.get("method") ?? ""), p_reference: String(fd.get("reference") ?? "").slice(0, 120),
  });
  if (error) back("/platform", { error: errorKey(error.message) });
  revalidatePath("/platform");
  back("/platform", { ok: "saved" });
}

export async function rejectProof(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("platform_reject_proof", {
    p_invoice: String(fd.get("invoice_id") ?? ""), p_reason: String(fd.get("reason") ?? "").slice(0, 500),
  });
  if (error) back("/platform", { error: errorKey(error.message) });
  revalidatePath("/platform");
  back("/platform", { ok: "saved" });
}

export async function setSuspended(fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("platform_set_suspended", { p_tenant: String(fd.get("tenant_id") ?? ""), p_suspended: fd.get("suspend") === "true" });
  if (error) back("/platform", { error: errorKey(error.message) });
  revalidatePath("/platform");
  back("/platform", { ok: "saved" });
}

const NUMERIC = ["trial_days", "grace_days", "invoice_due_days", "renewal_notice_days", "volume_discount_from", "volume_discount_pct", "tax_pct"];
const TEXT = ["tax_label", "payee_name", "payee_address", "bank_details", "payment_note", "support_email"];

export async function updateSettings(fd: FormData) {
  const { supabase } = await requireUser();
  const p: Record<string, string> = {};
  for (const k of NUMERIC) {
    const v = String(fd.get(k) ?? "").trim();
    if (/^\d+(\.\d{1,2})?$/.test(v)) p[k] = v;
  }
  for (const k of TEXT) if (fd.has(k)) p[k] = String(fd.get(k) ?? "").trim();
  const { error } = await supabase.rpc("platform_update_settings", { p });
  if (error) back("/platform", { error: error.message.includes("check constraint") ? "generic" : errorKey(error.message) });
  revalidatePath("/platform");
  back("/platform", { ok: "saved" });
}

export async function updatePlan(fd: FormData) {
  const { supabase } = await requireUser();
  const price = Number(String(fd.get("unit_price") ?? ""));
  const max = String(fd.get("max_properties") ?? "").trim();
  const { error } = await supabase.rpc("platform_update_plan", {
    p_code: String(fd.get("code") ?? ""), p_unit_price: Number.isFinite(price) && price >= 0 ? price : -1,
    p_max_properties: max ? Number.parseInt(max, 10) : null, p_active: fd.get("active") === "on",
  });
  if (error) back("/platform", { error: errorKey(error.message) });
  revalidatePath("/platform");
  back("/platform", { ok: "saved" });
}
