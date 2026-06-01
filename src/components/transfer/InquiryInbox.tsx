/**
 * VITAS · InquiryInbox
 *
 * Bandeja del vendedor con todas las inquiries para un listing concreto.
 * Permite marcar como visto/aceptado/rechazado.
 */
import { Check, X, Eye, Clock, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { INQUIRY_STATUS_LABELS } from "@/lib/transfer/transferConfig";
import {
  useInquiriesForListing,
  useUpdateInquiryStatus,
} from "@/hooks/useTransferMarket";
import type { TransferInquiry } from "@/lib/transfer/transferTypes";

interface Props {
  listingId: string;
}

const STATUS_COLOR: Record<TransferInquiry["status"], string> = {
  new: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  viewed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  in_progress: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  accepted: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  declined: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function InquiryInbox({ listingId }: Props) {
  const { data: inquiries = [], isLoading } = useInquiriesForListing(listingId);
  const updateStatus = useUpdateInquiryStatus();

  if (isLoading) {
    return <div className="text-xs text-slate-400 py-6 text-center">Cargando inquiries…</div>;
  }

  if (inquiries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
        <MessageCircle className="size-6 text-slate-500 mx-auto mb-2" />
        <p className="text-xs text-slate-400">
          Aún no hay inquiries para este listing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {inquiries.map((inq, i) => (
        <motion.div
          key={inq.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-medium text-white">
                {inq.buyerName ?? "Comprador"}
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                <Clock className="size-2.5" />
                {new Date(inq.createdAt).toLocaleString("es", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <Badge variant="outline" className={cn("text-[10px]", STATUS_COLOR[inq.status])}>
              {INQUIRY_STATUS_LABELS[inq.status]}
            </Badge>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{inq.message}</p>

          {(inq.proposedPriceEur != null || inq.proposedType) && (
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {inq.proposedPriceEur != null && (
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                  Oferta: {new Intl.NumberFormat("es", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(inq.proposedPriceEur)}
                </Badge>
              )}
              {inq.proposedType && (
                <Badge variant="outline" className="text-[10px]">
                  Cambio a: {inq.proposedType}
                </Badge>
              )}
            </div>
          )}

          <div className="flex gap-1 pt-1">
            {inq.status === "new" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => updateStatus.mutate({ id: inq.id, status: "viewed", listingId })}
                className="h-7 text-xs"
              >
                <Eye className="size-3 mr-1" />
                Marcar visto
              </Button>
            )}
            {(inq.status === "new" || inq.status === "viewed") && (
              <Button
                size="sm"
                onClick={() => updateStatus.mutate({ id: inq.id, status: "accepted", listingId })}
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              >
                <Check className="size-3 mr-1" />
                Aceptar
              </Button>
            )}
            {(inq.status === "new" || inq.status === "viewed") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatus.mutate({ id: inq.id, status: "declined", listingId })}
                className="h-7 text-xs border-rose-500/30 hover:bg-rose-500/10"
              >
                <X className="size-3 mr-1" />
                Rechazar
              </Button>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
