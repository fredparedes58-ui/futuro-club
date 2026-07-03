/**
 * VITAS · RouteSkeleton (Sprint 4.3)
 *
 * Fallback de Suspense para rutas lazy. Sustituye el spinner pelado por un
 * esqueleto con marca (header + tarjetas) que insinúa la estructura de la app
 * mientras carga el chunk — mejor percepción de velocidad.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function RouteSkeleton() {
  return (
    <div className="min-h-[70vh] px-4 pt-4 pb-24 max-w-lg mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-2 w-20" />
          </div>
        ))}
      </div>

      {/* Content cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
