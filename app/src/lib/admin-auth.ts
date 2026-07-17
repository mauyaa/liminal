import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Gates the dispute-resolution admin endpoints behind `ADMIN_SECRET`, sent
 * as `Authorization: Bearer <secret>` - same shape and same constant-time
 * comparison as `cron-auth.ts`'s `requireCronAuth`, reused rather than
 * duplicated because the risk (a bearer secret gating a sensitive endpoint)
 * is identical. Unlike the poll endpoints this is never open by default:
 * there's no dev-convenience reason to let dispute resolution run
 * unauthenticated, so a missing `ADMIN_SECRET` fails closed instead of open.
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ message: "ADMIN_SECRET is not configured on this server" }, { status: 503 });
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const authorized = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!authorized) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }
  return null;
}
