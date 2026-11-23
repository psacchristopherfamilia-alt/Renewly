import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, parseImport, splitCsv } from "@/lib/csv";

describe("splitCsv", () => {
  it("handles quotes, commas inside quotes, CRLF and BOM", () => {
    expect(splitCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });
  it("detects semicolons", () => {
    expect(splitCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseImport", () => {
  it("reads the template in Spanish", () => {
    const { rows, errors } = parseImport(CSV_TEMPLATE);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "Villa Coral", island: "providenciales", has_pool: true, license_type: "accommodation", expires_on: "2026-12-31", fee_estimate: "1450" });
    expect(rows[1]).toMatchObject({ license_type: "business", expires_on: "2027-03-31", has_pool: false });
  });
  it("reads English headers and ISO dates", () => {
    const { rows, errors } = parseImport("Name,Island,Pool,Licence type,Expiry\nSea View,Salt Cay,yes,Accommodation,2026-12-31");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ island: "salt_cay", has_pool: true, license_type: "accommodation" });
  });
  it("reports every bad field with its line", () => {
    const { errors } = parseImport("nombre,isla,tipo,vence,tasa\nX,Atlantis,permiso,31/02/2026,abc");
    expect(errors.map((e) => `${e.line}:${e.field}`)).toEqual(["2:name", "2:island", "2:license_type", "2:expires_on", "2:fee_estimate"]);
  });
  it("requires a name column and refuses huge files", () => {
    expect(parseImport("isla\nProvo").errors[0].code).toBe("missing_column");
    expect(parseImport("nombre\n" + "Villa\n".repeat(501)).errors[0].code).toBe("too_many_rows");
  });
});
