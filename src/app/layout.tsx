import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = "https://axla.space";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "TaxLaya — Axla's AI tax assistant",
  description:
    "Palayain kita sa BIR hassle. Chat with TaxLaya, Axla's free AI assistant for 2551Q, 1701Q, and every other BIR form headache.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/axla-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "TaxLaya — Axla's AI tax assistant",
    description:
      "Palayain kita sa BIR hassle. Chat with TaxLaya, Axla's free AI assistant for 2551Q, 1701Q, and every other BIR form headache.",
    url: siteUrl,
    siteName: "Axla",
    images: [{ url: "/taxlaya-avatar.png", width: 720, height: 720 }],
    locale: "en_PH",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
