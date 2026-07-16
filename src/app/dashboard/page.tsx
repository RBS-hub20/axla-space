import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">
        Welcome to TaxLaya, {user.name ?? user.email}!
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Your Tax Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-[#00FF85]" />
            <p className="text-sm text-slate-200">All clear! No pending tasks.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {/* These routes don't exist yet — placeholders for future TaxLaya features. */}
            <Link
              href="/dashboard/calculator"
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              Calculate Tax
            </Link>
            <Link
              href="/dashboard/forms"
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              File BIR Form
            </Link>
            <Link
              href="/dashboard/documents"
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              Upload Receipt
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              No activity yet. Start by calculating your tax.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
