import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { WhyAxla } from "@/components/WhyAxla";
import { PricingTeaser } from "@/components/PricingTeaser";
import { WaitlistSection } from "@/components/WaitlistSection";
import { Footer } from "@/components/Footer";

export default function Home() {
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
