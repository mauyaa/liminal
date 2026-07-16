import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SolanaWalletProvider } from "@/lib/solana/wallet-provider";
import { SiteHeader } from "@/components/site-chrome";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://app-eight-lovat-94.vercel.app"),
  title: "Liminal — Escrow checkout that waits for delivery",
  description: "Zero-fee stablecoin checkout. Confirm delivery to pay the seller, or refund after the deadline if delivery remains unconfirmed.",
  openGraph: {
    title: "Liminal — Checkout that waits for delivery",
    description: "USDC enters program escrow, pays on confirmation, and becomes refundable after the delivery deadline.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liminal protected checkout" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Liminal — Checkout that waits for delivery",
    description: "USDC escrow checkout with delivery confirmation and deadline refunds.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SolanaWalletProvider><SiteHeader /><div className="site-content">{children}</div><SiteFooter /></SolanaWalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
