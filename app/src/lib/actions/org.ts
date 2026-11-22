"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { appUrl } from "@/lib/env";
import { sendInviteEmail } from "@/lib/email";
import { isRole } from "@/lib/roles";
import { ORG_COOKIE, errorKey, requireOrg, requireUser } from "@/lib/session";
import { INVITE_FLASH, LANG_COOKIE } from "@/lib/session";

const COOKIE = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 };

function fail(path: string, message?: string): never {
  redirect(`${path}?error=${errorKey(message)}`);
}

export async function createOrganization(fd: FormData) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_organization", { p_name: String(fd.get("name") ?? "") });
  if (error || !data) fail("/onboarding", error?.message);
  (await cookies()).set(ORG_COOKIE, data as string, COOKIE);
  redirect("/dashboard");
}

export async function switchOrganization(fd: FormData) {
  const { orgs } = await requireOrg();
  const id = String(fd.get("org") ?? "");
  if (orgs.some((o) => o.id === id)) (await cookies()).set(ORG_COOKIE, id, COOKIE);
  redirect("/dashboard");
}

export async function inviteMember(fd: FormData) {
  const { supabase, org, profile, user } = await requireOrg();
  const role = fd.get("role");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!isRole(role)) fail("/team");
  const { data: token, error } = await supabase.rpc("invite_member", { p_tenant: org.id, p_email: email, p_role: role });
  if (error || !token) fail("/team", error?.message);
  const link = `${await appUrl()}/invite/${token}`;
  const locale = (await cookies()).get(LANG_COOKIE)?.value === "en" ? "en" : "es";
  const sent = await sendInviteEmail({ to: email, org: org.name, inviter: profile?.full_name || user.email || "Renewly", link, locale });
  revalidatePath("/team");
  if (sent) redirect("/team?ok=invitedEmailed");
  // Email not configured or failed: show the link once so the admin can share it by hand. It travels in a
  // short-lived httpOnly cookie, never in the URL (URLs end up in history and logs).
  (await cookies()).set(INVITE_FLASH, link, { ...COOKIE, maxAge: 120, path: "/team" });
  redirect("/team?ok=invited");
}

export async function revokeInvitation(fd: FormData) {
  const { supabase } = await requireOrg();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: String(fd.get("id") ?? "") });
  if (error) fail("/team", error.message);
  revalidatePath("/team");
  redirect("/team");
}

export async function changeRole(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const role = fd.get("role");
  if (!isRole(role)) fail("/team");
  const { error } = await supabase.rpc("change_member_role", { p_tenant: org.id, p_user: String(fd.get("user") ?? ""), p_role: role });
  if (error) fail("/team", error.message);
  revalidatePath("/team");
  redirect("/team?ok=roleChanged");
}

export async function removeMember(fd: FormData) {
  const { supabase, org, user } = await requireOrg();
  const target = String(fd.get("user") ?? "");
  const { error } = await supabase.rpc("remove_member", { p_tenant: org.id, p_user: target });
  if (error) fail("/team", error.message);
  if (target === user.id) {
    (await cookies()).delete(ORG_COOKIE);
    redirect("/dashboard");
  }
  revalidatePath("/team");
  redirect("/team");
}

export async function renameOrganization(fd: FormData) {
  const { supabase, org } = await requireOrg();
  const { error } = await supabase.rpc("rename_organization", { p_tenant: org.id, p_name: String(fd.get("name") ?? "") });
  if (error) fail("/settings", error.message);
  revalidatePath("/", "layout");
  redirect("/settings?ok=saved");
}

export async function updateProfile(fd: FormData) {
  const { supabase, user } = await requireUser();
  const locale = fd.get("locale") === "en" ? "en" : "es";
  const fullName = String(fd.get("full_name") ?? "").trim().slice(0, 120);
  const { error } = await supabase.from("profiles").update({ full_name: fullName, locale }).eq("id", user.id);
  if (error) fail("/settings", error.message);
  (await cookies()).set(LANG_COOKIE, locale, { ...COOKIE, httpOnly: false });
  revalidatePath("/", "layout");
  redirect("/settings?ok=saved");
}

export async function acceptInvitation(fd: FormData) {
  const { supabase } = await requireUser();
  const token = String(fd.get("token") ?? "");
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !data) redirect(`/invite/${encodeURIComponent(token)}?error=${errorKey(error?.message)}`);
  (await cookies()).set(ORG_COOKIE, data as string, COOKIE);
  redirect("/dashboard");
}
