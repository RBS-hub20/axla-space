import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { WhyAxla } from "@/components/WhyAxla";
import { PricingTeaser } from "@/components/PricingTeaser";
import { WaitlistSection } from "@/components/WaitlistSection";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Join the waitlist — Axla",
  description:
    "Stop doing your BIR taxes. Axla files your 2551Q + 1701Q in minutes. No CPA, no pila, no stress. Join the waitlist for 3 months free.",
};

export default function WaitlistPage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <HowItWorks />
      <WhyAxla />
      <PricingTeaser />
      <WaitlistSection />
      <Footer />
    </main>
  );
}
