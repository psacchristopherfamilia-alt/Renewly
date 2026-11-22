import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { fmt } from "@/i18n/fmt";
import { ContactForm } from "@/components/ContactForm";
import { Demo } from "@/components/Demo";
import { PlanButton } from "@/components/PlanButton";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { TrackLink } from "@/components/TrackLink";
import { Section, btnPrimary, btnSecondary } from "@/components/ui";
import { PLANS, SITE_URL, SOURCES, TRIAL_DAYS, WHATSAPP_NUMBER, isLocale } from "@/lib/site";

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  const wa = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.contact.whatsappText)}` : "";

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Renewly",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: t.meta.description,
      url: `${SITE_URL}/${lang}`,
      inLanguage: lang,
      areaServed: "Turks and Caicos Islands",
      offers: [
        { "@type": "Offer", name: t.pricing.plans.per_property.name, price: PLANS.per_property.price, priceCurrency: "USD" },
        { "@type": "Offer", name: t.pricing.plans.manager.name, price: PLANS.manager.price, priceCurrency: "USD" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: t.faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SiteHeader lang={lang} t={t} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand">{t.hero.eyebrow}</p>
              <h1 className="mt-3 font-display text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">{t.hero.title}</h1>
              <p className="mt-2 font-display text-xl text-muted">{t.hero.tagline}</p>
              <p className="mt-5 max-w-xl text-lg text-muted">{t.hero.subtitle}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <TrackLink event="hero_cta" href="#contact" className={btnPrimary}>{t.hero.primary}</TrackLink>
                <TrackLink event="hero_demo" href="#demo" className={btnSecondary}>{t.hero.secondary}</TrackLink>
              </div>
              <p className="mt-4 text-sm text-muted">{t.hero.note}</p>
            </div>
            <div aria-hidden="true" className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-soft via-transparent to-transparent" />
              <HeroCard t={t} />
            </div>
          </div>
        </section>

        {/* Problem + evidence */}
        <div className="border-y border-line bg-surface">
          <Section title={t.problem.title} subtitle={t.problem.lead}>
            <div className="grid gap-4 md:grid-cols-3">
              {t.problem.facts.map((f) => (
                <figure key={f.stat} className="flex flex-col rounded-xl border border-line bg-bg p-5">
                  <b className="font-display text-3xl text-brand">{f.stat}</b>
                  <p className="mt-2 flex-1 text-sm">{f.text}</p>
                  <figcaption className="mt-4 text-xs text-muted">
                    {t.problem.sourceLabel}:{" "}
                    <a href={SOURCES[f.source].url} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand">
                      {SOURCES[f.source].label}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted">{t.problem.datesNote}</p>
          </Section>
        </div>

        {/* How it works */}
        <Section id="how" title={t.how.title}>
          <ol className="grid gap-4 md:grid-cols-3">
            {t.how.steps.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-surface p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand font-semibold text-brand-fg">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Interactive demo */}
        <div className="bg-surface">
          <Section id="demo" title={t.demo.title} subtitle={t.demo.subtitle}>
            <Demo t={t.demo} />
          </Section>
        </div>

        {/* Benefits */}
        <Section title={t.benefits.title}>
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {t.benefits.items.map((b) => (
              <div key={b.title} className="border-l-2 border-brand pl-4">
                <h3 className="font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted">{b.text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Pricing */}
        <div className="border-y border-line bg-surface">
          <Section id="pricing" title={t.pricing.title} subtitle={t.pricing.subtitle}>
            <div className="grid gap-5 md:grid-cols-2">
              {(["per_property", "manager"] as const).map((id) => {
                const p = t.pricing.plans[id];
                const featured = id === "manager";
                return (
                  <div key={id} className={`flex flex-col rounded-2xl border p-6 ${featured ? "border-brand bg-bg shadow-lg shadow-brand/10" : "border-line bg-bg"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xl font-semibold">{p.name}</h3>
                      <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[11px] font-semibold text-warn">{t.pricing.estimate}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{p.blurb}</p>
                    <p className="mt-5">
                      <b className="font-display text-5xl tabular-nums">US${PLANS[id].price}</b>
                      <span className="text-muted">{t.pricing.perMonth}</span>
                    </p>
                    <p className="text-sm text-muted">{p.unit}</p>
                    <ul className="mt-5 flex-1 space-y-2 text-sm">
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2"><span aria-hidden className="text-brand">✓</span>{f}</li>
                      ))}
                    </ul>
                    <p className="mt-5 text-sm font-medium">{fmt(t.pricing.trial, TRIAL_DAYS)}</p>
                    <PlanButton plan={id} className={`mt-3 ${featured ? btnPrimary : btnSecondary}`}>{p.cta}</PlanButton>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-sm text-muted">{t.pricing.payment}</p>
            <p className="mt-1 text-sm text-muted">{t.pricing.extras}</p>
          </Section>
        </div>

        {/* FAQ */}
        <Section id="faq" title={t.faq.title}>
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {t.faq.items.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span aria-hidden className="text-brand transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final CTA + contact */}
        <div className="bg-ink text-white">
          <section id="contact" className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.3fr]">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/renewly-mark.svg" alt="" width={48} height={48} />
              <h2 className="mt-5 font-display text-3xl sm:text-4xl">{t.contact.title}</h2>
              <p className="mt-3 text-white/75">{t.contact.subtitle}</p>
              <p className="mt-6 font-display text-xl text-brand-light">Never miss a license renewal.</p>
              {wa && (
                <TrackLink
                  event="whatsapp_click"
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-5 py-3 text-sm font-semibold text-[#06281a]"
                >
                  <WhatsAppIcon /> {t.contact.whatsapp}
                </TrackLink>
              )}
            </div>
            <div className="rounded-2xl bg-surface p-6 text-fg">
              <ContactForm t={t.contact} plans={t.pricing.plans} lang={lang} />
            </div>
          </section>
        </div>
      </main>

      <SiteFooter lang={lang} t={t} />
    </>
  );
}

function HeroCard({ t }: { t: ReturnType<typeof getDictionary> }) {
  const rows = [
    ["Ocean Club West 4B", "5", "bad"],
    ["Villa Sandcastle", "11", "warn"],
    ["Casa Azul", "11", "warn"],
    ["Blue Hills Bistro", "160", "ok"],
  ] as const;
  const cls = { bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", ok: "bg-ok-soft text-ok" };
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xl shadow-ink/10">
      <div className="flex items-center justify-between">
        <b className="font-display text-lg">{t.demo.tabs.panel}</b>
        <span className="text-xs text-muted">{t.demo.badge}</span>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {rows.map(([n, d, s]) => (
          <li key={n} className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm font-medium">{n}</span>
            <span className="flex items-center gap-3">
              <span className="text-sm tabular-nums text-muted">{d} d</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls[s]}`}>{t.demo.status[s]}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
