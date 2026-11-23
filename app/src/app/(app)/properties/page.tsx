import Link from "next/link";
import { PropertyFields } from "@/components/PropertyFields";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice, btn, card } from "@/components/ui";
import { createProperty } from "@/lib/actions/portfolio";
import { atLeast } from "@/lib/roles";
import { getT, requireOrg } from "@/lib/session";

type Prop = { id: string; name: string; island: string; area: string; owner_name: string; is_sample: boolean; licenses: { id: string }[] };

export default async function Properties({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireOrg();
  const t = await getT();
  const p = t.portfolio;
  const { data } = await supabase.from("properties").select("id, name, island, area, owner_name, is_sample, licenses(id)")
    .eq("tenant_id", org.id).is("archived_at", null).order("name");
  const props = (data ?? []) as Prop[];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">{p.navProperties}</h1>
      {sp.error && <Notice kind="error">{(t.errors as Record<string, string>)[sp.error] ?? t.errors.generic}</Notice>}
      <section className={`${card} p-0`}>
        {props.length === 0 ? (
          <p className="p-5 text-sm text-muted">{p.empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {props.map((x) => (
              <li key={x.id}>
                <Link href={`/properties/${x.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-brand-soft/50">
                  <span>
                    <b className="font-semibold">{x.name}</b>
                    {x.is_sample && <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-[10px] uppercase text-muted">{p.sample}</span>}
                    <span className="block text-xs text-muted">{[p.islands[x.island], x.area, x.owner_name].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-xs text-muted">{x.licenses.length} {p.licences.toLowerCase()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {atLeast(org.role, "admin") && (
        <section id="new" className={card}>
          <h2 className="mb-4 text-lg font-semibold">{p.addProperty}</h2>
          <form action={createProperty} className="space-y-4">
            <PropertyFields p={p} />
            <SubmitButton className={btn}>{p.create}</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
