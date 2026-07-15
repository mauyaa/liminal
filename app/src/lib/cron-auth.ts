import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Gates an autonomous poll endpoint behind `CRON_SECRET`, matching Vercel
 * Cron's own documented convention (it sends `Authorization: Bearer
 * $CRON_SECRET` automatically when the env var is set). Left open if
 * `CRON_SECRET` isn't configured, for local development convenience - set
 * it before exposing these endpoints publicly.
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  // Constant-time comparison: a plain !== leaks how many leading bytes
  // matched via response timing. timingSafeEqual requires equal-length
  // buffers, so a length mismatch (the common case - wrong/no header) is
  // rejected outright before it would throw.
  const authorized = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!authorized) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }
  return null;
}
