/**
 * VITAS · Event Notes Storage
 *
 * Persists user notes attached to set piece events (blog-style log).
 * Each event has its own list of notes, keyed by eventId.
 */

export interface EventNote {
  id: string;
  eventId: string;
  content: string;
  /** Optional tag for visual grouping (idea, observation, todo, warning) */
  tag?: "idea" | "observation" | "todo" | "warning" | "highlight";
  createdAt: string;
  updatedAt: string;
  /** Author name (free text — replaces with current user in real impl) */
  author?: string;
}

const STORAGE_KEY = "vitas_event_notes";

function readAll(): EventNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(notes: EventNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (err) {
    console.error("[eventNotesStorage] write failed", err);
  }
}

function genId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const EventNotesStorage = {
  /** Get all notes for a given event, sorted newest first */
  getByEvent(eventId: string): EventNote[] {
    return readAll()
      .filter((n) => n.eventId === eventId)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },

  /** Count notes for an event (used for badges) */
  count(eventId: string): number {
    return readAll().filter((n) => n.eventId === eventId).length;
  },

  /** Add a new note */
  add(eventId: string, content: string, tag?: EventNote["tag"], author?: string): EventNote {
    const note: EventNote = {
      id: genId(),
      eventId,
      content,
      tag,
      author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const all = readAll();
    all.push(note);
    writeAll(all);
    return note;
  },

  /** Update existing note content/tag */
  update(noteId: string, patch: Partial<Pick<EventNote, "content" | "tag">>): EventNote | null {
    const all = readAll();
    const idx = all.findIndex((n) => n.id === noteId);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    writeAll(all);
    return all[idx];
  },

  /** Delete a note */
  delete(noteId: string): void {
    const all = readAll().filter((n) => n.id !== noteId);
    writeAll(all);
  },

  /** Delete all notes for an event (used when event is deleted) */
  deleteByEvent(eventId: string): void {
    const all = readAll().filter((n) => n.eventId !== eventId);
    writeAll(all);
  },

  /** Get all notes across all events (for global search/dashboard) */
  getAll(): EventNote[] {
    return readAll().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },
};
