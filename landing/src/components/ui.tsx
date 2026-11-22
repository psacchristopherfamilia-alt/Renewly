import Link from "next/link";
import type { Locale } from "@/lib/site";

export function Logo({ lang, className = "" }: { lang: Locale; className?: string }) {
  return (
    <Link href={`/${lang}`} className={`flex items-center gap-2.5 font-bold tracking-tight text-fg ${className}`} aria-label="Renewly">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/renewly-mark.svg" alt="" width={32} height={32} className="h-8 w-8" />
      <span className="text-xl">Renewly</span>
    </Link>
  );
}

export function Section({
  id,
  title,
  subtitle,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 ${className}`}>
      <h2 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 max-w-2xl text-muted">{subtitle}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

export const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg shadow-sm transition hover:opacity-90";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-line bg-surface px-5 py-3 text-sm font-semibold text-fg transition hover:border-brand";
