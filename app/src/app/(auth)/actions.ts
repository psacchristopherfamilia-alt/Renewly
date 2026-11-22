"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import { safeNext } from "@/lib/paths";
import { getLocale } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8).max(200);

function back(path: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params);
  return redirect(`${path}?${qs}`);
}

export async function signIn(fd: FormData) {
  const next = safeNext(String(fd.get("next") ?? ""));
  const e = email.safeParse(fd.get("email"));
  if (!e.success) back("/login", { error: "invalidEmail", next });
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: e.data, password: String(fd.get("password") ?? "") });
  if (error) {
    const key = error.status === 429 ? "rateLimited" : error.message === "Email not confirmed" ? "notConfirmed" : "wrongLogin";
    back("/login", { error: key, next });
  }
  redirect(next);
}

export async function sendMagicLink(fd: FormData) {
  const next = safeNext(String(fd.get("next") ?? ""));
  const e = email.safeParse(fd.get("email"));
  if (!e.success) back("/login", { error: "invalidEmail", next });
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: e.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${await appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error?.status === 429) back("/login", { error: "rateLimited", next });
  // Same answer whether or not the account exists.
  back("/login", { ok: "magicSent", next });
}

export async function signUp(fd: FormData) {
  const next = safeNext(String(fd.get("next") ?? ""), "/onboarding");
  const e = email.safeParse(fd.get("email"));
  const p = password.safeParse(fd.get("password"));
  if (!e.success) back("/signup", { error: "invalidEmail", next });
  if (!p.success) back("/signup", { error: "weakPassword", next });
  if (fd.get("terms") !== "on") back("/signup", { error: "mustAcceptTerms", next });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: e.data,
    password: p.data,
    options: {
      emailRedirectTo: `${await appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      data: {
        full_name: String(fd.get("full_name") ?? "").trim().slice(0, 120),
        locale: await getLocale(),
        terms_accepted_at: new Date().toISOString(),
      },
    },
  });
  if (error) back("/signup", { error: error.status === 429 ? "rateLimited" : "generic", next });
  if (!data.session) back("/login", { ok: "confirmEmail", next });
  redirect(next);
}

export async function sendReset(fd: FormData) {
  const e = email.safeParse(fd.get("email"));
  if (e.success) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(e.data, { redirectTo: `${await appUrl()}/auth/callback?next=/reset` });
    if (error && error.status !== 429) console.error("[reset]", error.message);
  }
  back("/forgot", { ok: "resetSent" });
}

export async function updatePassword(fd: FormData) {
  const p = password.safeParse(fd.get("password"));
  if (!p.success) back("/reset", { error: "weakPassword" });
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: p.data });
  if (error) back("/reset", { error: "generic" });
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
