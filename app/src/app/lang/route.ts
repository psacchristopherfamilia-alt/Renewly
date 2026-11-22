import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/paths";
import { LANG_COOKIE } from "@/lib/session";

// /lang?to=en&next=/team switches the interface language. Link to it with a plain <a>, never next/link:
// a prefetch of this GET would switch the language without a click.
export function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to") === "en" ? "en" : "es";
  const res = NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next"), "/dashboard"), request.nextUrl.origin));
  res.cookies.set(LANG_COOKIE, to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
