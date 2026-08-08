import { Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { SocialProof } from "@/components/SocialProof";
import { HowItWorks } from "@/components/HowItWorks";
import { IntegrationsGrid } from "@/components/IntegrationsGrid";
import { WhyAxla } from "@/components/WhyAxla";
import { PricingTeaser } from "@/components/PricingTeaser";
import { FinalCta } from "@/components/FinalCta";
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
      <IntegrationsGrid />
      <WhyAxla />
      <PricingTeaser />
      <FinalCta />
      <Footer />
    </main>
  );
}
