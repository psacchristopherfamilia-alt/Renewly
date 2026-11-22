// Mirrors the database rules (supabase/migrations/*_tenancy.sql) so the screens only offer what the
// server will accept. The database stays the authority: these helpers never grant anything.

export const ROLES = ["owner", "admin", "operator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { owner: 4, admin: 3, operator: 2, viewer: 1 };

export function atLeast(role: Role | null | undefined, min: Role): boolean {
  return !!role && RANK[role] >= RANK[min];
}

/** Roles the actor may assign when inviting or changing someone. */
export function assignableRoles(actor: Role | null | undefined): Role[] {
  if (actor === "owner") return [...ROLES];
  if (actor === "admin") return ["admin", "operator", "viewer"];
  return [];
}

/** Whether the actor may change or remove a member holding `target` (self-removal is handled separately). */
export function canManage(actor: Role | null | undefined, target: Role): boolean {
  if (!atLeast(actor, "admin")) return false;
  return target !== "owner" || actor === "owner";
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}
