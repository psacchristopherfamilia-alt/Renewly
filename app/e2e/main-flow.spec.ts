import { expect, test, type Page } from "@playwright/test";

// Phase 3 main flow: sample portfolio, tour, dashboard, checklist, documents, import, roles.
const run = Date.now().toString(36);

async function signUpWithOrg(page: Page, who: string, org: string) {
  await page.goto("/signup");
  await page.getByLabel("Nombre completo").fill(who);
  await page.getByLabel("Correo").fill(`${who.toLowerCase().replace(/\W/g, "")}.${run}@example.com`);
  await page.getByLabel("Contraseña").fill("correct-horse-7");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Nombre de la organización").fill(org);
  await page.getByRole("button", { name: "Crear organización" }).click();
  await page.waitForURL(/\/dashboard/);
}

test("owner: tour, sample dashboard, checklist, documents, import and clearing the sample", async ({ page }) => {
  await signUpWithOrg(page, "Paula Owner", `Palm Villas ${run}`);

  // Tour on the first visit, 4 steps, then it stays closed.
  const tour = page.getByRole("dialog");
  await expect(tour.getByText("1 / 4")).toBeVisible();
  for (let i = 0; i < 3; i++) await tour.getByRole("button", { name: "Siguiente" }).click();
  await tour.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Sample portfolio from the prototype, sorted by deadline, with KPIs.
  await expect(page.getByText("Estás viendo un portafolio de ejemplo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Villa Sandcastle" })).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(6);
  await expect(rows.last()).toContainText("Blue Hills Bistro"); // business licence: furthest deadline
  await page.getByRole("link", { name: /^Urgente/ }).click();
  await expect(page).toHaveURL(/f=bad/);

  // Checklist: tick an item, add a note, upload a document attached to it.
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Ocean Club West 4B" }).click();
  await expect(page.getByText("5 pendientes")).toBeVisible();
  await page.getByRole("button", { name: "Inspección del Departamento de Turismo aprobada" }).click();
  await expect(page.getByText("4 pendientes")).toBeVisible();
  await expect(page.locator("li", { hasText: "Inspección del Departamento de Turismo aprobada" }).getByText("Marcado por Paula Owner")).toBeVisible();
  const item = page.locator("li", { hasText: "Señalización de seguridad de piscina" });
  await item.getByPlaceholder("Nota (opcional)").fill("Letrero nuevo pedido");
  await item.getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.locator("li", { hasText: "Señalización de seguridad de piscina" }).getByPlaceholder("Nota (opcional)")).toHaveValue("Letrero nuevo pedido");

  await page.getByLabel("Subir documento").setInputFiles({ name: "inspeccion.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 inspection") });
  await page.getByLabel("Requisito").selectOption({ label: "Inspección del Departamento de Turismo aprobada" });
  await page.getByRole("button", { name: "Subir documento", exact: true }).click();
  await expect(page.getByText("inspeccion.pdf")).toBeVisible();
  const href = await page.getByRole("link", { name: "Abrir" }).getAttribute("href");
  const open = await page.request.get(href!, { maxRedirects: 0 });
  expect(open.status()).toBe(307);
  expect(open.headers()["location"]).toContain("/storage/v1/object/sign/documents/");

  // Wrong file type is refused with a clear message.
  await page.getByLabel("Subir documento").setInputFiles({ name: "evil.html", mimeType: "text/html", buffer: Buffer.from("<script>") });
  await page.getByRole("button", { name: "Subir documento", exact: true }).click();
  await expect(page.getByText("Solo PDF o fotos")).toBeVisible();

  // Import: a bad file shows the row errors and imports nothing; a good one imports.
  await page.goto("/import");
  await page.getByLabel("Archivo CSV").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("nombre,isla,vence\nX,Atlantis,31/02/2026\n") });
  await expect(page.getByText("Fila 2: nombre")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Importar/ })).toHaveCount(0);
  const csv = "nombre,isla,zona,dueno,piscina,tipo_licencia,vence\n" +
    `Coral ${run},North Caicos,Whitby,J. Smith,si,alojamiento,31/12/2026\nReef ${run},Providenciales,Turtle Cove,R. Jones,no,comercial,\n`;
  await page.getByLabel("Archivo CSV").setInputFiles({ name: "ok.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("Vista previa")).toBeVisible();
  await page.getByRole("button", { name: "Importar 2 filas" }).click();
  await expect(page.getByText("2 filas importadas.")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(8);

  // Clearing the sample keeps the imported properties.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Borrar ejemplo" }).click();
  await expect(page.getByText("Ejemplo borrado.")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("link", { name: `Coral ${run}` })).toBeVisible();

  // New property by hand, then a licence with the official expiry.
  await page.goto("/properties");
  await page.getByLabel("Nombre", { exact: true }).fill(`Sea Breeze ${run}`);
  await page.getByLabel("Tiene piscina").check();
  await page.getByRole("button", { name: "Crear propiedad" }).click();
  await expect(page.getByRole("heading", { name: `Sea Breeze ${run}` })).toBeVisible();
  await page.getByRole("button", { name: "Agregar licencia" }).click();
  await expect(page.getByText("6 pendientes")).toBeVisible();
  await expect(page.getByText("Vence el 31 dic 2026")).toBeVisible();

  // Help page.
  await page.goto("/help");
  await expect(page.getByText("¿Renewly presenta la renovación ante el gobierno?")).toBeVisible();
});

test("an outsider cannot open another organisation's property or document", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signUpWithOrg(a, "Ann Alpha", `Alpha ${run}`);
  await a.getByRole("dialog").getByRole("button", { name: "Saltar" }).click();
  await expect(a.getByRole("dialog")).toHaveCount(0);
  await a.getByRole("link", { name: "Villa Sandcastle" }).click();
  await a.waitForURL(/\/properties\//);
  const propertyUrl = a.url();
  await a.getByLabel("Subir documento").setInputFiles({ name: "seguro.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 x") });
  await a.getByRole("button", { name: "Subir documento", exact: true }).click();
  const docHref = await a.getByRole("link", { name: "Abrir" }).getAttribute("href");

  const b = await (await browser.newContext()).newPage();
  await signUpWithOrg(b, "Ben Beta", `Beta ${run}`);
  const res = await b.goto(new URL(propertyUrl).pathname);
  expect(res?.status()).toBe(404);
  const doc = await b.request.get(docHref!);
  expect(doc.status()).toBe(404);
});
