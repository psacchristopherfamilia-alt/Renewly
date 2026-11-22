import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { privacy } from "@/i18n/legal";
import { isLocale } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return { title: `${privacy[lang].title} · Renewly`, alternates: { canonical: `/${lang}/privacy`, languages: { es: "/es/privacy", en: "/en/privacy" } } };
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <LegalPage lang={lang} doc={privacy[lang]} />;
}
