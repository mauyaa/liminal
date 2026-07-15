import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import {
  buildUnsignedTransaction,
  getConnection,
  getProgram,
  unifiedVaultPda,
  vaultTokenPda,
} from "@/lib/solana/program";

/**
 * Builds an unsigned `initialize_vault` transaction. One `UnifiedVault` must
 * exist per accepted mint before any listing can be funded against it - call
 * this once per mint (e.g. once for USDC) as the protocol authority.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.authority || !body?.mint) {
    return NextResponse.json(
      { message: "authority and mint are required" },
      { status: 400 }
    );
  }

  let authority: PublicKey;
  let mint: PublicKey;
  try {
    authority = new PublicKey(body.authority);
    mint = new PublicKey(body.mint);
  } catch {
    return NextResponse.json({ message: "authority and mint must be base58 pubkeys" }, { status: 400 });
  }

  const connection = getConnection();
  const program = getProgram(connection);
  const programId = program.programId;

  const unifiedVault = unifiedVaultPda(programId, mint);
  const tokenVault = vaultTokenPda(programId, mint);

  const ix = await program.methods
    .initializeVault()
    .accountsPartial({
      authority,
      mint,
      unifiedVault,
      tokenVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const transaction = await buildUnsignedTransaction(connection, authority, [ix]);

  return NextResponse.json({ transaction, unifiedVault: unifiedVault.toBase58(), tokenVault: tokenVault.toBase58() });
}
