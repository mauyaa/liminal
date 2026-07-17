import { redirect } from "next/navigation";

// /buy/[sku] is the old checkout URL - kept working as a redirect so
// existing links (README, prior demo shares) don't 404. /pay/[sku] is the
// one real implementation.
export default async function BuyRedirect({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  redirect(`/pay/${sku}`);
}
