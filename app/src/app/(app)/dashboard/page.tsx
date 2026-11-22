import Link from "next/link";
import { btn, card } from "@/components/ui";
import { atLeast } from "@/lib/roles";
import { getT, requireOrg, tpl } from "@/lib/session";

export default async function Dashboard() {
  const { org, profile, user } = await requireOrg();
  const t = await getT();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">{tpl(t.dashboard.welcome, { name: profile?.full_name || user.email || "" })}</h1>
        <p className="mt-1 text-sm text-muted">{org.name} · {t.dashboard.yourRole}: {t.roles[org.role]}</p>
      </div>
      <div className={`${card} text-center`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/renewly-mark.svg" alt="" width={48} height={48} className="mx-auto" />
        <h2 className="mt-4 text-lg font-semibold">{t.dashboard.emptyTitle}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t.dashboard.emptyText}</p>
        {atLeast(org.role, "admin") && <Link href="/team" className={`${btn} mt-5`}>{t.dashboard.inviteCta}</Link>}
      </div>
    </div>
  );
}
