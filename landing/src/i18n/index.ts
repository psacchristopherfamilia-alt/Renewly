import type { Locale } from "@/lib/site";
import en from "./en";
import es, { type Dictionary } from "./es";

const dictionaries: Record<Locale, Dictionary> = { es, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
