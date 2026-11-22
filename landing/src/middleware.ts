import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "@/lib/site";

// Sends "/" and any path without a locale to /es or /en, based on the browser language.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return NextResponse.next();
  const accept = req.headers.get("accept-language") ?? "";
  const locale = /^\s*en\b/i.test(accept) ? "en" : DEFAULT_LOCALE;
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|brand|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|favicon.ico).*)"],
};
