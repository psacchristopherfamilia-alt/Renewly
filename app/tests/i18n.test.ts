import { describe, expect, it } from "vitest";
import en from "@/i18n/en";
import es from "@/i18n/es";

const keys = (v: unknown, p = ""): string[] =>
  v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => keys(x, `${p}.${k}`)) : [p];

describe("dictionaries", () => {
  it("es and en have the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });
  it("every database error code has a message", () => {
    for (const c of ["forbidden", "last_owner", "already_member", "invalid_invitation", "invitation_email_mismatch"]) {
      expect(es.errors).toHaveProperty(c);
    }
  });
});
