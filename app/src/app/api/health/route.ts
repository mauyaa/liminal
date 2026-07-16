import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import journal from "../../../../drizzle/meta/_journal.json";

export const runtime = "nodejs";

/**
 * Deployment health + schema-drift check. The migration count expected by
 * this build (from drizzle's journal, baked in at compile time) is compared
 * against what the connected database has actually applied - the exact
 * class of gap that silently broke the mobile checkout once (migration
 * 0005 deployed in code but never applied in production). Smoke tests
 * assert ok=true, so that gap now pages instead of hiding.
 */
export async function GET() {
  const expectedMigrations = journal.entries.length;

  let appliedMigrations: number | null = null;
  let dbReachable = false;
  try {
    const result = await db.run(sql`SELECT count(*) AS c FROM __drizzle_migrations`);
    appliedMigrations = Number((result.rows[0] as { c?: unknown })?.c ?? NaN);
    dbReachable = true;
  } catch {
    // Table missing or DB unreachable - both are failures below.
  }

  const migrationsOk = dbReachable && appliedMigrations === expectedMigrations;
  const ok = migrationsOk && !!process.env.SOLANA_RPC_URL;

  return NextResponse.json(
    {
      ok,
      dbReachable,
      migrations: { expected: expectedMigrations, applied: appliedMigrations, ok: migrationsOk },
      rpcConfigured: !!process.env.SOLANA_RPC_URL,
      relayerConfigured: !!process.env.RELAYER_SECRET_KEY,
      network: "devnet",
    },
    { status: ok ? 200 : 503 }
  );
}
