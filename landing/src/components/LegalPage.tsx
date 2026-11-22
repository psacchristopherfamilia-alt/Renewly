import { getDictionary } from "@/i18n";
import type { LegalDoc } from "@/i18n/legal";
import type { Locale } from "@/lib/site";
import { SiteFooter, SiteHeader } from "./Chrome";

export function LegalPage({ lang, doc }: { lang: Locale; doc: LegalDoc }) {
  const t = getDictionary(lang);
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="font-display text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted">{doc.updated}</p>
        {doc.sections.map((s) => (
          <section key={s.h} className="mt-8">
            <h2 className="text-lg font-semibold">{s.h}</h2>
            {s.p.map((p) => <p key={p} className="mt-2 text-muted">{p}</p>)}
          </section>
        ))}
      </main>
      <SiteFooter lang={lang} t={t} />
    </>
  );
}
