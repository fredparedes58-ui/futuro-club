import { Skeleton } from "@/components/ui/skeleton";

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="glass rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="w-3.5 h-3.5 rounded" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function MatchesSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-28 w-64 rounded-xl flex-shrink-0" />
      ))}
    </div>
  );
}

export function PlayerListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
          <Skeleton className="w-6 h-6 rounded" />
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="w-10 h-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ScoutFeedSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4">
      <Skeleton className="h-6 w-24 rounded-full" />
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="glass rounded-2xl p-5 space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Skeleton className="w-20 h-12" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

export function RankingsPodiumSkeleton() {
  return (
    <div className="flex items-end justify-center gap-3 py-4">
      {[24, 32, 20].map((h, i) => (
        <div key={i} className="flex flex-col items-center">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="h-3 w-12 mt-1" />
          <Skeleton className={`w-16 mt-2 rounded-t-lg`} style={{ height: `${h * 4}px` }} />
        </div>
      ))}
    </div>
  );
}
