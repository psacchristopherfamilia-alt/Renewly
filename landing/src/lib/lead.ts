import { z } from "zod";
import { LOCALES, PLAN_IDS } from "./site";

/** Validation for the contact / pilot form. Shared by the API route and the tests. */
export const leadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+()\d\s.-]*$/, "invalid phone")
    .optional()
    .default(""),
  company: z.string().trim().max(160).optional().default(""),
  properties: z.coerce.number().int().min(1).max(5000),
  plan: z.enum(PLAN_IDS).default("undecided"),
  message: z.string().trim().max(2000).optional().default(""),
  locale: z.enum(LOCALES).default("es"),
  consent: z.literal(true),
  // Honeypot: real people never see this field, so it must stay empty.
  website: z.string().max(0).optional().default(""),
  // Attribution, filled by the page from the URL.
  utm_source: z.string().trim().max(100).optional().default(""),
  utm_medium: z.string().trim().max(100).optional().default(""),
  utm_campaign: z.string().trim().max(100).optional().default(""),
});

export type LeadInput = z.infer<typeof leadSchema>;

/** Maximum leads accepted from the same IP in one hour. */
export const LEADS_PER_IP_PER_HOUR = 5;

export function isRateLimited(recentFromSameIp: number): boolean {
  return recentFromSameIp >= LEADS_PER_IP_PER_HOUR;
}

/** One-way hash of the client IP so we can rate-limit without storing the IP itself. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const escapeMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => escapeMap[c]);
}

/** Plain email body sent to the owner when a lead arrives. All user input is escaped. */
export function leadEmailHtml(lead: LeadInput): string {
  const rows: [string, string][] = [
    ["Nombre", lead.name],
    ["Correo", lead.email],
    ["Teléfono", lead.phone || "—"],
    ["Empresa", lead.company || "—"],
    ["Propiedades", String(lead.properties)],
    ["Plan", lead.plan],
    ["Idioma", lead.locale],
    ["Origen", [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ") || "—"],
    ["Mensaje", lead.message || "—"],
  ];
  return `<div style="font-family:Arial,sans-serif;color:#0f172a">
<h2 style="color:#1d4ed8;margin:0 0 12px">Nuevo lead de Renewly</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#5b6b86">${k}</td><td>${escapeHtml(v).replace(/\n/g, "<br>")}</td></tr>`)
    .join("")}</table></div>`;
}
