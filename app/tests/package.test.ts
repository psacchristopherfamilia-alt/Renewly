import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renewalPackagePdf, type PackageData } from "@/lib/renewals/package";

async function onePagePdf() {
  const d = await PDFDocument.create();
  d.addPage([300, 300]);
  d.addPage([300, 300]);
  return d.save();
}
// 1×1 PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

const base = async (): Promise<PackageData> => ({
  locale: "es", licence_name: "Licencia de alojamiento", authority: "Department of Tourism Regulations", portal_url: "https://gov.tc/tourismregulations/",
  deadline: "2026-12-02", provisional: true,
  form: { property_name: "Villa Coral → Grace Bay", owner_name: "R. Smith", license_number: "ACC-77" },
  field_labels: { property_name: "Propiedad", owner_name: "Dueño", license_number: "Número de licencia", contact_phone: "Teléfono" },
  requirements: [
    { label: "Formulario firmado", required: true, status: "uploaded", file_name: "form.pdf", source: "template" },
    { label: "Seguro", required: true, status: "expired", file_name: "ins.png", source: "template" },
    { label: "Certificado de extintores", required: true, status: "missing", file_name: null, source: "office_request" },
  ],
  documents: [
    { label: "Formulario firmado", file_name: "form.pdf", mime: "application/pdf", bytes: await onePagePdf() },
    { label: "Seguro", file_name: "ins.png", mime: "image/png", bytes: PNG },
    { label: "Foto", file_name: "x.heic", mime: "image/heic", bytes: new Uint8Array([1, 2, 3]) },
  ],
});

describe("renewal package", () => {
  it("has a cover page plus every annex in order (PDF pages copied, images embedded, others noted)", async () => {
    const pdf = await PDFDocument.load(await renewalPackagePdf([await base()]));
    // cover (1) + PDF annex (2 pages) + image (1) + note for HEIC (1)
    expect(pdf.getPageCount()).toBe(5);
  });
  it("combines several packages for a batch download", async () => {
    const pdf = await PDFDocument.load(await renewalPackagePdf([await base(), { ...(await base()), locale: "en", documents: [] }]));
    expect(pdf.getPageCount()).toBe(6);
  });
});
