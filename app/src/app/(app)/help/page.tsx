import { SubmitButton } from "@/components/SubmitButton";
import { card } from "@/components/ui";
import { restartTour } from "@/lib/actions/portfolio";
import { getT, requireOrg } from "@/lib/session";

export default async function Help() {
  await requireOrg();
  const t = await getT();
  const h = t.help;
  const contact = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">{h.title}</h1>
      <p className="max-w-2xl text-muted">{h.intro}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 font-semibold">{h.stepsTitle}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
        <section className={card}>
          <h2 className="mb-2 font-semibold">{h.rolesTitle}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{h.roles.map((s) => <li key={s}>{s}</li>)}</ul>
        </section>
      </div>
      <section className={`${card} p-0`}>
        <h2 className="p-5 pb-2 font-semibold">{h.faqTitle}</h2>
        <div className="divide-y divide-line">
          {h.faq.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none justify-between gap-4 text-sm font-medium">{f.q}<span aria-hidden className="text-brand group-open:rotate-45">+</span></summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <form action={restartTour}><SubmitButton className="text-brand underline">{h.tour}</SubmitButton></form>
        <span className="text-muted">{h.contact}{contact && <> <a href={`mailto:${contact}`} className="text-brand underline">{contact}</a></>}</span>
      </div>
    </div>
  );
}
