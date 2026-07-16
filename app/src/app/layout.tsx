import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SolanaWalletProvider } from "@/lib/solana/wallet-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Liminal Protocol",
  description: "Headless, zero-fee peer-to-peer escrow checkout on Solana.",
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
      </body>
    </html>
  );
}
