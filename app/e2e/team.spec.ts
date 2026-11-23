import { expect, test, type Page } from "@playwright/test";

const run = Date.now().toString(36);
const owner = { name: "Olivia Owner", email: `olivia.${run}@example.com`, password: "correct-horse-1" };
const operator = { name: "Omar Ops", email: `omar.${run}@example.com`, password: "correct-horse-2" };
const outsider = { name: "Xavier", email: `xavier.${run}@example.com`, password: "correct-horse-3" };

async function signUp(page: Page, u: typeof owner, next?: string) {
  await page.goto(next ? `/signup?next=${encodeURIComponent(next)}` : "/signup");
  await page.getByLabel("Nombre completo").fill(u.name);
  await page.getByLabel("Correo").fill(u.email);
  await page.getByLabel("Contraseña").fill(u.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/signup"));
}

test("owner creates an organisation, invites an operator who joins with limited rights", async ({ browser }) => {
  // 1. Owner signs up and creates the organisation.
  const a = await (await browser.newContext()).newPage();
  await signUp(a, owner);
  await expect(a).toHaveURL(/\/onboarding/);
  await a.getByLabel("Nombre de la organización").fill(`Island Villas ${run}`);
  await a.getByRole("button", { name: "Crear organización" }).click();
  await expect(a).toHaveURL(/\/dashboard/);
  await a.getByRole("dialog").getByRole("button", { name: "Saltar" }).click();
  await expect(a.getByRole("dialog")).toHaveCount(0);
  await expect(a.getByText(`Island Villas ${run}`, { exact: true })).toBeVisible();
  await expect(a.getByText("Tu rol: Propietario")).toBeVisible();

  // 2. Owner invites an operator. Email is not configured locally, so the link is shown once.
  await a.goto("/team");
  await a.getByLabel("Correo").fill(operator.email);
  await a.getByLabel("Rol").last().selectOption("operator");
  await a.getByRole("button", { name: "Enviar invitación" }).click();
  const link = await a.getByLabel("link").inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);
  await expect(a.getByText(operator.email)).toBeVisible();
  expect(a.url()).not.toContain(link.split("/").pop()!); // the token never appears in the page URL

  // 3. Another account cannot use that link.
  const x = await (await browser.newContext()).newPage();
  await signUp(x, outsider);
  await x.goto(new URL(link).pathname);
  await x.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(x.getByText("Esta invitación es para otro correo")).toBeVisible();

  // 4. The invitee opens the link, creates an account and accepts.
  const b = await (await browser.newContext()).newPage();
  await b.goto(new URL(link).pathname);
  await b.getByRole("link", { name: "Crear cuenta" }).click();
  await b.getByLabel("Nombre completo").fill(operator.name);
  await b.getByLabel("Correo").fill(operator.email);
  await b.getByLabel("Contraseña").fill(operator.password);
  await b.getByRole("checkbox").check();
  await b.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(b.getByText(`Te invitaron a Island Villas ${run}`)).toBeVisible();
  await b.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(b).toHaveURL(/\/dashboard/);
  await b.getByRole("dialog").getByRole("button", { name: "Saltar" }).click();
  await expect(b.getByRole("dialog")).toHaveCount(0);
  await expect(b.getByText("Tu rol: Operador")).toBeVisible();

  // 5. The operator sees the team but cannot invite or manage it, nor read the activity log.
  await b.goto("/team");
  await expect(b.getByText(owner.email)).toBeVisible();
  await expect(b.getByRole("button", { name: "Enviar invitación" })).toHaveCount(0);
  await b.goto("/settings");
  await expect(b.getByText("Actividad reciente")).toHaveCount(0);

  // 6. The owner sees the new member and the audit trail, and changes the role to read-only.
  await a.goto("/team");
  const row = a.locator("li", { hasText: operator.email });
  await row.getByRole("combobox").selectOption("viewer");
  await row.getByRole("button", { name: "Guardar" }).click();
  await expect(a.getByText("Rol actualizado.")).toBeVisible();
  await a.goto("/settings");
  await expect(a.getByText("se unió")).toBeVisible();
  await expect(a.getByText("cambió un rol")).toBeVisible();

  // 7. The outsider sees nothing of Island Villas.
  await x.goto("/dashboard");
  await expect(x).toHaveURL(/\/onboarding/);
});

test("private pages need a session and login keeps the target page", async ({ page }) => {
  const u = { name: "Lena Login", email: `lena.${Date.now().toString(36)}@example.com`, password: "correct-horse-4" };
  await signUp(page, u);
  await page.context().clearCookies();
  await page.goto("/team");
  await expect(page).toHaveURL(/\/login\?next=%2Fteam/);
  await page.getByLabel("Correo").first().fill(u.email);
  await page.getByLabel("Contraseña").fill("wrong-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  await page.getByLabel("Correo").first().fill(u.email);
  await page.getByLabel("Contraseña").fill(u.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // No organisation yet: the private page sends the user to onboarding first.
  await expect(page).toHaveURL(/\/onboarding/);
});

test("open redirect is blocked", async ({ page }) => {
  await page.goto("/lang?to=en&next=https://evil.example");
  expect(new URL(page.url()).host).toBe("localhost:3200");
});
