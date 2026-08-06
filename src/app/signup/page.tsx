import type { Metadata } from "next";
import { OtpAuthForm } from "@/components/auth/OtpAuthForm";

export const metadata: Metadata = {
  title: "Start Filing Free — Axla",
  description: "Create your free Axla account. No credit card required.",
};

export default function SignupPage() {
  return <OtpAuthForm mode="signup" />;
}
