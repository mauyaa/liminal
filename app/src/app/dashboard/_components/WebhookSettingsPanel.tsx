"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Field, inputBase } from "./ui";

export default function WebhookSettingsPanel() {
  const { publicKey } = useWallet();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/merchant/webhook?merchantWallet=${publicKey.toBase58()}`);
      const body = await res.json();
      setWebhookUrl(body.webhookUrl ?? "");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!publicKey) return;
      setError(null);
      setSuccess(null);
      setSaving(true);
      try {
        const res = await fetch("/api/merchant/webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantWallet: publicKey.toBase58(), webhookUrl }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Failed to save webhook");
        setSuccess("Webhook URL saved. New order/subscription events will be POSTed there, signed with your webhook secret.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save webhook");
      } finally {
        setSaving(false);
      }
    },
    [publicKey, webhookUrl]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium tracking-tight">Webhook</h2>
      <p className="text-sm leading-6 text-muted">
        Get a signed POST whenever an order or subscription changes state — no polling. Every
        delivery is signed with a secret created the first time you save a URL; verify it
        server-side before trusting the payload.
      </p>
      <Field label="Endpoint URL" hint="We POST signed JSON events here on every state change.">
        <input
          type="url"
          placeholder="https://yourstore.com/webhooks/liminal"
          className={inputBase}
          value={loading ? "" : webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
        />
      </Field>
      <button
        type="submit"
        disabled={saving || loading}
        className="mt-1 inline-flex h-10 w-fit items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save webhook"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
    </form>
  );
}
