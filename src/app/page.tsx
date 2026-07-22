import { Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { SocialProof } from "@/components/SocialProof";
import { HowItWorks } from "@/components/HowItWorks";
import { WhyAxla } from "@/components/WhyAxla";
import { PricingTeaser } from "@/components/PricingTeaser";
import { WaitlistSection } from "@/components/WaitlistSection";
import { Footer } from "@/components/Footer";
import { ReferralTracker } from "@/components/ReferralTracker";
import { PromoCountdown } from "@/components/PromoCountdown";

export const revalidate = 60;

export default function Home() {
  return (
    <main>
      <Suspense fallback={null}>
        <ReferralTracker />
      </Suspense>
      <div className="sticky top-0 z-50">
        <PromoCountdown />
        <Navbar />
      </div>
      <Hero />
      <SocialProof />
      <HowItWorks />
      <WhyAxla />
      <PricingTeaser />
      <WaitlistSection />
      <Footer />
    </main>
  );
}
