/**
 * VITAS · CreateListingPage
 * /transfer/new
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateListingForm } from "@/components/transfer/CreateListingForm";

export default function CreateListingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-cyan-400" />
            <h1 className="text-lg font-display font-bold">Publicar en el marketplace</h1>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <CreateListingForm onCreated={(id) => navigate(`/transfer/listing/${id}`)} />
      </main>
    </div>
  );
}
