// Storage permissions per role against a running Supabase (local or staging), through the real API.
// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node tests/storage/storage-rls.mjs
// Creates throwaway users and organisations; never run against production.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../app/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const run = Date.now().toString(36);
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures++; };

async function user(name) {
  const email = `${name}.${run}@example.com`, password = "correct-horse-9";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, c };
}

const [owner, operator, viewer, outsider] = await Promise.all(["owner", "operator", "viewer", "outsider"].map(user));
const { data: orgA } = await owner.c.rpc("create_organization", { p_name: `Storage A ${run}` });
const { data: orgB } = await outsider.c.rpc("create_organization", { p_name: `Storage B ${run}` });
// Memberships for the test, written with the service role (the app does this through invitations).
await admin.from("memberships").insert([
  { tenant_id: orgA, user_id: operator.id, role: "operator" },
  { tenant_id: orgA, user_id: viewer.id, role: "viewer" },
]);

const file = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
const pathA = `${orgA}/${crypto.randomUUID()}/insurance.pdf`;

let r = await operator.c.storage.from("documents").upload(pathA, file, { contentType: "application/pdf" });
check(!r.error, "operator uploads into own organisation folder");
r = await operator.c.storage.from("documents").upload(`${orgB}/${crypto.randomUUID()}/x.pdf`, file, { contentType: "application/pdf" });
check(!!r.error, "operator cannot upload into another organisation folder");
r = await operator.c.storage.from("documents").upload(`not-a-uuid/${run}.pdf`, file, { contentType: "application/pdf" });
check(!!r.error, "upload outside any organisation folder is refused");
r = await viewer.c.storage.from("documents").upload(`${orgA}/${crypto.randomUUID()}/v.pdf`, file, { contentType: "application/pdf" });
check(!!r.error, "viewer cannot upload");
r = await operator.c.storage.from("documents").upload(`${orgA}/${crypto.randomUUID()}/evil.html`, new Blob(["<script>"], { type: "text/html" }), { contentType: "text/html" });
check(!!r.error, "disallowed file type refused (html)");

r = await viewer.c.storage.from("documents").download(pathA);
check(!r.error, "viewer of the organisation can read");
r = await outsider.c.storage.from("documents").download(pathA);
check(!!r.error, "member of another organisation cannot read");
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
r = await anon.storage.from("documents").download(pathA);
check(!!r.error, "visitor without session cannot read");
const pub = await fetch(`${URL_}/storage/v1/object/public/documents/${pathA}`);
check(pub.status >= 400, "no public URL for documents");

r = await viewer.c.storage.from("documents").createSignedUrl(pathA, 60);
check(!r.error && !!r.data?.signedUrl, "member gets a short-lived signed URL");

await operator.c.storage.from("documents").remove([pathA]);
r = await viewer.c.storage.from("documents").download(pathA);
check(!r.error, "operator cannot delete (file still there)");
await owner.c.storage.from("documents").remove([pathA]);
r = await viewer.c.storage.from("documents").download(pathA);
check(!!r.error, "owner deletes");

console.log(failures ? `\n${failures} storage check(s) FAILED` : "\nStorage permissions OK");
process.exit(failures ? 1 : 0);
