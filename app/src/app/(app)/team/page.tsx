import { cookies } from "next/headers";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice, btn, btnDanger, card, input, label } from "@/components/ui";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "@/lib/actions/org";
import { assignableRoles, atLeast, canManage, type Role } from "@/lib/roles";
import { INVITE_FLASH, getT, requireOrg } from "@/lib/session";

type Member = { user_id: string; role: Role; created_at: string; profiles: { full_name: string; email: string } | null };
type Invitation = { id: string; email: string; role: Role; expires_at: string };

export default async function Team({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, user } = await requireOrg();
  const t = await getT();
  const isAdmin = atLeast(org.role, "admin");
  const roles = assignableRoles(org.role);

  const { data: membersRaw } = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profiles!memberships_user_id_profiles_fkey(full_name, email)")
    .eq("tenant_id", org.id)
    .order("created_at");
  const members = (membersRaw ?? []) as unknown as Member[];
  const soleOwner = members.filter((m) => m.role === "owner").length <= 1;
  const { data: invRaw } = isAdmin
    ? await supabase.from("invitations").select("id, email, role, expires_at").eq("tenant_id", org.id)
        .is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at")
    : { data: [] };
  const invitations = (invRaw ?? []) as Invitation[];
  const flashLink = sp.ok === "invited" ? (await cookies()).get(INVITE_FLASH)?.value : undefined;
  const okText = sp.ok === "invitedEmailed" ? t.team.invitedEmailed : sp.ok === "roleChanged" ? t.team.roleChanged : "";
  const date = (s: string) => new Date(s).toLocaleDateString(t.common.lang === "English" ? "es" : "en", { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">{t.team.title}</h1>
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {okText && <Notice kind="ok">{okText}</Notice>}
      {flashLink && (
        <div className="rounded-lg bg-ok-soft p-3 text-sm text-ok">
          <p>{t.team.invited}</p>
          <input readOnly value={flashLink} className={`${input} mt-2 font-mono text-xs`} aria-label="link" />
        </div>
      )}

      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">{t.team.members}</h2>
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const self = m.user_id === user.id;
            const manage = !self && canManage(org.role, m.role);
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{m.profiles?.full_name || m.profiles?.email} {self && <span className="text-xs text-muted">({t.team.you})</span>}</p>
                  <p className="truncate text-xs text-muted">{m.profiles?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {manage ? (
                    <form action={changeRole} className="flex items-center gap-2">
                      <input type="hidden" name="user" value={m.user_id} />
                      <select name="role" defaultValue={m.role} aria-label={t.team.role} className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
                        {roles.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                      </select>
                      <SubmitButton className="text-xs text-brand underline">{t.common.save}</SubmitButton>
                    </form>
                  ) : (
                    <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">{t.roles[m.role]}</span>
                  )}
                  {(manage || (self && !(m.role === "owner" && soleOwner))) && (
                    <form action={removeMember}>
                      <input type="hidden" name="user" value={m.user_id} />
                      <SubmitButton className={btnDanger} confirm={t.team.confirmRemove}>{self ? t.team.leave : t.team.remove}</SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isAdmin && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold">{t.team.inviteTitle}</h2>
          <form action={inviteMember} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className={label}>{t.auth.email}<input name="email" type="email" required maxLength={200} className={input} /></label>
            <label className={label}>
              {t.team.role}
              <select name="role" defaultValue="operator" className={input}>
                {roles.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
              </select>
            </label>
            <SubmitButton className={btn}>{t.team.invite}</SubmitButton>
          </form>
          <ul className="mt-4 grid gap-1 text-xs text-muted sm:grid-cols-2">
            {roles.map((r) => <li key={r}><b className="text-fg">{t.roles[r]}:</b> {t.roleHelp[r]}</li>)}
          </ul>

          <h3 className="mb-2 mt-6 font-semibold">{t.team.pending}</h3>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted">{t.team.none}</p>
          ) : (
            <ul className="divide-y divide-line">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span>{i.email} · {t.roles[i.role]} · <span className="text-muted">{t.team.expires} {date(i.expires_at)}</span></span>
                  <form action={revokeInvitation}>
                    <input type="hidden" name="id" value={i.id} />
                    <SubmitButton className={btnDanger}>{t.team.revoke}</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
