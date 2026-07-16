"use client";

/**
 * Shared dashboard primitives. Design decisions (docs/ux-copy-guide.md +
 * the grouping/denoising principles):
 * - Labels above inputs, never placeholder-as-label - placeholders show
 *   examples only.
 * - Spacing encodes relationships: tight inside a field (4px), medium
 *   between fields in a section (16px), wide between sections (32px).
 * - Status is a colored dot + quiet text, not a loud pill - the amber
 *   "needs action" dot is the one deliberate accent in any list.
 */

export const inputBase =
  "h-10 w-full rounded-md border border-border bg-transparent px-3 text-sm outline-none transition-colors focus:border-foreground/40";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-4 text-muted">{hint}</span>}
    </label>
  );
}

export function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

const STATUS_STYLES: Record<string, { label: string; dot: string }> = {
  INITIALIZED: { label: "Live", dot: "bg-foreground/30" },
  FUNDED: { label: "Paid — deliver", dot: "bg-amber-500" },
  SETTLED: { label: "Paid out", dot: "bg-emerald-500" },
  REFUNDED: { label: "Refunded", dot: "bg-foreground/30" },
};

export function StatusChip({ status }: { status: string | null | undefined }) {
  const s = STATUS_STYLES[status ?? ""] ?? { label: status ?? "Unknown", dot: "bg-foreground/30" };
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <p className="max-w-xs text-sm leading-6 text-muted">{message}</p>
      {action}
    </div>
  );
}
