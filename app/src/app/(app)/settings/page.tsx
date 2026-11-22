import { SubmitButton } from "@/components/SubmitButton";
import { Notice, btn, card, input, label } from "@/components/ui";
import { renameOrganization, updateProfile } from "@/lib/actions/org";
import { atLeast } from "@/lib/roles";
import { getLocale, getT, requireOrg } from "@/lib/session";

type Entry = { id: number; action: string; entity_id: string | null; created_at: string; actor_id: string | null };

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, profile } = await requireOrg();
  const t = await getT();
  const locale = await getLocale();
  const isAdmin = atLeast(org.role, "admin");
  const { data: logRaw } = isAdmin
    ? await supabase.from("audit_log").select("id, action, entity_id, created_at, actor_id").eq("tenant_id", org.id).order("created_at", { ascending: false }).limit(20)
    : { data: [] };
  const log = (logRaw ?? []) as Entry[];
  const { data: people } = await supabase.from("profiles").select("id, full_name, email");
  const who = (id: string | null) => people?.find((p) => p.id === id)?.full_name || people?.find((p) => p.id === id)?.email || "—";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">{t.settings.title}</h1>
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      {sp.ok && <Notice kind="ok">{t.settings.saved}</Notice>}

      {isAdmin && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold">{t.settings.org}</h2>
          <form action={renameOrganization} className="flex flex-wrap items-end gap-3">
            <label className={`${label} flex-1`}>{t.settings.orgName}<input name="name" defaultValue={org.name} required minLength={2} maxLength={120} className={input} /></label>
            <SubmitButton className={btn}>{t.common.save}</SubmitButton>
          </form>
        </section>
      )}

      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">{t.settings.profile}</h2>
        <form action={updateProfile} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className={label}>{t.auth.fullName}<input name="full_name" defaultValue={profile?.full_name ?? ""} maxLength={120} className={input} /></label>
          <label className={label}>
            {t.settings.language}
            <select name="locale" defaultValue={locale} className={input}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <SubmitButton className={btn}>{t.common.save}</SubmitButton>
        </form>
      </section>

      {isAdmin && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold">{t.settings.activity}</h2>
          {log.length === 0 ? (
            <p className="text-sm text-muted">{t.settings.noActivity}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {log.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span><b>{who(e.actor_id)}</b> {t.audit[e.action] ?? e.action}{e.action.startsWith("member.invit") && e.entity_id ? ` ${e.entity_id}` : ""}</span>
                  <time className="text-xs text-muted">{new Date(e.created_at).toLocaleString(locale === "en" ? "en-GB" : "es", { dateStyle: "short", timeStyle: "short", timeZone: "America/Grand_Turk" })}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
