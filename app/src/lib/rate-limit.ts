import { sql } from "drizzle-orm";
import { lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

/**
 * Fixed-window, DB-backed rate limiter. A single atomic upsert increments
 * the counter for `${scope}:${identifier}` within the current window, so
 * concurrent serverless instances can't race past the limit the way an
 * in-memory counter would. Fail-open on DB errors: a broken limiter should
 * degrade to "no limiting", not take checkout down with it.
 */
export async function isRateLimited(
  scope: string,
  identifier: string,
  max: number,
  windowSecs: number
): Promise<boolean> {
  const windowIndex = Math.floor(Date.now() / 1000 / windowSecs);
  const key = `${scope}:${identifier}:${windowIndex}`;
  const windowEndsAt = new Date((windowIndex + 1) * windowSecs * 1000);

  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, windowEndsAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning();

    // First hit in a fresh window doubles as the cleanup trigger for rows
    // whose window has passed - keeps the table from growing unboundedly
    // without needing a scheduler, at one extra statement per window.
    if (row.count === 1) {
      db.delete(rateLimits).where(lt(rateLimits.windowEndsAt, new Date())).catch(() => {});
    }

    return row.count > max;
  } catch {
    return false;
  }
}

/** Best-effort caller IP. Vercel sets x-forwarded-for; first hop is the client. */
export function requestIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function rateLimitedResponse(headers?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { message: "rate limit exceeded, retry shortly" },
    { status: 429, headers }
  );
}
