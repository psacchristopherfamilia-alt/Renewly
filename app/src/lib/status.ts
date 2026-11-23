// Status of a licence for the dashboard, from the official filing deadline (or the expiry when there is none).
//   bad  → deadline in 7 days or less (or past, or the licence expired), or within 14 days with required items pending.
//   warn → deadline within 30 days, or required checklist items still pending.
//   ok   → otherwise.
export type Status = "bad" | "warn" | "ok";

export type OverviewRow = {
  expires_on: string;
  filing_deadline: string | null;
  required_items: number;
  required_done: number;
};

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function deadlineOf(r: OverviewRow): string {
  return r.filing_deadline ?? r.expires_on;
}

export function licenceStatus(r: OverviewRow, today: string): Status {
  const toDeadline = daysBetween(today, deadlineOf(r));
  const toExpiry = daysBetween(today, r.expires_on);
  const incomplete = r.required_done < r.required_items;
  if (toDeadline <= 7 || toExpiry < 0 || (toDeadline <= 14 && incomplete)) return "bad";
  if (toDeadline <= 30 || incomplete) return "warn";
  return "ok";
}

/** Today's date in Turks and Caicos (America/Grand_Turk), as YYYY-MM-DD. */
export function todayTci(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Grand_Turk", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
