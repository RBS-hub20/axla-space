function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/5 ${className ?? ""}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-8 w-40" />
            </div>
            <Skeleton className="h-28 w-28 rounded-full sm:h-32 sm:w-32" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-28" />
              <Skeleton className="mt-4 h-9 w-full" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm lg:col-span-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-64 w-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-4 h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
