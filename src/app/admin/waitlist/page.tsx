import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { WaitlistAdminPanel } from "@/components/admin/WaitlistAdminPanel";

export const metadata: Metadata = {
  title: "Waitlist — Axla Admin",
  robots: { index: false, follow: false },
};

export default async function AdminWaitlistPage() {
  if (!(await isAdmin())) {
    redirect("/dashboard");
  }

  return <WaitlistAdminPanel />;
}
