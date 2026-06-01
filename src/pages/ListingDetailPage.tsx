/**
 * VITAS · ListingDetailPage
 * /transfer/listing/:id
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Euro, Send, Loader2, MessageCircle, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import {
  useListing,
  useCreateInquiry,
  useDeleteListing,
} from "@/hooks/useTransferMarket";
import { InquiryInbox } from "@/components/transfer/InquiryInbox";
import {
  LISTING_TYPE_LABELS,
  LISTING_STATUS_LABELS,
} from "@/lib/transfer/transferConfig";

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: listing, isLoading } = useListing(id);
  const createInquiry = useCreateInquiry();
  const deleteListing = useDeleteListing();

  const [buyerName, setBuyerName] = useState("");
  const [message, setMessage] = useState("");
  const [offerPrice, setOfferPrice] = useState("");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 glass-strong border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-lg font-display font-bold">Listing no encontrado</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Este listing ya no está disponible o el enlace es incorrecto.
          </p>
          <Button onClick={() => navigate("/transfer")}>Volver al marketplace</Button>
        </main>
      </div>
    );
  }

  const snap = listing.playerSnapshot ?? {};
  const priceLabel =
    listing.askingPriceEur == null
      ? "Negociable"
      : new Intl.NumberFormat("es", {
          style: "currency",
          currency: listing.currency,
          maximumFractionDigits: 0,
        }).format(listing.askingPriceEur);

  async function handleInquire() {
    if (!buyerName.trim()) {
      toast.error("Indica tu nombre o el del club.");
      return;
    }
    if (message.length < 10) {
      toast.error("El mensaje debe tener al menos 10 caracteres.");
      return;
    }
    try {
      await createInquiry.mutateAsync({
        listingId: listing!.id,
        buyerName,
        message,
        proposedPriceEur: offerPrice ? parseFloat(offerPrice) : null,
      });
      toast.success("Inquiry enviada al vendedor");
      setMessage("");
      setOfferPrice("");
    } catch (err) {
      toast.error("No se pudo enviar", {
        description: err instanceof Error ? err.message : "Error",
      });
    }
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este listing? Esta acción no se puede deshacer.")) return;
    try {
      await deleteListing.mutateAsync(listing!.id);
      toast.success("Listing eliminado");
      navigate("/transfer");
    } catch (err) {
      toast.error("No se pudo eliminar", {
        description: err instanceof Error ? err.message : "Error",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <h1 className="text-lg font-display font-bold truncate">
              {snap.name ?? "Listing"}
            </h1>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-rose-400">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Detail */}
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="size-16 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-xl font-bold text-white shrink-0 border border-white/10">
                  {(snap.name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">{snap.name ?? "Jugador"}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge variant="outline">{snap.position ?? "?"}</Badge>
                    {snap.age != null && <span className="text-xs text-slate-400">{snap.age} años</span>}
                    {snap.foot && <span className="text-xs text-slate-400">· pie {snap.foot}</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Tipo</div>
                  <div className="text-sm font-semibold text-white">
                    {LISTING_TYPE_LABELS[listing.listingType]}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Precio</div>
                  <div className="text-sm font-semibold text-white flex items-center gap-1">
                    <Euro className="size-3" />
                    {priceLabel}
                  </div>
                </div>
                {snap.vsi != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">VSI</div>
                    <div className="text-sm font-semibold text-cyan-300">{Math.round(snap.vsi)}</div>
                  </div>
                )}
                {snap.phvCategory && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">PHV</div>
                    <div className="text-sm font-semibold text-white capitalize">{snap.phvCategory}</div>
                  </div>
                )}
              </div>
            </div>

            {listing.description && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Descripción</h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {listing.description}
                </p>
              </div>
            )}

            {listing.tags.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {listing.tags.map((t) => (
                    <Badge key={t} variant="outline" className="text-[11px]">
                      #{t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Inquiry inbox for seller */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <MessageCircle className="size-3" />
                Inquiries recibidas
              </h3>
              <InquiryInbox listingId={listing.id} />
            </div>
          </section>

          {/* Sidebar: inquiry form */}
          <aside>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3 sticky top-20">
              <h3 className="text-sm font-semibold text-white">Mostrar interés</h3>
              <Input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Tu nombre o club"
                className="bg-white/[0.02] border-white/10 text-sm"
              />
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Estamos interesados en este jugador para…"
                rows={4}
                className="bg-white/[0.02] border-white/10 text-sm resize-none"
              />
              <div>
                <label className="text-[10px] text-slate-400 mb-1 block">Contraoferta (opcional, €)</label>
                <Input
                  type="number"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  placeholder={listing.askingPriceEur ? String(listing.askingPriceEur) : ""}
                  className="bg-white/[0.02] border-white/10 text-sm"
                />
              </div>
              <Button
                onClick={handleInquire}
                disabled={createInquiry.isPending}
                className="w-full"
              >
                {createInquiry.isPending ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="size-3.5 mr-1.5" />
                )}
                Enviar inquiry
              </Button>
              <p className="text-[10px] text-slate-500 text-center">
                Status del listing:{" "}
                <Badge variant="outline" className="text-[10px]">
                  {LISTING_STATUS_LABELS[listing.status]}
                </Badge>
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
