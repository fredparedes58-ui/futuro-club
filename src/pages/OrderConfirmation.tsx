import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Minus, Plus, Trash2, Edit3, ChevronDown, Headphones, Package, Truck, CreditCard, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const steps = [
  { label: "Orden", icon: Package },
  { label: "Envío", icon: Truck },
  { label: "Pago", icon: CreditCard },
  { label: "Confirmar", icon: CheckCircle2 },
];

const OrderConfirmation = () => {
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [shippingNotes, setShippingNotes] = useState("");
  const activeStep = 3;

  const unitPrice = 149.99;
  const subtotal = unitPrice * quantity;
  const shipping = 0;
  const tax = subtotal * 0.16;
  const total = subtotal + shipping + tax;

  return (
    <div className="min-h-screen bg-[#f5f5f7] font-body">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#e5e5ea]">
        <div className="max-w-lg mx-auto flex items-center justify-between px-5 py-4">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-[#f0f0f5] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#1d1d1f]" />
          </button>
          <h1 className="text-lg font-semibold text-[#1d1d1f] tracking-tight">Confirmar Orden</h1>
          <div className="w-8" />
        </div>

        {/* Stepper */}
        <div className="max-w-lg mx-auto px-5 pb-4">
          <div className="flex items-center justify-between">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === activeStep;
              const isComplete = i < activeStep;
              return (
                <div key={step.label} className="flex flex-col items-center flex-1 relative">
                  {i > 0 && (
                    <div className={`absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2 ${isComplete || isActive ? "bg-[#34c759]" : "bg-[#d1d1d6]"}`} style={{ left: "-50%", width: "100%" }} />
                  )}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? "bg-[#34c759] text-white shadow-lg shadow-[#34c759]/30"
                        : isComplete
                        ? "bg-[#34c759] text-white"
                        : "bg-[#e5e5ea] text-[#8e8e93]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`mt-1.5 text-[10px] font-medium tracking-wide uppercase ${isActive ? "text-[#34c759]" : isComplete ? "text-[#1d1d1f]" : "text-[#8e8e93]"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-4">
        {/* Card 1: Order Items */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl shadow-sm border border-[#e5e5ea]/60 overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3">
            <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider">Productos</p>
          </div>
          <div className="px-5 pb-5">
            <div className="flex gap-4">
              <div className="w-24 h-24 bg-gradient-to-br from-[#f0f0f5] to-[#e8e8ed] rounded-xl flex items-center justify-center flex-shrink-0">
                <Headphones className="w-12 h-12 text-[#636366]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[#1d1d1f] leading-snug">
                  WH-CH720N Noise Canceling Wireless Headphones
                </h3>
                <p className="text-xs text-[#8e8e93] mt-1">Color: Negro · SKU: WH-720N-BK</p>
                <p className="text-lg font-bold text-[#1d1d1f] mt-2">${unitPrice.toFixed(2)}</p>
              </div>
            </div>

            {/* Quantity & Actions */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#f0f0f5]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 rounded-full border border-[#d1d1d6] flex items-center justify-center hover:bg-[#f0f0f5] transition-colors"
                >
                  <Minus className="w-3.5 h-3.5 text-[#636366]" />
                </button>
                <span className="text-sm font-semibold text-[#1d1d1f] w-6 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-8 h-8 rounded-full border border-[#d1d1d6] flex items-center justify-center hover:bg-[#f0f0f5] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-[#636366]" />
                </button>
              </div>
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-1.5 text-xs font-medium text-[#ff3b30] hover:text-[#ff453a] transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover
                </button>
                <button className="flex items-center gap-1.5 text-xs font-medium text-[#007aff] hover:text-[#0a84ff] transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Card 2: Contact Details */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border border-[#e5e5ea]/60 overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3">
            <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider">Detalles de Contacto</p>
          </div>
          <div className="px-5 pb-5 space-y-4">
            {/* Client Info */}
            <div>
              <p className="text-[10px] font-semibold text-[#34c759] uppercase tracking-widest mb-2">Información del Cliente</p>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-[#8e8e93]">Nombre</span>
                  <span className="text-xs font-medium text-[#1d1d1f]">Carlos Méndez Rivera</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[#8e8e93]">Teléfono</span>
                  <span className="text-xs font-medium text-[#1d1d1f]">+52 55 1234 5678</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[#8e8e93]">Email</span>
                  <span className="text-xs font-medium text-[#1d1d1f]">carlos@empresa.mx</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-[#f0f0f5]" />

            {/* Company Info */}
            <div>
              <p className="text-[10px] font-semibold text-[#34c759] uppercase tracking-widest mb-2">Información de la Empresa</p>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-[#8e8e93]">Empresa</span>
                  <span className="text-xs font-medium text-[#1d1d1f]">TechNova Solutions S.A.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[#8e8e93]">RFC</span>
                  <span className="text-xs font-medium text-[#1d1d1f]">TNS-210514-AB2</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-[#f0f0f5]" />

            {/* Shipping Notes */}
            <div>
              <p className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-widest mb-2">Notas de Envío</p>
              <textarea
                value={shippingNotes}
                onChange={(e) => setShippingNotes(e.target.value)}
                placeholder="Agregue instrucciones adicionales..."
                className="w-full h-20 px-3.5 py-3 text-xs text-[#1d1d1f] bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl resize-none placeholder:text-[#c7c7cc] focus:outline-none focus:ring-2 focus:ring-[#34c759]/30 focus:border-[#34c759] transition-all"
              />
            </div>
          </div>
        </motion.div>

        {/* Card 3: Order Summary */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl shadow-sm border border-[#e5e5ea]/60 overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3">
            <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider">Resumen de la Orden</p>
          </div>
          <div className="px-5 pb-5">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#636366]">Subtotal</span>
                <span className="text-sm font-medium text-[#1d1d1f]">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#636366]">Envío</span>
                <button className="flex items-center gap-1 text-sm font-medium text-[#007aff] hover:text-[#0a84ff] transition-colors">
                  {shipping === 0 ? "Seleccionar" : `$${shipping.toFixed(2)}`}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#636366]">Impuestos (IVA 16%)</span>
                <span className="text-sm font-medium text-[#1d1d1f]">${tax.toFixed(2)}</span>
              </div>

              <div className="h-px bg-[#e5e5ea] my-1" />

              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-[#1d1d1f]">Total General</span>
                <span className="text-xl font-bold text-[#34c759]">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Links */}
            <div className="mt-4 pt-3 border-t border-[#f0f0f5] flex flex-col gap-2">
              <button className="text-xs font-medium text-[#007aff] hover:text-[#0a84ff] text-left transition-colors">
                Ver más opciones de pago →
              </button>
              <button className="text-xs font-medium text-[#007aff] hover:text-[#0a84ff] text-left transition-colors">
                Ver más opciones de envío →
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-[#e5e5ea]">
        <div className="max-w-lg mx-auto px-5 py-4">
          <motion.button
            whileTap={{ scale: 0.98 }}
            className="w-full h-[52px] bg-[#34c759] hover:bg-[#30d158] text-white font-semibold text-base rounded-2xl shadow-lg shadow-[#34c759]/25 transition-colors"
          >
            Siguiente
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
