import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SolanaWalletProvider } from "@/lib/solana/wallet-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Liminal — Conditional stablecoin payments",
  description:
    "Programmable escrow infrastructure for stablecoin commerce: lock funds, verify completion, and automatically release or refund — through one API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SolanaWalletProvider>
          {children}
          <footer className="flex justify-center px-6 pb-6">
            <p className="text-[11px] tracking-wide text-muted">
              DEVNET — test money. Nothing here is real value.
            </p>
          </footer>
        </SolanaWalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
