import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { PostHogProvider } from "@/components/PostHogProvider";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = "https://axla.space";

const metaDescription = "Ask TaxLaya about 2551Q, 1701Q, BIR deadlines. Free 24/7.";

export const viewport: Viewport = {
  themeColor: "#00FF88",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Axla — Your AI agent for adulting",
  description: metaDescription,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Axla",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/axla-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Axla — Your AI agent for adulting",
    description: metaDescription,
    url: siteUrl,
    siteName: "Axla",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "en_PH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Axla — Your AI agent for adulting",
    description: metaDescription,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <PostHogProvider />
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        {children}
        <ChatWidget />
        <InstallPrompt />
      </body>
    </html>
  );
}
