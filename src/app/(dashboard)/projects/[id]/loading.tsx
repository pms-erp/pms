import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectDetailsLoading() {
  return (
    <div className="space-y-8 p-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-7 w-24" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-2xl p-6 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Info Skeleton */}
      <div className="border rounded-2xl p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </div>

      {/* Tasks Table Skeleton */}
      <div className="border rounded-2xl p-6 space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
