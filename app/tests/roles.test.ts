import { describe, expect, it } from "vitest";
import { assignableRoles, atLeast, canManage, isRole } from "@/lib/roles";

describe("roles (mirror of the database rules)", () => {
  it("ranks roles", () => {
    expect(atLeast("owner", "admin")).toBe(true);
    expect(atLeast("operator", "admin")).toBe(false);
    expect(atLeast(null, "viewer")).toBe(false);
  });
  it("only owners assign owner", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("operator")).toEqual([]);
    expect(assignableRoles("viewer")).toEqual([]);
  });
  it("admins cannot manage owners", () => {
    expect(canManage("admin", "owner")).toBe(false);
    expect(canManage("admin", "viewer")).toBe(true);
    expect(canManage("owner", "owner")).toBe(true);
    expect(canManage("operator", "viewer")).toBe(false);
  });
  it("validates role strings", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("superuser")).toBe(false);
  });
});
