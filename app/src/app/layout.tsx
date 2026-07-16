import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SolanaWalletProvider } from "@/lib/solana/wallet-provider";
import { SiteHeader } from "@/components/site-chrome";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app-eight-lovat-94.vercel.app"),
  title: "Liminal — Payments that wait for the work",
  description:
    "Protected stablecoin checkout: the seller gets paid when delivery is confirmed, or the buyer is refunded automatically.",
  openGraph: {
    title: "Liminal — Money moves when the work does",
    description: "Protected checkout for digital work: release on delivery or refund automatically.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liminal protected payments" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Liminal — Money moves when the work does",
    description: "Protected checkout for digital work: release on delivery or refund automatically.",
    images: ["/og.png"],
  },
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
          <SiteHeader />
          <div className="site-content">{children}</div>
          <SiteFooter />
        </SolanaWalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
