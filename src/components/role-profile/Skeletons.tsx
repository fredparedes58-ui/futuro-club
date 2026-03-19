import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function PlayerHeaderSkeleton() {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-border">
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-12 w-36" />
        <Skeleton className="h-12 w-36" />
      </div>
    </div>
  );
}

export function IdentityCardSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-8 w-24 rounded-md" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CapabilityCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-8 w-14" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="space-y-2 pt-2">
              {[...Array(3)].map((_, j) => (
                <Skeleton key={j} className="h-3 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PositionFitSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-1">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="h-4 w-5" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AuditTableSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <Skeleton className="h-8 w-full" />
      {[...Array(8)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
