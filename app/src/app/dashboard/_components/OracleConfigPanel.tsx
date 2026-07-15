"use client";

import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { inputClass } from "./shared";

interface OracleStatus {
  configured: boolean;
  oraclePubkey?: string;
  authority?: string;
}

const DEFAULT_MINT = "6VKhkPbAPs2esWsQA6BifCLyBuLzPAAuyWUK5TQ3aDQs"; // devnet demo mint

export default function OracleConfigPanel() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();

  const [mint, setMint] = useState(DEFAULT_MINT);
  const [oraclePubkey, setOraclePubkey] = useState("");
  const [status, setStatus] = useState<OracleStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!mint) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/oracle-config?mint=${mint}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to read oracle config");
      setStatus(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read oracle config");
    } finally {
      setChecking(false);
    }
  }, [mint]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!publicKey || !signTransaction) return;
      setError(null);
      setSuccess(null);
      setSubmitting(true);
      try {
        const res = await fetch("/api/merchant/oracle-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorityWallet: publicKey.toBase58(), mint, oraclePubkey }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to set oracle config");

        const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction(sig, "confirmed");

        setSuccess("Oracle config set and confirmed on-chain.");
        checkStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set oracle config");
      } finally {
        setSubmitting(false);
      }
    },
    [publicKey, signTransaction, connection, mint, oraclePubkey, checkStatus]
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium tracking-tight">Oracle settlement (advanced)</h2>
        <p className="mt-1 text-sm text-muted">
          Names a pubkey trusted to sign delivery attestations for automated settlement -
          orders settle the instant a valid signed attestation exists, no buyer confirmation
          needed. This only registers the trusted key; it doesn&apos;t create a Switchboard
          Function or any real delivery-checking logic. One-time per mint.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <input
            required
            placeholder="Mint address"
            className={`${inputClass} flex-1 font-mono text-xs`}
            value={mint}
            onChange={(e) => setMint(e.target.value)}
          />
          <button
            type="button"
            onClick={checkStatus}
            disabled={checking}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check"}
          </button>
        </div>

        {status && (
          <p className="text-sm text-muted">
            {status.configured
              ? `Configured - trusted oracle ${status.oraclePubkey?.slice(0, 4)}..${status.oraclePubkey?.slice(-4)}`
              : "Not configured for this mint yet."}
          </p>
        )}

        <input
          required
          placeholder="Trusted oracle pubkey"
          className={`${inputClass} font-mono text-xs`}
          value={oraclePubkey}
          onChange={(e) => setOraclePubkey(e.target.value)}
        />

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 inline-flex h-10 w-fit items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {submitting ? "Setting…" : "Set oracle config"}
        </button>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
      </form>
    </div>
  );
}
