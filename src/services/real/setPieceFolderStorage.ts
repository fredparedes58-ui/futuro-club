/**
 * VITAS · Set Piece Folder Storage
 *
 * User-created folders to organize set piece events and recommendations.
 * Folders are just labels; items can belong to multiple folders.
 */

export type FolderItemType = "event" | "recommendation";

export interface Folder {
  id: string;
  name: string;
  /** Tailwind color hint (icon background) */
  color: string;
  /** Optional emoji icon */
  icon: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface FolderItem {
  folderId: string;
  itemId: string;
  itemType: FolderItemType;
  addedAt: string;
}

const FOLDERS_KEY = "vitas_setpiece_folders";
const ITEMS_KEY = "vitas_setpiece_folder_items";

export const FOLDER_COLORS = [
  "#a855f7", // purple
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
];

export const FOLDER_ICONS = ["📁", "⭐", "🎯", "📌", "🔥", "💡", "⚽", "🛡️", "📊", "📋"];

function readFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFolders(folders: Folder[]): void {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch (err) {
    console.error("[folderStorage] write folders failed", err);
  }
}

function readItems(): FolderItem[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items: FolderItem[]): void {
  try {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("[folderStorage] write items failed", err);
  }
}

function genId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const SetPieceFolderStorage = {
  // ── Folders CRUD ──────────────────────────────────────────────────
  getAll(): Folder[] {
    return readFolders().sort((a, b) =>
      (a.createdAt || "").localeCompare(b.createdAt || ""),
    );
  },

  get(folderId: string): Folder | null {
    return readFolders().find((f) => f.id === folderId) ?? null;
  },

  create(name: string, color?: string, icon?: string): Folder {
    const folder: Folder = {
      id: genId(),
      name,
      color: color ?? FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)],
      icon: icon ?? FOLDER_ICONS[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const all = readFolders();
    all.push(folder);
    writeFolders(all);
    return folder;
  },

  update(folderId: string, patch: Partial<Pick<Folder, "name" | "color" | "icon" | "notes">>): Folder | null {
    const all = readFolders();
    const idx = all.findIndex((f) => f.id === folderId);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    writeFolders(all);
    return all[idx];
  },

  delete(folderId: string): void {
    // Remove folder and all its item assignments
    writeFolders(readFolders().filter((f) => f.id !== folderId));
    writeItems(readItems().filter((it) => it.folderId !== folderId));
  },

  // ── Items in folders ──────────────────────────────────────────────
  getItems(folderId: string): FolderItem[] {
    return readItems()
      .filter((it) => it.folderId === folderId)
      .sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
  },

  /** Folders that contain a given item */
  getFoldersForItem(itemId: string, itemType: FolderItemType): Folder[] {
    const matching = readItems().filter(
      (it) => it.itemId === itemId && it.itemType === itemType,
    );
    const allFolders = readFolders();
    return matching
      .map((it) => allFolders.find((f) => f.id === it.folderId))
      .filter((f): f is Folder => !!f);
  },

  isInFolder(folderId: string, itemId: string, itemType: FolderItemType): boolean {
    return readItems().some(
      (it) =>
        it.folderId === folderId && it.itemId === itemId && it.itemType === itemType,
    );
  },

  addItem(folderId: string, itemId: string, itemType: FolderItemType): void {
    if (this.isInFolder(folderId, itemId, itemType)) return;
    const all = readItems();
    all.push({
      folderId,
      itemId,
      itemType,
      addedAt: new Date().toISOString(),
    });
    writeItems(all);
  },

  removeItem(folderId: string, itemId: string, itemType: FolderItemType): void {
    writeItems(
      readItems().filter(
        (it) =>
          !(it.folderId === folderId && it.itemId === itemId && it.itemType === itemType),
      ),
    );
  },

  /** Counts how many items per folder, optionally filtered by type */
  countByFolder(folderId: string, itemType?: FolderItemType): number {
    return readItems().filter(
      (it) =>
        it.folderId === folderId && (itemType ? it.itemType === itemType : true),
    ).length;
  },
};
