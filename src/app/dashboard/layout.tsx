import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { NewFeaturesModal } from "@/components/dashboard/NewFeaturesModal";
import { NewFeaturesBanner } from "@/components/dashboard/NewFeaturesBanner";
import { TeamProvider } from "@/contexts/TeamContext";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const showAdminNav = await isAdmin();

  return (
    <TeamProvider>
      <div className="flex min-h-screen bg-[#001A29]">
        <Sidebar isAdmin={showAdminNav} />
        <div className="flex min-h-screen flex-1 flex-col">
          <NewFeaturesBanner />
          <Header userName={user.name ?? user.email} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
        <NewFeaturesModal />
      </div>
    </TeamProvider>
  );
}
