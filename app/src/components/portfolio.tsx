import type { Status } from "@/lib/status";

const pill: Record<Status, string> = { bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", ok: "bg-ok-soft text-ok" };

export function StatusPill({ status, label }: { status: Status; label: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill[status]}`}>{label}</span>;
}

export function money(n: number | null | undefined) {
  return n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function fmtDate(iso: string, lang: "es" | "en") {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === "en" ? "en-GB" : "es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums text-muted">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-line" aria-hidden><span className="block h-full bg-brand" style={{ width: `${pct}%` }} /></span>
      {done}/{total}
    </span>
  );
}
