import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { DM_Sans, Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getDictionary } from "@/i18n";
import { LOCALES, SITE_URL, isLocale } from "@/lib/site";
import "../globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-fraunces", display: "swap" });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1222" },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang).meta;
  return {
    metadataBase: new URL(SITE_URL),
    title: t.title,
    description: t.description,
    applicationName: "Renewly",
    alternates: { canonical: `/${lang}`, languages: { es: "/es", en: "/en", "x-default": "/es" } },
    openGraph: {
      type: "website",
      siteName: "Renewly",
      title: t.title,
      description: t.description,
      url: `/${lang}`,
      locale: lang === "es" ? "es_419" : "en_US",
      images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: t.ogAlt }],
    },
    twitter: { card: "summary_large_image", title: t.title, description: t.description, images: ["/brand/og.png"] },
    manifest: "/manifest.webmanifest",
  };
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={`${dmSans.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
