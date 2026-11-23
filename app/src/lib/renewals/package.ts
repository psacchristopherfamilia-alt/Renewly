// Renewal package PDF: cover with the pre-filled form data, index of requirements with their status, then the
// attached documents in index order (PDF pages copied, JPG/PNG embedded on a Letter page). Pure: data in, bytes out.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { drawLogo } from "@/lib/billing/pdf";

export type PackageRequirement = { label: string; required: boolean; status: "uploaded" | "missing" | "expired"; file_name: string | null; source: string };
export type PackageDoc = { label: string; file_name: string; mime: string; bytes: Uint8Array | null };
export type PackageData = {
  locale: "es" | "en";
  licence_name: string;
  authority: string;
  portal_url: string | null;
  deadline: string;
  provisional: boolean;
  form: Record<string, string>;
  field_labels: Record<string, string>;
  requirements: PackageRequirement[];
  documents: PackageDoc[];
};

const INK = rgb(15 / 255, 23 / 255, 42 / 255);
const MUTED = rgb(85 / 255, 99 / 255, 125 / 255);
const LINE = rgb(216 / 255, 224 / 255, 238 / 255);
const STATUS_COLOR = { uploaded: rgb(23 / 255, 112 / 255, 58 / 255), missing: rgb(179 / 255, 38 / 255, 30 / 255), expired: rgb(154 / 255, 85 / 255, 0) };

const T = {
  es: {
    title: "Paquete de renovación", deadline: "Solicitar antes de", authority: "Oficina", portal: "Portal",
    data: "Datos para el formulario oficial", index: "Índice de documentos", annex: "Anexo", status: { uploaded: "Subido", missing: "FALTA", expired: "VENCIDO" },
    optional: "(opcional)", office: "(pedido por la oficina)",
    provisional: "Formato provisional preparado por Renewly. Copia estos datos en el formulario oficial; no reemplaza al formulario de la oficina.",
    confirm: "Lista de documentos por confirmar con la oficina.", notEmbedded: "Este archivo no se puede incluir en el PDF (formato {mime}). Adjúntalo por separado.",
    footer: "Preparado con Renewly · El cliente presenta la renovación en el portal oficial.",
  },
  en: {
    title: "Renewal package", deadline: "File by", authority: "Office", portal: "Portal",
    data: "Data for the official form", index: "Document index", annex: "Annex", status: { uploaded: "Uploaded", missing: "MISSING", expired: "EXPIRED" },
    optional: "(optional)", office: "(requested by the office)",
    provisional: "Provisional format prepared by Renewly. Copy this data into the official form; it does not replace the office's form.",
    confirm: "Document list to be confirmed with the office.", notEmbedded: "This file cannot be included in the PDF ({mime}). Attach it separately.",
    footer: "Prepared with Renewly · The customer files the renewal on the official portal.",
  },
};

const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, (c) => ({ "—": "-", "–": "-", "→": "->", "“": '"', "”": '"', "’": "'" })[c] ?? "?");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function renewalPackagePdf(packages: PackageData[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Renewly renewal package");
  doc.setAuthor("Renewly");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const d of packages) {
    const t = T[d.locale];
    let page: PDFPage = doc.addPage([612, 792]);
    let y = 740;
    const text = (s: string, x: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
      page.drawText(safe(s), { x, y, size: o.size ?? 10, font: o.f ?? font, color: o.color ?? INK });
    const need = (h: number) => { if (y - h < 60) { page = doc.addPage([612, 792]); y = 740; } };

    drawLogo(page, 48, 726, 26);
    text(`${t.title} · ${d.licence_name}`, 80, { size: 16, f: bold });
    y -= 22;
    text(d.form.property_name ?? "", 80, { size: 12 });
    y -= 26;
    text(`${t.deadline}: ${d.deadline}    ${t.authority}: ${d.authority}`, 48, { size: 9, color: MUTED });
    if (d.portal_url) { y -= 12; text(`${t.portal}: ${d.portal_url}`, 48, { size: 9, color: MUTED }); }
    y -= 18;
    for (const l of wrap(t.provisional, font, 8.5, 516)) { text(l, 48, { size: 8.5, color: MUTED }); y -= 11; }

    y -= 14;
    text(t.data, 48, { size: 12, f: bold });
    y -= 8;
    for (const [k, label] of Object.entries(d.field_labels)) {
      const v = d.form[k] ?? "";
      const lines = wrap(v || "—", font, 10, 330);
      need(lines.length * 13 + 8);
      y -= 16;
      page.drawLine({ start: { x: 48, y: y + 12 }, end: { x: 564, y: y + 12 }, thickness: 0.5, color: LINE });
      text(label, 48, { size: 9, color: MUTED });
      lines.forEach((l, i) => { page.drawText(l, { x: 234, y: y - i * 13, size: 10, font, color: INK }); });
      y -= (lines.length - 1) * 13;
    }

    need(80);
    y -= 30;
    text(t.index, 48, { size: 12, f: bold });
    if (d.provisional) { y -= 13; text(t.confirm, 48, { size: 8.5, color: MUTED }); }
    d.requirements.forEach((r, i) => {
      need(30);
      y -= 18;
      const tag = r.source === "office_request" ? ` ${t.office}` : r.required ? "" : ` ${t.optional}`;
      text(`${i + 1}. ${r.label}${tag}`, 48, { size: 10 });
      const st = t.status[r.status];
      page.drawText(safe(st), { x: 564 - bold.widthOfTextAtSize(st, 9), y, size: 9, font: bold, color: STATUS_COLOR[r.status] });
      if (r.file_name) { y -= 11; text(`${t.annex} ${i + 1}: ${r.file_name}`, 62, { size: 8, color: MUTED }); }
    });
    need(30);
    y -= 30;
    text(t.footer, 48, { size: 8, color: MUTED });

    // Annexes in index order.
    for (const [i, a] of d.documents.entries()) {
      const header = (p: PDFPage) => p.drawText(safe(`${t.annex} ${i + 1} · ${a.label} · ${a.file_name}`).slice(0, 110), { x: 36, y: 770, size: 8, font, color: MUTED });
      if (a.bytes && a.mime === "application/pdf") {
        try {
          const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
          const pages = await doc.copyPages(src, src.getPageIndices());
          pages.forEach((p, n) => { doc.addPage(p); if (n === 0) header(p); });
          continue;
        } catch { /* falls through to the note page */ }
      }
      const p = doc.addPage([612, 792]);
      header(p);
      if (a.bytes && (a.mime === "image/jpeg" || a.mime === "image/png")) {
        try {
          const img = a.mime === "image/jpeg" ? await doc.embedJpg(a.bytes) : await doc.embedPng(a.bytes);
          const s = Math.min(540 / img.width, 690 / img.height, 1);
          p.drawImage(img, { x: (612 - img.width * s) / 2, y: 60 + (690 - img.height * s) / 2, width: img.width * s, height: img.height * s });
          continue;
        } catch { /* note below */ }
      }
      p.drawText(safe(t.notEmbedded.replace("{mime}", a.mime)), { x: 48, y: 700, size: 11, font, color: INK });
    }
  }
  return doc.save();
}
