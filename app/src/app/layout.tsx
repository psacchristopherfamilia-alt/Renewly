import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { getLocale } from "@/lib/session";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "Renewly",
  description: "Never miss a license renewal.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={await getLocale()} className={`${dmSans.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
