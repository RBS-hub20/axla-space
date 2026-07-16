import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[#001A29]">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header userName={user.name ?? user.email} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
