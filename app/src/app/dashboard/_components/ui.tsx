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
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-foreground/40";

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
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold tracking-[.02em]">{label}</span>
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
    <fieldset className="flex flex-col gap-4 rounded-2xl bg-foreground/[.035] p-5">
      <legend className="px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

const STATUS_STYLES: Record<string, { label: string; dot: string }> = {
  INITIALIZED: { label: "Live", dot: "bg-foreground/30" },
  FUNDED: { label: "Paid — deliver", dot: "bg-amber-500" },
  DELIVERY_SIGNALED: { label: "Delivered — releasing soon", dot: "bg-amber-500" },
  DISPUTED: { label: "Under review", dot: "bg-red-500" },
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-foreground/[.02] px-6 py-14 text-center">
      <p className="max-w-xs text-sm leading-6 text-muted">{message}</p>
      {action}
    </div>
  );
}
