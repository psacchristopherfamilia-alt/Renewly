import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui";
import { switchOrganization } from "@/lib/actions/org";
import { getT, requireOrg } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org, orgs } = await requireOrg();
  const t = await getT();
  const other = t.common.lang === "English" ? "en" : "es";
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Logo href="/dashboard" />
            {orgs.length > 1 ? (
              <form action={switchOrganization} className="flex items-center gap-2">
                <select name="org" defaultValue={org.id} aria-label={t.nav.switchOrg} className="max-w-48 rounded-md border border-line bg-surface px-2 py-1 text-sm">
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button className="text-xs text-brand underline">{t.nav.switchOrg}</button>
              </form>
            ) : (
              <span className="text-sm font-medium text-muted">{org.name}</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href={`/lang?to=${other}&next=/dashboard`} className="text-muted hover:text-fg">{t.common.lang}</a>
            <form action={signOut}><button className="text-muted hover:text-fg">{t.common.signOut}</button></form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 text-sm">
          {[["/dashboard", t.nav.dashboard], ["/team", t.nav.team], ["/settings", t.nav.settings]].map(([href, text]) => (
            <Link key={href} href={href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-muted hover:border-brand hover:text-fg">{text}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
