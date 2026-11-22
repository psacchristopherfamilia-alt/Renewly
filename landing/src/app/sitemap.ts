import type { MetadataRoute } from "next";
import { LOCALES, SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/privacy", "/terms"];
  return paths.flatMap((p) =>
    LOCALES.map((l) => ({
      url: `${SITE_URL}/${l}${p}`,
      changeFrequency: "monthly" as const,
      priority: p === "" ? 1 : 0.3,
      alternates: { languages: Object.fromEntries(LOCALES.map((x) => [x, `${SITE_URL}/${x}${p}`])) },
    })),
  );
}
