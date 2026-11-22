import { describe, expect, it } from "vitest";
import { isPublicPath, safeNext } from "@/lib/paths";

describe("safeNext", () => {
  it.each([
    ["/team", "/team"],
    ["/invite/abc?x=1", "/invite/abc?x=1"],
    [null, "/dashboard"],
    ["", "/dashboard"],
    ["https://evil.com", "/dashboard"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
  ])("%s → %s", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});

describe("isPublicPath", () => {
  it("keeps the app private and auth pages public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/invite/tok")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/team")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
