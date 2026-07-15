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
  title: "Axla — Your AI agent for adulting",
  description:
    "Stop doing your BIR taxes. Axla files your 2551Q + 1701Q in minutes. No CPA, no pila, no stress. Join the waitlist for 3 months free.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/axla-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Axla — Your AI agent for adulting",
    description:
      "Stop doing your BIR taxes. Axla files your 2551Q + 1701Q in minutes. No CPA, no pila, no stress.",
    url: siteUrl,
    siteName: "Axla",
    images: [{ url: "/axla-app-icon.png", width: 720, height: 720 }],
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
