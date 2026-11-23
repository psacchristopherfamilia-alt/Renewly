import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opens a document: RLS decides whether the user may see the row; the file is served through a signed URL
// that expires in two minutes, so links copied out of the app stop working.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 120, { download: false });
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
