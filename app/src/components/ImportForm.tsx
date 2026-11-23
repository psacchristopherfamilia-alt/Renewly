"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n/es";
import { CSV_TEMPLATE, type ImportError, type ImportRow, parseImport } from "@/lib/csv";

/** Reads the CSV in the browser, shows errors or a preview, and only then lets the user import. */
export function ImportForm({ t, p, action }: { t: Dictionary["importPage"]; p: Dictionary["portfolio"]; action: (fd: FormData) => void }) {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const r = parseImport(text);
    setCsv(text);
    setRows(r.rows);
    setErrors(r.errors);
  }

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;
  const types: Record<string, string> = { accommodation: "Alojamiento / Accommodation", business: "Comercial / Business" };

  return (
    <div className="space-y-4">
      <a href={template} download="renewly-plantilla.csv" className="text-sm text-brand underline">{t.template}</a>
      <label className="block text-sm font-medium">
        {t.file}
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm" />
      </label>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg bg-bad-soft p-4 text-sm text-bad">
          <p className="font-semibold">{t.errorsTitle}</p>
          <ul className="mt-2 list-disc pl-5">
            {errors.slice(0, 30).map((e, i) => (
              <li key={i}>{t.line.replace("{n}", String(e.line))}: {t.fieldNames[e.field] ?? e.field} — {t.codes[e.code] ?? e.code}</li>
            ))}
          </ul>
        </div>
      )}

      {errors.length === 0 && rows.length > 0 && (
        <>
          <h2 className="font-semibold">{t.previewTitle}</h2>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wider text-muted">
                {[p.name, p.island, p.owner, p.pool, p.licenceType, p.expiresOn].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{p.islands[r.island]}</td>
                    <td className="px-3 py-2">{r.owner_name}</td>
                    <td className="px-3 py-2">{r.has_pool ? "✓" : ""}</td>
                    <td className="px-3 py-2">{r.license_type ? types[r.license_type] : t.noLicence}</td>
                    <td className="px-3 py-2 tabular-nums">{r.expires_on || (r.license_type ? "auto" : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={action} onSubmit={() => setBusy(true)}>
            <input type="hidden" name="csv" value={csv} />
            <button disabled={busy} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg disabled:opacity-60">
              {busy ? "…" : t.confirm.replace("{n}", String(rows.length))}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
