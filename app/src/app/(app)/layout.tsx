import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui";
import { switchOrganization } from "@/lib/actions/org";
import { finishTour } from "@/lib/actions/portfolio";
import { Tour } from "@/components/Tour";
import { fmtDate } from "@/components/portfolio";
import { getLocale, getT, requireOrg } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const { org, orgs, profile, supabase } = await requireOrg();
  const [{ data: sub }, { data: platformAdmin }] = await Promise.all([
    supabase.from("subscriptions").select("status, trial_ends_at").eq("tenant_id", org.id).maybeSingle(),
    supabase.rpc("is_platform_admin"),
  ]);
  const lang = await getLocale();
  const daysToTrialEnd = sub?.trial_ends_at ? Math.round((Date.parse(sub.trial_ends_at) - Date.now()) / 86_400_000) : 99;
  const banner =
    sub?.status === "suspended" ? t.billing.banner.suspended
    : sub?.status === "canceled" ? t.billing.banner.canceled
    : sub?.status === "past_due" ? t.billing.banner.past_due
    : sub?.status === "pending_payment" ? t.billing.banner.pending
    : sub?.status === "trialing" && daysToTrialEnd <= 5 ? t.billing.banner.trial.replace("{date}", fmtDate(sub.trial_ends_at!, lang))
    : "";
  const isAdmin = org.role === "owner" || org.role === "admin";
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
          {[["/dashboard", t.nav.dashboard], ["/properties", t.portfolio.navProperties], ["/renewals", t.renewals.nav], ...(isAdmin ? [["/import", t.portfolio.navImport]] : []), ["/team", t.nav.team], ...(isAdmin ? [["/billing", t.billing.nav]] : []), ["/settings", t.nav.settings], ["/help", t.portfolio.navHelp], ...(platformAdmin ? [["/platform", t.billing.navPlatform]] : [])].map(([href, text]) => (
            <Link key={href} href={href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-muted hover:border-brand hover:text-fg">{text}</Link>
          ))}
        </nav>
      </header>
      {banner && (
        <div role="status" data-testid="billing-banner" className={`border-b border-line ${sub?.status === "suspended" || sub?.status === "past_due" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span>{banner}</span>
            {isAdmin && <Link href="/billing" className="font-semibold underline">{t.billing.banner.cta}</Link>}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      {!profile?.tour_done_at && <Tour steps={t.tour.steps} labels={t.tour} onFinish={finishTour} />}
    </div>
  );
}
