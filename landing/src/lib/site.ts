// Business settings for the sales page. Anything that can change without a code review
// (WhatsApp number, site URL) comes from environment variables.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** International format without "+" or spaces, e.g. 16495551234. Empty hides the WhatsApp button. */
export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}

/** Plans offered on the page. Prices are estimates still to be validated with customers. */
export const PLANS = {
  per_property: { price: 39, currency: "USD", volumeDiscountFrom: 10 },
  manager: { price: 149, currency: "USD", maxProperties: 25 },
} as const;
export type PlanId = keyof typeof PLANS | "undecided";
export const PLAN_IDS = ["per_property", "manager", "undecided"] as const;

/** Free trial length offered during the pilot. Pending final confirmation. */
export const TRIAL_DAYS = 14;

/** Official sources quoted on the page. Every figure shown must point to one of these. */
export const SOURCES = {
  compliance: {
    url: "https://www.pressoffice.gov.tc/latest/department-of-tourism-regulations-achieves-90-compliance-in-accommodation-enforcement-initiative",
    label: "TCIG Press Office · Dept. of Tourism Regulations, 18 Mar 2026",
  },
  fine: {
    url: "https://gov.tc/tourismregulations/news/department-of-tourism-regulations-urges-property-owners-to-register-by-september-2024-to-avoid-fines",
    label: "Dept. of Tourism Regulations · gov.tc",
  },
  businessLicence: {
    url: "https://www.pressoffice.gov.tc/latest/business-licence-renewal-period-2026",
    label: "TCIG Press Office · Inland Revenue Department, 2026",
  },
  busreg: {
    url: "https://gov.tc/mof/portals/",
    label: "Ministry of Finance · e-Services portals",
  },
} as const;
export type SourceId = keyof typeof SOURCES;
