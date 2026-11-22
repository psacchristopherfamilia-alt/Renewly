import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";

// Target of email links (confirm account, magic link, reset password).
export async function GET(request: NextRequest) {
  const base = process.env.APP_URL ?? request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, base));
  }
  return NextResponse.redirect(new URL("/login?error=generic", base));
}
