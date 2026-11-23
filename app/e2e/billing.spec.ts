import { expect, test, type Page } from "@playwright/test";

// Manual billing end to end: plan → invoice with reference → PDF → proof → platform approval → receipt,
// plan limit, and suspension making the account read only. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (local stack) to promote the operator account to platform admin.
const run = Date.now().toString(36);
const SB = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.E2E_SERVICE_ROLE_KEY ?? "";

async function signUp(page: Page, name: string, org?: string) {
  const email = `${name.toLowerCase().replace(/\W/g, "")}.${run}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Nombre completo").fill(name);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("correct-horse-8");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/onboarding/);
  if (org) {
    await page.getByLabel("Nombre de la organización").fill(org);
    await page.getByRole("button", { name: "Crear organización" }).click();
    await page.waitForURL(/\/dashboard/);
    await page.getByRole("dialog").getByRole("button", { name: "Saltar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  return email;
}

async function makePlatformAdmin(email: string) {
  const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };
  const users = await (await fetch(`${SB}/auth/v1/admin/users?per_page=1000`, { headers: h })).json();
  const id = users.users.find((u: { email: string }) => u.email === email).id;
  const r = await fetch(`${SB}/rest/v1/platform_admins`, { method: "POST", headers: h, body: JSON.stringify({ user_id: id }) });
  expect(r.ok).toBe(true);
}

test("manual billing: choose plan, pay, approve, limits and suspension", async ({ browser }) => {
  test.skip(!SERVICE, "E2E_SERVICE_ROLE_KEY not set");
  const owner = await (await browser.newContext()).newPage();
  await signUp(owner, "Bea Billing", `Bay Billing ${run}`);

  // Trial, no plan yet.
  await owner.goto("/billing");
  await expect(owner.getByTestId("sub-status")).toHaveText("Prueba gratis");
  await expect(owner.getByText("0 de 25")).toBeVisible();

  // Per-property plan for 1 property → invoice with a unique reference and bank instructions.
  const perProperty = owner.locator("form", { hasText: "Por propiedad" });
  await perProperty.getByLabel("Propiedades a pagar").fill("1");
  await perProperty.getByRole("button", { name: "Elegir este plan" }).click();
  await expect(owner.getByText("Guardado.")).toBeVisible();
  const reference = (await owner.getByTestId("pay-reference").textContent())!.trim();
  expect(reference).toMatch(/^RNW-[0-9A-F]{4}-[0-9A-F]{4}$/);
  await expect(owner.getByTestId("pay-box")).toContainText("US$39.00");
  await expect(owner.getByText("0 de 1")).toBeVisible();

  // Invoice PDF.
  const pdfHref = await owner.getByRole("link", { name: "Descargar PDF" }).first().getAttribute("href");
  const pdf = await owner.request.get(pdfHref!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Plan limit: 1 paid property → the second one is refused by the database.
  await owner.goto("/properties");
  await owner.getByLabel("Nombre", { exact: true }).fill(`Only Villa ${run}`);
  await owner.getByRole("button", { name: "Crear propiedad" }).click();
  await expect(owner.getByRole("heading", { name: `Only Villa ${run}` })).toBeVisible();
  await owner.goto("/properties");
  await owner.getByLabel("Nombre", { exact: true }).fill(`Second Villa ${run}`);
  await owner.getByRole("button", { name: "Crear propiedad" }).click();
  await expect(owner.getByText("Llegaste al límite de propiedades de tu plan")).toBeVisible();

  // Proof of payment.
  await owner.goto("/billing");
  await owner.getByLabel("Subir comprobante").setInputFiles({ name: "transfer.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 proof") });
  await owner.getByLabel("Nota (opcional)").fill("FirstCaribbean transfer");
  await owner.getByRole("button", { name: "Subir comprobante", exact: true }).click();
  await expect(owner.getByText("Comprobante recibido. Te avisamos")).toBeVisible();
  await expect(owner.getByTestId("pay-box")).toContainText("En revisión");

  // The customer cannot open the platform page.
  const notFound = await owner.goto("/platform");
  expect(notFound?.status()).toBe(404);

  // Operator approves.
  const ops = await (await browser.newContext()).newPage();
  const opsEmail = await signUp(ops, "Pat Platform", `Renewly Ops ${run}`);
  await makePlatformAdmin(opsEmail);
  await ops.goto("/platform");
  const row = ops.getByTestId("proof-row").filter({ hasText: reference });
  await expect(row).toContainText(`Bay Billing ${run}`);
  const proofHref = await row.getByRole("link", { name: /Ver comprobante/ }).getAttribute("href");
  const proof = await ops.request.get(proofHref!, { maxRedirects: 0 });
  expect(proof.status()).toBe(307);
  expect(proof.headers()["location"]).toContain("/storage/v1/object/sign/billing/");
  await row.getByLabel("Referencia bancaria (opcional)").fill("FCIB-123");
  await row.getByRole("button", { name: "Aprobar pago" }).click();
  await expect(ops.getByText("Guardado.")).toBeVisible();
  await expect(ops.getByTestId("proof-row").filter({ hasText: reference })).toHaveCount(0);

  // The customer sees the invoice paid and gets a receipt.
  await owner.goto("/billing");
  await expect(owner.getByTestId("pay-box")).toHaveCount(0);
  await expect(owner.getByRole("link", { name: "Recibo" })).toBeVisible();
  await expect(owner.getByText(/Pagado hasta el/)).toBeVisible();

  // Suspension: read only, with a banner; reactivation restores writes.
  await ops.goto("/platform");
  const customer = ops.locator("tr", { hasText: `Bay Billing ${run}` });
  ops.once("dialog", (d) => d.accept());
  await customer.getByRole("button", { name: "Suspender" }).click();
  await expect(ops.getByText("Guardado.")).toBeVisible();

  await owner.goto("/dashboard");
  await expect(owner.getByTestId("billing-banner")).toContainText("Cuenta suspendida");
  await owner.getByRole("link", { name: "Villa Sandcastle" }).click();
  await owner.getByRole("button", { name: "Licencia vigente publicada en la propiedad" }).click();
  await expect(owner.getByText("La cuenta está suspendida")).toBeVisible();

  await ops.goto("/platform");
  await ops.locator("tr", { hasText: `Bay Billing ${run}` }).getByRole("button", { name: "Reactivar" }).click();
  await expect(ops.getByText("Guardado.")).toBeVisible();
  await owner.goto("/dashboard");
  await expect(owner.getByTestId("billing-banner")).toHaveCount(0);
});
