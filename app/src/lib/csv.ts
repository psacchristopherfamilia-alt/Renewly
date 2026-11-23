// CSV import for properties and licences. Pure functions, unit tested.
// Accepts headers in Spanish or English, comma or semicolon separators, quoted fields,
// dates as YYYY-MM-DD or DD/MM/YYYY, and yes/no in either language.

export type ImportRow = {
  name: string;
  island: string;
  area: string;
  owner_name: string;
  has_pool: boolean;
  license_type: "" | "accommodation" | "business";
  expires_on: string;
  license_number: string;
  fee_estimate: string;
};
export type ImportError = { line: number; field: string; code: string };

const HEADERS: Record<string, keyof ImportRow> = {
  name: "name", nombre: "name", property: "name", propiedad: "name",
  island: "island", isla: "island",
  area: "area", zona: "area",
  owner: "owner_name", owner_name: "owner_name", dueno: "owner_name", propietario: "owner_name",
  pool: "has_pool", has_pool: "has_pool", piscina: "has_pool",
  license_type: "license_type", licence_type: "license_type", tipo: "license_type", tipo_licencia: "license_type", type: "license_type",
  expires_on: "expires_on", expiry: "expires_on", vence: "expires_on", vencimiento: "expires_on",
  license_number: "license_number", licence_number: "license_number", numero: "license_number", numero_licencia: "license_number",
  fee: "fee_estimate", fee_estimate: "fee_estimate", tasa: "fee_estimate",
};

const ISLANDS: Record<string, string> = {
  providenciales: "providenciales", provo: "providenciales", "grand turk": "grand_turk", grand_turk: "grand_turk",
  "north caicos": "north_caicos", north_caicos: "north_caicos", "middle caicos": "middle_caicos", middle_caicos: "middle_caicos",
  "south caicos": "south_caicos", south_caicos: "south_caicos", "salt cay": "salt_cay", salt_cay: "salt_cay", other: "other", otra: "other",
};

const TYPES: Record<string, ImportRow["license_type"]> = {
  accommodation: "accommodation", alojamiento: "accommodation", tourism: "accommodation", turismo: "accommodation",
  business: "business", comercial: "business", negocio: "business",
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function splitCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

function parseDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const MAX_IMPORT_ROWS = 500;

export function parseImport(text: string): { rows: ImportRow[]; errors: ImportError[] } {
  const table = splitCsv(text);
  const errors: ImportError[] = [];
  if (table.length < 2) return { rows: [], errors: [{ line: 1, field: "", code: "empty" }] };
  const cols = table[0].map((h) => HEADERS[fold(h).replace(/\s+/g, "_")]);
  if (!cols.includes("name")) return { rows: [], errors: [{ line: 1, field: "name", code: "missing_column" }] };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], errors: [{ line: 1, field: "", code: "too_many_rows" }] };

  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const get = (k: keyof ImportRow) => {
      const i = cols.indexOf(k);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const row: ImportRow = {
      name: get("name"), island: "providenciales", area: get("area").slice(0, 80), owner_name: get("owner_name").slice(0, 120),
      has_pool: false, license_type: "", expires_on: "", license_number: get("license_number").slice(0, 60), fee_estimate: "",
    };
    if (row.name.length < 2 || row.name.length > 120) errors.push({ line, field: "name", code: "invalid" });
    const island = get("island");
    if (island) {
      const v = ISLANDS[fold(island)];
      if (v) row.island = v; else errors.push({ line, field: "island", code: "invalid" });
    }
    const pool = fold(get("has_pool"));
    if (pool) {
      if (["si", "yes", "true", "1", "x"].includes(pool)) row.has_pool = true;
      else if (!["no", "false", "0"].includes(pool)) errors.push({ line, field: "has_pool", code: "invalid" });
    }
    const type = get("license_type");
    if (type) {
      const v = TYPES[fold(type)];
      if (v) row.license_type = v; else errors.push({ line, field: "license_type", code: "invalid" });
    }
    const exp = get("expires_on");
    if (exp) {
      const v = parseDate(exp);
      if (v) row.expires_on = v; else errors.push({ line, field: "expires_on", code: "invalid" });
    }
    const fee = get("fee_estimate").replace(/[$,\s]/g, "");
    if (fee) {
      if (/^\d+(\.\d{1,2})?$/.test(fee)) row.fee_estimate = fee; else errors.push({ line, field: "fee_estimate", code: "invalid" });
    }
    rows.push(row);
  });
  return { rows, errors };
}

export const CSV_TEMPLATE =
  "nombre,isla,zona,dueno,piscina,tipo_licencia,vence,numero_licencia,tasa\n" +
  "Villa Coral,Providenciales,Grace Bay,Familia Smith,si,alojamiento,31/12/2026,ACC-0001,1450\n" +
  "Reef Bistro,Providenciales,Turtle Cove,R. Jones,no,comercial,31/03/2027,,600\n";
