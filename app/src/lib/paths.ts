// Route rules shared by the middleware and the server actions. Pure functions, unit tested.

const PUBLIC = ["/login", "/signup", "/forgot", "/reset", "/auth", "/lang", "/invite", "/api/health", "/api/cron"];

export function isPublicPath(path: string): boolean {
  return path === "/" || PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Only same-site relative paths are allowed as redirect targets (blocks open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const u = new URL(next, "http://x");
    if (u.host !== "x") return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}
