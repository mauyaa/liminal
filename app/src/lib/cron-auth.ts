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

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }
  return null;
}
