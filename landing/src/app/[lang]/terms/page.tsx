import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { terms } from "@/i18n/legal";
import { isLocale } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return { title: `${terms[lang].title} · Renewly`, alternates: { canonical: `/${lang}/terms`, languages: { es: "/es/terms", en: "/en/terms" } } };
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <LegalPage lang={lang} doc={terms[lang]} />;
}
