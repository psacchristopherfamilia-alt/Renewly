import type { Locale } from "@/lib/site";

// Draft legal texts. They must be reviewed by a lawyer before the public launch.
// Entity name and contact email come from environment variables so they can be set per deployment.
const ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY || "Renewly";
const EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@renewly.example";
const UPDATED = "2026-11-22";

type Doc = { title: string; updated: string; sections: { h: string; p: string[] }[] };

export const privacy: Record<Locale, Doc> = {
  es: {
    title: "Política de privacidad",
    updated: `Última actualización: ${UPDATED}`,
    sections: [
      { h: "Quiénes somos", p: [`${ENTITY} opera Renewly, un servicio privado para seguir licencias de alojamiento y comerciales en Turks and Caicos. Contacto: ${EMAIL}.`] },
      { h: "Qué datos recogemos", p: ["Desde el formulario: nombre, correo, teléfono opcional, empresa, número de propiedades, plan de interés y mensaje.", "De forma automática: estadísticas de visitas sin cookies (páginas vistas, país aproximado, dispositivo) y una huella cifrada de tu IP para limitar envíos abusivos. No guardamos tu IP."] },
      { h: "Para qué los usamos", p: ["Para contactarte sobre el piloto, preparar tu cuenta y mejorar la página. No vendemos tus datos ni los usamos para publicidad de terceros."] },
      { h: "Con quién los compartimos", p: ["Solo con proveedores que nos prestan servicio: alojamiento de base de datos (Supabase), envío de correo (Resend) y alojamiento web y analítica (Vercel). Pueden procesar datos fuera de TCI con garantías contractuales."] },
      { h: "Cuánto tiempo", p: ["Conservamos los datos de contacto hasta 24 meses sin actividad, o menos si lo pides."] },
      { h: "Tus derechos", p: [`Puedes pedir acceso, corrección o eliminación de tus datos escribiendo a ${EMAIL}.`] },
    ],
  },
  en: {
    title: "Privacy policy",
    updated: `Last updated: ${UPDATED}`,
    sections: [
      { h: "Who we are", p: [`${ENTITY} operates Renewly, a private service to track accommodation and business licences in Turks and Caicos. Contact: ${EMAIL}.`] },
      { h: "What we collect", p: ["From the form: name, email, optional phone, company, number of properties, plan of interest and message.", "Automatically: cookie-free visit statistics (page views, approximate country, device) and a hashed fingerprint of your IP to limit abusive submissions. We do not store your IP."] },
      { h: "How we use it", p: ["To contact you about the pilot, set up your account and improve the page. We do not sell your data or use it for third-party advertising."] },
      { h: "Who we share it with", p: ["Only with service providers: database hosting (Supabase), email delivery (Resend) and web hosting and analytics (Vercel). They may process data outside TCI under contractual safeguards."] },
      { h: "How long", p: ["We keep contact details for up to 24 months of inactivity, or less if you ask."] },
      { h: "Your rights", p: [`You can request access, correction or deletion of your data by writing to ${EMAIL}.`] },
    ],
  },
};

export const terms: Record<Locale, Doc> = {
  es: {
    title: "Términos del servicio",
    updated: `Última actualización: ${UPDATED}`,
    sections: [
      { h: "El servicio", p: ["Renewly ayuda a organizar fechas, checklists y documentos de licencias, y a preparar formularios de renovación. No presenta trámites ante el gobierno en tu nombre ni garantiza que una licencia sea aprobada."] },
      { h: "Información de referencia", p: ["Las fechas, tasas y requisitos que mostramos provienen de publicaciones oficiales y pueden cambiar. Eres responsable de confirmarlos con el departamento correspondiente y de cumplir la normativa."] },
      { h: "Piloto y precios", p: ["Los precios publicados son estimaciones de lanzamiento. Antes de cobrar te enviaremos una factura con el precio final; puedes no continuar sin costo al terminar la prueba."] },
      { h: "Pagos", p: ["Por ahora el cobro es manual (transferencia, depósito, efectivo o cheque). La suscripción se activa al confirmar el pago y puede suspenderse si una factura vence sin pago tras el período de gracia."] },
      { h: "Responsabilidad", p: ["En la medida que permita la ley, Renewly no responde por multas, sanciones o pérdidas derivadas de plazos o requisitos incumplidos."] },
      { h: "No afiliación", p: ["Renewly es un servicio privado, no afiliado al Gobierno de las Islas Turcas y Caicos."] },
    ],
  },
  en: {
    title: "Terms of service",
    updated: `Last updated: ${UPDATED}`,
    sections: [
      { h: "The service", p: ["Renewly helps organise licence dates, checklists and documents, and prepare renewal forms. It does not file anything with the government on your behalf and does not guarantee that a licence will be approved."] },
      { h: "Reference information", p: ["The dates, fees and requirements we show come from official publications and may change. You are responsible for confirming them with the relevant department and for complying with the regulations."] },
      { h: "Pilot and pricing", p: ["Published prices are launch estimates. Before charging, we will send you an invoice with the final price; you may stop at no cost when the trial ends."] },
      { h: "Payments", p: ["For now billing is manual (transfer, deposit, cash or cheque). Your subscription is activated once payment is confirmed and may be suspended if an invoice remains unpaid after the grace period."] },
      { h: "Liability", p: ["To the extent permitted by law, Renewly is not liable for fines, penalties or losses arising from missed deadlines or requirements."] },
      { h: "No affiliation", p: ["Renewly is a private service, not affiliated with the Government of the Turks and Caicos Islands."] },
    ],
  },
};

export type LegalDoc = Doc;
