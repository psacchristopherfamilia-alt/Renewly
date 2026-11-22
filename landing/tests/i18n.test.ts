import { describe, expect, it } from "vitest";
import en from "@/i18n/en";
import es from "@/i18n/es";
import { privacy, terms } from "@/i18n/legal";
import { SOURCES } from "@/lib/site";

function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

describe("dictionaries", () => {
  it("es and en have the same keys and list lengths", () => {
    expect(shape(en)).toEqual(shape(es));
  });

  it("legal pages have the same sections in both languages", () => {
    expect(privacy.en.sections.length).toBe(privacy.es.sections.length);
    expect(terms.en.sections.length).toBe(terms.es.sections.length);
  });

  it("every evidence figure cites an official source", () => {
    for (const d of [es, en]) {
      for (const f of d.problem.facts) {
        expect(SOURCES[f.source]).toBeDefined();
        expect(SOURCES[f.source].url).toMatch(/^https:\/\/(www\.)?(pressoffice\.)?gov\.tc\//);
      }
    }
  });

  it("pricing is labelled as an estimate", () => {
    expect(es.pricing.estimate).toBe("Estimación");
    expect(en.pricing.estimate).toBe("Estimate");
  });
});

describe("fmt", () => {
  it("fills {n}", async () => {
    const { fmt } = await import("@/i18n/fmt");
    expect(fmt(es.demo.batchDone, 3)).toMatch(/^3 /);
    expect(fmt(en.pricing.trial, 14)).toBe("14-day free trial");
  });
});
