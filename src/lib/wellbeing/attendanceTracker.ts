/**
 * VITAS · Attendance Tracker (Sprint 21)
 *
 * CRUD for attendance + automatic detection from video.
 * If player re-ID (colorReId.ts) doesn't detect player → absent.
 * Manual input as fallback.
 *
 * Output: AttendanceProfile with rate, patterns, alerts.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  playerId: string;
  date: string;            // ISO date YYYY-MM-DD
  status: "present" | "absent" | "late" | "excused";
  source: "video" | "manual" | "auto";
  sessionId?: string;
}

export interface AttendanceProfile {
  playerId: string;
  /** Overall attendance rate (0-100) */
  rate: number;
  /** Total sessions in window */
  totalSessions: number;
  /** Sessions attended */
  attended: number;
  /** Sessions absent */
  absent: number;
  /** Late arrivals */
  late: number;
  /** Excused absences */
  excused: number;
  /** Consecutive absences (current streak) */
  consecutiveAbsences: number;
  /** Patterns: most missed day of week */
  mostMissedDay: string | null;
  /** Alert: attendance dropping? */
  alert: AttendanceAlert | null;
}

export interface AttendanceAlert {
  type: "declining" | "consecutive_absence" | "below_threshold";
  message: string;
  severity: "info" | "warning" | "critical";
}

// ─── Constants ───────────────────────────────────────────────────────────

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ATTENDANCE_THRESHOLD = 75; // below this → alert

// ─── Main Functions ──────────────────────────────────────────────────────

/**
 * Calculate attendance profile from records.
 */
export function calculateAttendanceProfile(
  playerId: string,
  records: AttendanceRecord[],
): AttendanceProfile {
  const playerRecords = records.filter(r => r.playerId === playerId);
  const total = playerRecords.length;

  if (total === 0) {
    return {
      playerId,
      rate: 100,
      totalSessions: 0,
      attended: 0,
      absent: 0,
      late: 0,
      excused: 0,
      consecutiveAbsences: 0,
      mostMissedDay: null,
      alert: null,
    };
  }

  const attended = playerRecords.filter(r => r.status === "present" || r.status === "late").length;
  const absent = playerRecords.filter(r => r.status === "absent").length;
  const late = playerRecords.filter(r => r.status === "late").length;
  const excused = playerRecords.filter(r => r.status === "excused").length;

  const rate = Math.round((attended / (total - excused || 1)) * 100);

  // Consecutive absences (most recent streak)
  let consecutiveAbsences = 0;
  const sorted = [...playerRecords].sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    if (r.status === "absent") consecutiveAbsences++;
    else break;
  }

  // Most missed day
  const absentDays = playerRecords
    .filter(r => r.status === "absent")
    .map(r => new Date(r.date).getDay());
  let mostMissedDay: string | null = null;
  if (absentDays.length > 0) {
    const dayCounts = new Map<number, number>();
    for (const d of absentDays) {
      dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
    }
    const maxDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (maxDay && maxDay[1] >= 2) {
      mostMissedDay = DAY_NAMES[maxDay[0]];
    }
  }

  // Alert
  let alert: AttendanceAlert | null = null;
  if (consecutiveAbsences >= 3) {
    alert = {
      type: "consecutive_absence",
      message: `${consecutiveAbsences} sesiones consecutivas sin asistir`,
      severity: "critical",
    };
  } else if (rate < ATTENDANCE_THRESHOLD) {
    alert = {
      type: "below_threshold",
      message: `Asistencia en ${rate}% — por debajo del ${ATTENDANCE_THRESHOLD}% recomendado`,
      severity: "warning",
    };
  } else if (absent > total * 0.3) {
    alert = {
      type: "declining",
      message: "Tendencia de asistencia a la baja",
      severity: "info",
    };
  }

  return {
    playerId,
    rate,
    totalSessions: total,
    attended,
    absent,
    late,
    excused,
    consecutiveAbsences,
    mostMissedDay,
    alert,
  };
}

/**
 * Auto-detect attendance from video processing.
 * If player was NOT detected in any frame → absent.
 */
export function detectAttendanceFromVideo(
  sessionId: string,
  date: string,
  detectedPlayerIds: string[],
  allPlayerIds: string[],
): AttendanceRecord[] {
  const detected = new Set(detectedPlayerIds);
  return allPlayerIds.map(pid => ({
    playerId: pid,
    date,
    status: detected.has(pid) ? "present" as const : "absent" as const,
    source: "video" as const,
    sessionId,
  }));
}
