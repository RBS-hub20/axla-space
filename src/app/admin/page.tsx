import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-session";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default function AdminPage() {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(session)) {
    redirect("/admin/login");
  }

  return <AdminDashboard />;
}
