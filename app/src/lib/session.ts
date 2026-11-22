import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import en from "@/i18n/en";
import es, { type Dictionary } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

export type Locale = "es" | "en";
export const ORG_COOKIE = "renewly_org";
export const LANG_COOKIE = "renewly_lang";
export const INVITE_FLASH = "renewly_invite_link";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === "en" ? "en" : "es";
}

export async function getT(): Promise<Dictionary> {
  return (await getLocale()) === "en" ? en : es;
}

/** Fills {placeholders} in a translated string. */
export function tpl(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export type Org = { id: string; name: string; role: Role };

/** Signed-in user, or redirect to login. Cached per request. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name, email, locale").eq("id", user.id).single();
  return { supabase, user, profile };
});

/**
 * Current organisation: the one in the cookie if the user still belongs to it, else the first one.
 * Users without any organisation go to onboarding.
 */
export const requireOrg = cache(async () => {
  const { supabase, user, profile } = await requireUser();
  const { data } = await supabase.rpc("my_organizations");
  const orgs = (data ?? []) as Org[];
  if (orgs.length === 0) redirect("/onboarding");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const org = orgs.find((o) => o.id === wanted) ?? orgs[0];
  return { supabase, user, profile, orgs, org };
});

/** Maps a database error to a translation key (the functions raise short codes like 'forbidden'). */
export function errorKey(message: string | undefined): keyof Dictionary["errors"] {
  const codes = [
    "invalid_name", "invalid_email", "already_member", "forbidden", "last_owner", "invalid_invitation",
    "invitation_email_mismatch", "too_many_invitations", "too_many_organizations",
  ] as const;
  return codes.find((c) => message?.includes(c)) ?? "generic";
}
