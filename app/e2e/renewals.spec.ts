import { expect, test, type Page } from "@playwright/test";

// Assisted submission end to end: start from the property, questions build the list, documents with statuses
// (missing / expired / uploaded), submit gate, package PDF, office asks for more, approval renews the licence.
const run = Date.now().toString(36);
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 ${name}`) });

async function signUpWithOrg(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Nombre completo").fill("Rosa Renewal");
  await page.getByLabel("Correo").fill(`rosa.${run}@example.com`);
  await page.getByLabel("Contraseña").fill("correct-horse-9");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Nombre de la organización").fill(`Reef Renewals ${run}`);
  await page.getByRole("button", { name: "Crear organización" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByRole("dialog").getByRole("button", { name: "Saltar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function upload(page: Page, requirement: string, file: string, expires?: string) {
  const row = page.getByTestId("requirement").filter({ hasText: requirement });
  await row.getByLabel(`o sube uno nuevo: ${requirement}`).setInputFiles(pdf(file));
  if (expires) await row.getByLabel(`Vence (si aplica): ${requirement}`).fill(expires);
  await row.getByRole("button", { name: "Subir y adjuntar" }).click();
  await expect(page.getByTestId("requirement").filter({ hasText: requirement })).toContainText(file);
}

test("renewal: questions, documents, gate, package, office request and approval", async ({ page }) => {
  await signUpWithOrg(page);

  // Batch page lists the sample licences; start one renewal from the property page.
  await page.goto("/renewals");
  await expect(page.getByText("Lista de documentos provisional")).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Villa Sandcastle" }).click();
  await page.getByRole("button", { name: "Preparar renovación" }).click();
  await page.waitForURL(/\/renewals\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("renewal-status")).toHaveText("En preparación");

  // Villa with a pool: 5 mandatory documents, all missing → filing is blocked.
  await expect(page.getByTestId("requirement")).toHaveCount(5);
  await expect(page.getByTestId("blockers")).toContainText("Fotos o certificado de seguridad de piscina");
  await expect(page.getByTestId("blockers").getByRole("button", { name: "Registrar como presentada" })).toBeDisabled();

  // An answer adds a conditional requirement; changing it back removes it.
  await page.getByRole("group", { name: /Cambió el dueño/ }).getByLabel("Sí").check();
  await page.getByRole("button", { name: "Guardar respuestas" }).click();
  await expect(page.getByTestId("requirement")).toHaveCount(6);
  await page.getByRole("group", { name: /Cambió el dueño/ }).getByLabel("No").check();
  await page.getByRole("button", { name: "Guardar respuestas" }).click();
  await expect(page.getByTestId("requirement")).toHaveCount(5);

  // Pre-filled form data.
  await expect(page.getByLabel("Dueño")).toHaveValue("Familia Whitfield");
  await page.getByLabel("Teléfono de contacto").fill("+1 649 555 0100");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Teléfono de contacto")).toHaveValue("+1 649 555 0100");

  // Documents: an expired insurance still blocks.
  await upload(page, "Formulario de renovación firmado", "form.pdf");
  await upload(page, "Licencia de alojamiento vigente o anterior", "licence-2026.pdf");
  await upload(page, "Informe de inspección aprobado", "inspection.pdf");
  await upload(page, "Fotos o certificado de seguridad de piscina", "pool.pdf");
  await upload(page, "Póliza de seguro de responsabilidad civil vigente", "insurance-old.pdf", "2025-01-31");
  await expect(page.getByTestId("requirement").filter({ hasText: "Póliza de seguro" })).toContainText("Vencido");
  await expect(page.getByTestId("blockers")).toContainText("Póliza de seguro");
  await upload(page, "Póliza de seguro de responsabilidad civil vigente", "insurance-2027.pdf", "2027-06-30");
  await expect(page.getByTestId("blockers")).toHaveCount(0);

  // Package PDF.
  const pkg = await page.request.get(await page.getByRole("link", { name: "Descargar paquete (PDF)" }).getAttribute("href") as string);
  expect(pkg.status()).toBe(200);
  expect(pkg.headers()["content-type"]).toBe("application/pdf");

  // File on the portal and record it.
  await page.getByLabel("Número de referencia del portal").fill("TR-2026-0042");
  await page.getByLabel("Comprobante de presentación (PDF o foto)").setInputFiles(pdf("portal-receipt.pdf"));
  await page.getByRole("button", { name: "Registrar como presentada" }).click();
  await expect(page.getByTestId("renewal-status")).toHaveText("Presentada");
  await expect(page.getByText(/referencia TR-2026-0042/)).toBeVisible();

  // The office asks for one more document: it becomes a blocker until uploaded.
  await page.getByLabel("Documentos que pidió (uno por línea)").fill("Certificado de extintores");
  await page.getByRole("button", { name: "Registrar pedido" }).click();
  await expect(page.getByTestId("renewal-status")).toHaveText("La oficina pidió más");
  await expect(page.getByTestId("blockers")).toContainText("Certificado de extintores");
  await upload(page, "Certificado de extintores", "extintores.pdf");
  await page.getByLabel("Número de referencia del portal").fill("TR-2026-0042-B");
  await page.getByLabel("Comprobante de presentación (PDF o foto)").setInputFiles(pdf("portal-receipt-2.pdf"));
  await page.getByRole("button", { name: "Registrar como presentada" }).click();
  await expect(page.getByTestId("renewal-status")).toHaveText("Presentada");

  // Approval only with the new licence document and a later expiry; the licence is renewed.
  await page.getByLabel("Nuevo vencimiento").fill("2027-12-31");
  await page.getByLabel("Nuevo número (opcional)").fill("ACC-2027-9");
  await page.getByLabel("Licencia nueva emitida (PDF o foto)").setInputFiles(pdf("licence-2027.pdf"));
  await page.getByRole("button", { name: "Registrar aprobación" }).click();
  await expect(page.getByTestId("renewal-status")).toHaveText("Aprobada");
  await expect(page.getByText("Aprobada por la oficina")).toBeVisible();

  await page.goto("/dashboard");
  const row = page.locator("tbody tr", { hasText: "Villa Sandcastle" });
  await expect(row).toContainText("2 dic 2027");
});

test("batch: prepare several renewals at once and download one PDF", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signup");
  await page.getByLabel("Nombre completo").fill("Bo Batch");
  await page.getByLabel("Correo").fill(`bo.${run}@example.com`);
  await page.getByLabel("Contraseña").fill("correct-horse-9");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Nombre de la organización").fill(`Batch ${run}`);
  await page.getByRole("button", { name: "Crear organización" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByRole("dialog").getByRole("button", { name: "Saltar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/renewals");
  for (const name of ["Casa Azul", "Turtle Cove Suites", "Blue Hills Bistro"]) {
    await page.getByLabel(`Seleccionar ${name}`).check();
  }
  await page.getByRole("button", { name: "Preparar renovaciones seleccionadas" }).click();
  await expect(page.getByText("Renovaciones preparadas: 3.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir" })).toHaveCount(3);
  const href = await page.getByRole("link", { name: "Descargar paquetes (PDF)" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
