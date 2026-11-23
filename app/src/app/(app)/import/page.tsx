import { redirect } from "next/navigation";
import { ImportForm } from "@/components/ImportForm";
import { Notice, card } from "@/components/ui";
import { importCsv } from "@/lib/actions/portfolio";
import { atLeast } from "@/lib/roles";
import { getT, requireOrg } from "@/lib/session";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string; row?: string }> }) {
  const sp = await searchParams;
  const { org } = await requireOrg();
  if (!atLeast(org.role, "admin")) redirect("/dashboard?error=forbidden");
  const t = await getT();
  const err = sp.error ? (t.errors as Record<string, string>)[sp.error] ?? t.errors.generic : "";
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">{t.importPage.title}</h1>
      {err && <Notice kind="error">{err}{sp.row ? ` (${t.importPage.line.replace("{n}", sp.row)})` : ""}</Notice>}
      <section className={card}>
        <p className="text-sm">{t.importPage.intro}</p>
        <p className="mt-2 text-xs text-muted">{t.importPage.columns}</p>
        <div className="mt-5"><ImportForm t={t.importPage} p={t.portfolio} action={importCsv} /></div>
      </section>
    </div>
  );
}
