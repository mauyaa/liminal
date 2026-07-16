export const inputClass =
  "h-10 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-foreground/40";

/**
 * Merchant-language status vocabulary - what each escrow state means from
 * the seller's side. See docs/ux-copy-guide.md's status table.
 */
export const MERCHANT_STATUS: Record<string, string> = {
  INITIALIZED: "Live",
  FUNDED: "Paid — deliver",
  SETTLED: "Paid out",
  REFUNDED: "Refunded",
};
