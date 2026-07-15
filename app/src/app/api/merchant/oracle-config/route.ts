import { NextRequest, NextResponse } from "next/server";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { buildUnsignedTransaction, getConnection, getProgram, oracleConfigPda } from "@/lib/solana/program";

interface OracleConfigBody {
  authorityWallet: string;
  mint: string;
  oraclePubkey: string;
}

/**
 * Returns an unsigned `initializeOracleConfig` transaction naming the pubkey
 * trusted to sign delivery attestations for `settle_order_with_oracle` on a
 * given mint's vault. One-time per mint - the on-chain `init` constraint
 * rejects a second call once set.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as OracleConfigBody | null;
  if (!body?.authorityWallet || !body?.mint || !body?.oraclePubkey) {
    return NextResponse.json(
      { message: "authorityWallet, mint, and oraclePubkey are required" },
      { status: 400 }
    );
  }

  let authority: PublicKey;
  let mint: PublicKey;
  let oraclePubkey: PublicKey;
  try {
    authority = new PublicKey(body.authorityWallet);
    mint = new PublicKey(body.mint);
    oraclePubkey = new PublicKey(body.oraclePubkey);
  } catch {
    return NextResponse.json(
      { message: "authorityWallet, mint, and oraclePubkey must be base58 pubkeys" },
      { status: 400 }
    );
  }

  const connection = getConnection();
  const program = getProgram(connection);
  const oracleConfig = oracleConfigPda(program.programId, mint);

  const ix = await program.methods
    .initializeOracleConfig(oraclePubkey)
    .accountsPartial({
      authority,
      mint,
      oracleConfig,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const transaction = await buildUnsignedTransaction(connection, authority, [ix]);

  return NextResponse.json({ oracleConfigPda: oracleConfig.toBase58(), transaction });
}

/** Reads a mint's current oracle config, if any. */
export async function GET(request: NextRequest) {
  const mintParam = request.nextUrl.searchParams.get("mint");
  if (!mintParam) {
    return NextResponse.json({ message: "mint query param is required" }, { status: 400 });
  }

  let mint: PublicKey;
  try {
    mint = new PublicKey(mintParam);
  } catch {
    return NextResponse.json({ message: "mint must be a base58 pubkey" }, { status: 400 });
  }

  const connection = getConnection();
  const program = getProgram(connection);
  const oracleConfig = oracleConfigPda(program.programId, mint);

  const account = await program.account.oracleConfig.fetchNullable(oracleConfig);
  if (!account) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
    oraclePubkey: account.oraclePubkey.toBase58(),
    authority: account.authority.toBase58(),
  });
}
