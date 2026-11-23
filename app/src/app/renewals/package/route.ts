import { NextResponse, type NextRequest } from "next/server";
import { loadPackage } from "@/lib/renewals/load";
import { renewalPackagePdf } from "@/lib/renewals/package";
import { getLocale } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Batch download: several renewal packages in one PDF (?id=...&id=...). Renewals the user cannot see are skipped.
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.getAll("id").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  if (ids.length === 0) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const locale = await getLocale();
  const packages = (await Promise.all(ids.map((id) => loadPackage(supabase, id, locale)))).filter((p) => p !== null);
  if (packages.length === 0) return new NextResponse("Not found", { status: 404 });
  const bytes = await renewalPackagePdf(packages);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="renewly-renovaciones.pdf"`, "cache-control": "private, no-store" },
  });
}
