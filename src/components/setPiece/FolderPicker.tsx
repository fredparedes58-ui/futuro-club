/**
 * VITAS · FolderPicker — Dropdown to add/remove an item from folders
 *
 * Used on event cards and recommendation cards.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Folder as FolderIcon, Plus, Check, X, ExternalLink } from "lucide-react";
import {
  SetPieceFolderStorage,
  type Folder,
  type FolderItemType,
  FOLDER_COLORS,
  FOLDER_ICONS,
} from "@/services/real/setPieceFolderStorage";
import { toast } from "sonner";

interface FolderPickerProps {
  itemId: string;
  itemType: FolderItemType;
  onChange?: () => void;
}

export default function FolderPicker({ itemId, itemType, onChange }: FolderPickerProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState(FOLDER_ICONS[0]);
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setFolders(SetPieceFolderStorage.getAll());
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggleFolder = (folderId: string) => {
    if (SetPieceFolderStorage.isInFolder(folderId, itemId, itemType)) {
      SetPieceFolderStorage.removeItem(folderId, itemId, itemType);
      toast.success("Eliminado de la carpeta");
    } else {
      SetPieceFolderStorage.addItem(folderId, itemId, itemType);
      toast.success("Añadido a la carpeta");
    }
    setFolders(SetPieceFolderStorage.getAll());
    onChange?.();
  };

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("Escribe un nombre para la carpeta");
      return;
    }
    const folder = SetPieceFolderStorage.create(newName.trim(), newColor, newIcon);
    SetPieceFolderStorage.addItem(folder.id, itemId, itemType);
    toast.success(`Carpeta "${folder.name}" creada y añadida`);
    setNewName("");
    setNewIcon(FOLDER_ICONS[0]);
    setNewColor(FOLDER_COLORS[0]);
    setCreating(false);
    setFolders(SetPieceFolderStorage.getAll());
    onChange?.();
  };

  const itemFolders = SetPieceFolderStorage.getFoldersForItem(itemId, itemType);
  const inFolderCount = itemFolders.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
          inFolderCount > 0
            ? "bg-primary/15 text-primary border border-primary/30"
            : "bg-secondary text-muted-foreground hover:text-foreground border border-transparent"
        }`}
        title={
          inFolderCount > 0
            ? `En ${inFolderCount} carpeta${inFolderCount > 1 ? "s" : ""}`
            : "Añadir a carpeta"
        }
      >
        <FolderIcon size={11} />
        {inFolderCount > 0 ? `${inFolderCount} carpeta${inFolderCount > 1 ? "s" : ""}` : "Carpeta"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 z-50 w-64 glass-strong rounded-xl border border-border shadow-xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-border mb-1">
              <h4 className="text-[11px] font-display font-bold text-foreground">
                Guardar en carpeta
              </h4>
              <button
                onClick={() => {
                  setOpen(false);
                  setCreating(false);
                }}
                className="p-0.5 rounded-md text-muted-foreground hover:bg-secondary"
              >
                <X size={12} />
              </button>
            </div>

            {/* List */}
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {folders.length === 0 && !creating && (
                <p className="text-[10px] text-muted-foreground text-center py-3 px-2">
                  Aún no tienes carpetas. Crea la primera abajo.
                </p>
              )}
              {folders.map((f) => {
                const checked = SetPieceFolderStorage.isInFolder(f.id, itemId, itemType);
                return (
                  <div key={f.id} className="flex items-center gap-0.5 group/row">
                    <button
                      onClick={() => toggleFolder(f.id)}
                      className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] hover:bg-secondary text-left transition-colors"
                    >
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[12px] shrink-0"
                        style={{ background: `${f.color}25`, border: `1px solid ${f.color}55` }}
                      >
                        {f.icon}
                      </span>
                      <span className="flex-1 truncate font-medium text-foreground">{f.name}</span>
                      {checked && <Check size={13} className="text-primary shrink-0" />}
                    </button>
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate(`/set-pieces/folder/${f.id}`);
                      }}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary opacity-0 group-hover/row:opacity-100 transition-all"
                      title="Abrir carpeta"
                    >
                      <ExternalLink size={11} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Create new */}
            <div className="pt-1 mt-1 border-t border-border">
              {creating ? (
                <div className="p-2 space-y-2">
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") setCreating(false);
                    }}
                    placeholder="Nombre de la carpeta"
                    className="w-full bg-secondary/40 rounded-md px-2 py-1.5 text-[11px] border border-border focus:border-primary focus:outline-none"
                  />
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] text-muted-foreground mr-1">Icono:</span>
                    {FOLDER_ICONS.slice(0, 6).map((ic) => (
                      <button
                        key={ic}
                        onClick={() => setNewIcon(ic)}
                        className={`w-6 h-6 rounded-md text-[11px] flex items-center justify-center border transition-all ${
                          newIcon === ic
                            ? "border-primary bg-primary/15 scale-105"
                            : "border-border bg-secondary/40"
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted-foreground mr-1">Color:</span>
                    {FOLDER_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          newColor === c ? "border-foreground scale-110" : "border-border"
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCreating(false)}
                      className="flex-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:bg-secondary"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreate}
                      className="flex-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold"
                    >
                      Crear
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-primary hover:bg-primary/10 transition-colors font-semibold"
                >
                  <Plus size={12} />
                  Nueva carpeta
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
