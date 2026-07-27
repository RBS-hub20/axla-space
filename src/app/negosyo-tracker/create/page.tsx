import { Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NegosyoCreateFlow } from "@/components/negosyo/NegosyoCreateFlow";

export const metadata = {
  title: "Gumawa ng Negosyo Tracker | Axla",
  description: "3-step form — branding, negosyo details, preview — then bayad ₱149 para ma-download ang iyong Sales, Tubo & Inventory tracker.",
};

export default function NegosyoTrackerCreatePage() {
  return (
    <main className="min-h-screen bg-[#0B0F1A] text-white">
      <Navbar />
      <Suspense fallback={null}>
        <NegosyoCreateFlow />
      </Suspense>
      <Footer />
    </main>
  );
}
