import { NextResponse } from "next/server";

// Uptime check for monitoring.
export function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
