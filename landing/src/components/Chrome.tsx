import Link from "next/link";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/lib/site";
import { TrackLink } from "./TrackLink";
import { Logo, btnPrimary } from "./ui";

export function SiteHeader({ lang, t }: { lang: Locale; t: Dictionary }) {
  const other = lang === "es" ? "en" : "es";
  const home = `/${lang}`;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo lang={lang} />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href={`${home}#how`} className="hover:text-fg">{t.nav.how}</a>
          <a href={`${home}#demo`} className="hover:text-fg">{t.nav.demo}</a>
          <a href={`${home}#pricing`} className="hover:text-fg">{t.nav.pricing}</a>
          <a href={`${home}#faq`} className="hover:text-fg">{t.nav.faq}</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href={`/${other}`} hrefLang={other} className="text-sm font-medium text-muted hover:text-fg">
            {t.nav.lang}
          </Link>
          <TrackLink event="header_cta" href={`${home}#contact`} className={`${btnPrimary} hidden px-4 py-2 sm:inline-flex`}>
            {t.nav.cta}
          </TrackLink>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ lang, t }: { lang: Locale; t: Dictionary }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo lang={lang} />
          <div className="flex gap-5 text-sm text-muted">
            <Link href={`/${lang}/privacy`} className="hover:text-fg">{t.footer.privacy}</Link>
            <Link href={`/${lang}/terms`} className="hover:text-fg">{t.footer.terms}</Link>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-xs text-muted">{t.footer.disclaimer}</p>
        <p className="mt-2 text-xs text-muted">© {new Date().getFullYear()} Renewly. {t.footer.rights}</p>
      </div>
    </footer>
  );
}
