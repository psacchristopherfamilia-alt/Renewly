import { NextResponse, type NextRequest } from "next/server";
import { loadPackage } from "@/lib/renewals/load";
import { renewalPackagePdf } from "@/lib/renewals/package";
import { getLocale } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// One renewal package as PDF. Every read goes through RLS as the signed-in user.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const data = await loadPackage(supabase, id, await getLocale());
  if (!data) return new NextResponse("Not found", { status: 404 });
  const bytes = await renewalPackagePdf([data]);
  const name = (data.form.property_name || "renewal").normalize("NFKD").replace(/[^\w-]+/g, "_").slice(0, 60);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="renewly-${name}.pdf"`, "cache-control": "private, no-store" },
  });
}
