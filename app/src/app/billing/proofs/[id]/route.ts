import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opens a payment proof through a 2-minute signed URL. RLS (table and storage) decides who may see it.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: proof } = await supabase.from("payment_proofs").select("storage_path").eq("id", id).maybeSingle();
  if (!proof) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabase.storage.from("billing").createSignedUrl(proof.storage_path, 120);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
