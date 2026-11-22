"use client";

import { useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import type { Dictionary } from "@/i18n";
import { fmt } from "@/i18n/fmt";

// Sample portfolio from the approved prototype. Fictional properties, owners and fees.
const REF = new Date("2026-11-21T00:00:00");
type Inspection = "ok" | "warn" | "bad";
type Prop = { id: number; n: string; z: string; o: string; t: "accommodation" | "business"; d: string; ins: Inspection; pool: boolean; fee: number };
const SAMPLE: Prop[] = [
  { id: 1, n: "Villa Sandcastle", z: "Grace Bay", o: "Familia Whitfield", t: "accommodation", d: "2026-12-02", ins: "ok", pool: true, fee: 1450 },
  { id: 2, n: "Casa Azul", z: "Long Bay", o: "R. Delancy", t: "accommodation", d: "2026-12-02", ins: "warn", pool: false, fee: 1450 },
  { id: 3, n: "Turtle Cove Suites", z: "Turtle Cove", o: "Cove Holdings Ltd.", t: "accommodation", d: "2026-12-02", ins: "ok", pool: true, fee: 2900 },
  { id: 4, n: "Blue Hills Bistro", z: "Blue Hills", o: "M. Jolly", t: "business", d: "2027-04-30", ins: "ok", pool: true, fee: 600 },
  { id: 5, n: "Ocean Club West 4B", z: "Grace Bay", o: "Hartley Trust", t: "accommodation", d: "2026-11-26", ins: "bad", pool: true, fee: 1450 },
  { id: 6, n: "Salt Cay Cottage", z: "Salt Cay", o: "P. Gardiner", t: "accommodation", d: "2026-12-02", ins: "warn", pool: true, fee: 1450 },
];

type Status = "bad" | "warn" | "ok";
const days = (d: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - REF.getTime()) / 86_400_000);
function status(p: Prop): Status {
  const n = days(p.d);
  if (p.ins === "bad" || n <= 7) return "bad";
  if (n <= 14 || p.ins === "warn" || !p.pool) return "warn";
  return "ok";
}
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const pillCls: Record<Status, string> = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
};

type Tab = "panel" | "prop" | "batch";

export function Demo({ t }: { t: Dictionary["demo"] }) {
  const [tab, setTab] = useState<Tab>("panel");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [sel, setSel] = useState(1);
  const [checks, setChecks] = useState<Record<number, boolean[]>>({});
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [batchMsg, setBatchMsg] = useState("");

  const sorted = useMemo(() => [...SAMPLE].sort((a, b) => days(a.d) - days(b.d)), []);
  const count = (s: Status) => SAMPLE.filter((p) => status(p) === s).length;
  const prop = SAMPLE.find((p) => p.id === sel)!;
  const defaults = [true, prop.pool, prop.ins === "ok", true, true];
  const current = checks[sel] ?? defaults;
  const missing = current.filter((x) => !x).length;
  const eligible = SAMPLE.filter((p) => p.t === "accommodation");
  const chosen = eligible.filter((p) => picked[p.id] !== false);

  const go = (v: Tab) => {
    setTab(v);
    setMsg("");
    setBatchMsg("");
    track("demo_tab", { tab: v });
  };

  return (
    <div className="rounded-2xl border border-line bg-bg p-3 shadow-xl shadow-ink/5 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="rounded border border-line px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted">{t.badge}</span>
        <span className="text-xs text-muted">{t.refNote}</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [String(SAMPLE.length), t.kpis.total, ""],
          [String(count("bad")), t.kpis.urgent, "text-bad"],
          [String(count("warn")), t.kpis.attention, "text-warn"],
          [money(SAMPLE.reduce((s, p) => s + p.fee, 0)), t.kpis.fees, ""],
        ].map(([v, l, c]) => (
          <div key={l} className="min-w-0 rounded-lg border border-line bg-surface p-3">
            <b className={`block font-display text-2xl tabular-nums ${c}`}>{v}</b>
            <span className="text-xs text-muted">{l}</span>
          </div>
        ))}
      </div>

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {(["panel", "prop", "batch"] as Tab[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={tab === v}
            onClick={() => go(v)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === v ? "border-brand text-brand" : "border-transparent text-muted"}`}
          >
            {t.tabs[v]}
          </button>
        ))}
      </div>

      {tab === "panel" && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {(["all", "bad", "warn", "ok"] as const).map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f ? "border-brand bg-brand text-brand-fg" : "border-line bg-surface"}`}
              >
                {t.filters[f]}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted">
                  {[t.cols.property, t.cols.zone, t.cols.type, t.cols.due, t.cols.days, t.cols.status].map((c) => (
                    <th key={c} className="px-3 py-2 font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted
                  .filter((p) => filter === "all" || status(p) === filter)
                  .map((p) => {
                    const s = status(p);
                    return (
                      <tr
                        key={p.id}
                        tabIndex={0}
                        onClick={() => { setSel(p.id); go("prop"); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { setSel(p.id); go("prop"); } }}
                        className="cursor-pointer border-t border-line hover:bg-brand-soft"
                      >
                        <td className="px-3 py-2.5"><b className="font-semibold">{p.n}</b><div className="text-xs text-muted">{p.o}</div></td>
                        <td className="px-3 py-2.5">{p.z}</td>
                        <td className="px-3 py-2.5">{t.types[p.t]}</td>
                        <td className="px-3 py-2.5 tabular-nums">{p.d}</td>
                        <td className="px-3 py-2.5 tabular-nums">{days(p.d)}</td>
                        <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pillCls[s]}`}>{t.status[s]}</span></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "prop" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg">{prop.n}</h3>
              <select
                aria-label={t.cols.property}
                value={sel}
                onChange={(e) => { setSel(Number(e.target.value)); setMsg(""); }}
                className="rounded border border-line bg-surface px-2 py-1 text-sm"
              >
                {SAMPLE.map((p) => <option key={p.id} value={p.id}>{p.n}</option>)}
              </select>
            </div>
            <div className="text-xs text-muted">{prop.z} · {prop.o}</div>
            <p className="mt-3"><b className="font-display text-3xl tabular-nums">{days(prop.d)}</b> {t.daysLeft}</p>
            <div className="text-xs text-muted">{prop.d} · {t.feeLabel} {money(prop.fee)}</div>
            <div className={`my-3 rounded-md p-3 text-sm ${days(prop.d) <= 14 ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok"}`}>
              {days(prop.d) <= 14 ? t.renewNow : t.inWindow}
            </div>
            <button
              onClick={() => { setMsg(missing ? fmt(t.pending, missing) : t.prepared); track("demo_prepare"); }}
              className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-fg"
            >
              {t.prepare}
            </button>
            <p className="mt-2 text-xs text-muted" aria-live="polite">{msg}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-surface p-4">
            <h3 className="font-display text-lg">{t.checklist}</h3>
            <div className="text-xs text-muted">{missing ? fmt(t.missing, missing) : t.allDone}</div>
            <ul className="mt-2">
              {t.items.map((label, i) => (
                <li key={label} className="flex gap-3 border-t border-line py-2 first:border-t-0">
                  <input
                    id={`ck-${i}`}
                    type="checkbox"
                    checked={current[i]}
                    onChange={(e) => {
                      const next = [...current];
                      next[i] = e.target.checked;
                      setChecks({ ...checks, [sel]: next });
                      setMsg("");
                    }}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                  />
                  <label htmlFor={`ck-${i}`} className="text-sm">{label}</label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "batch" && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="font-display text-lg">{t.batchTitle}</h3>
          <div className="text-xs text-muted">{t.batchDeadline}</div>
          <ul className="mt-2">
            {eligible.map((p) => (
              <li key={p.id} className="flex gap-3 border-t border-line py-2 first:border-t-0">
                <input
                  id={`b-${p.id}`}
                  type="checkbox"
                  checked={picked[p.id] !== false}
                  onChange={(e) => { setPicked({ ...picked, [p.id]: e.target.checked }); setBatchMsg(""); }}
                  className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                />
                <label htmlFor={`b-${p.id}`} className="text-sm">
                  <b className="font-semibold">{p.n}</b> <span className="text-xs text-muted">· {p.o} · {money(p.fee)}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="my-3 font-semibold tabular-nums">{t.total}: {money(chosen.reduce((s, p) => s + p.fee, 0))}</p>
          <button
            onClick={() => { setBatchMsg(fmt(t.batchDone, chosen.length)); track("demo_batch", { count: String(chosen.length) }); }}
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-fg"
          >
            {t.batchCta}
          </button>
          <p className="mt-2 text-xs text-muted" aria-live="polite">{batchMsg}</p>
        </div>
      )}
    </div>
  );
}
