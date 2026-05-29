/**
 * VITAS · Wellbeing Service (Supabase + localStorage hybrid)
 *
 * Persists 4 wellbeing data streams used by:
 *   - /wellbeing (team dashboard)
 *   - PlayerHub Tab "Bienestar"
 *   - ParentDashboardPage (/family/:id)
 *   - Dropout risk scoring
 *
 * Tables:
 *   - attendance_records
 *   - engagement_snapshots
 *   - wellbeing_questionnaires
 *   - dropout_risk_assessments
 *
 * Strategy: identical to BehavioralProfileService. Write to cache always,
 * try Supabase opportunistically. Read prefers Supabase with cache fallback.
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

const STORAGE_KEY_ATTENDANCE = "vitas_wellbeing_attendance";
const STORAGE_KEY_ENGAGEMENT = "vitas_wellbeing_engagement";
const STORAGE_KEY_QUESTIONNAIRES = "vitas_wellbeing_questionnaires";
const STORAGE_KEY_RISK = "vitas_wellbeing_dropout_risk";

// ── Types ────────────────────────────────────────────────────────────
export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface AttendanceRecord {
  id: string;
  playerId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  source?: "manual" | "auto_detected";
  notes?: string;
}

export interface EngagementSnapshot {
  id: string;
  playerId: string;
  sessionId?: string;
  date: string;
  physicalEngagement: number; // 0-100
  socialEngagement: number;
  emotionalEngagement: number;
  engagementScore: number; // composite
}

export interface WellbeingQuestionnaire {
  id: string;
  playerId: string;
  respondent: "player" | "coach" | "parent";
  date: string;
  responses: Record<string, number | string>;
  score?: number; // optional composite
}

export interface DropoutRiskAssessment {
  id: string;
  playerId: string;
  date: string;
  riskScore: number; // 0-100
  riskLevel: "low" | "moderate" | "high" | "critical";
  primaryFactor: string;
  factors: Record<string, number>;
  intervention?: {
    coachActions?: string[];
    parentActions?: string[];
    clubActions?: string[];
    urgency?: "immediate" | "this_week" | "this_month" | "monitor";
    followUpDate?: string;
    escalationNeeded?: boolean;
  };
}

// ── Generic cache helpers ─────────────────────────────────────────────
function readCache<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache<T>(key: string, items: T[], cap = 500): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, cap)));
  } catch (err) {
    console.error(`[wellbeingService] cache write failed (${key})`, err);
  }
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Service ───────────────────────────────────────────────────────────
export const WellbeingService = {
  // ─── Attendance ────────────────────────────────────────────────────
  async getAttendance(playerId: string, limit = 60): Promise<AttendanceRecord[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("attendance_records")
          .select("*")
          .eq("player_id", playerId)
          .order("date", { ascending: false })
          .limit(limit);
        if (error) throw error;
        if (data) {
          return (data as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id),
            playerId: String(r.player_id),
            date: String(r.date),
            status: r.status as AttendanceStatus,
            source: r.source as AttendanceRecord["source"],
            notes: r.notes ? String(r.notes) : undefined,
          }));
        }
      } catch (err) {
        console.warn("[wellbeingService] attendance read failed:", err);
      }
    }
    return readCache<AttendanceRecord>(STORAGE_KEY_ATTENDANCE)
      .filter((a) => a.playerId === playerId)
      .slice(0, limit);
  },

  async saveAttendance(rec: AttendanceRecord): Promise<AttendanceRecord> {
    const final: AttendanceRecord = {
      ...rec,
      id: rec.id || genId("att"),
    };
    const all = readCache<AttendanceRecord>(STORAGE_KEY_ATTENDANCE).filter(
      (a) => a.id !== final.id,
    );
    all.unshift(final);
    writeCache(STORAGE_KEY_ATTENDANCE, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("attendance_records").upsert(
          {
            id: final.id.length === 36 ? final.id : undefined,
            player_id: final.playerId,
            date: final.date,
            status: final.status,
            source: final.source ?? "manual",
            notes: final.notes,
          },
          { onConflict: "id" },
        );
      } catch (err) {
        console.warn("[wellbeingService] attendance save failed:", err);
      }
    }
    return final;
  },

  // ─── Engagement ───────────────────────────────────────────────────
  async getEngagement(playerId: string, limit = 30): Promise<EngagementSnapshot[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("engagement_snapshots")
          .select("*")
          .eq("player_id", playerId)
          .order("date", { ascending: false })
          .limit(limit);
        if (error) throw error;
        if (data) {
          return (data as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id),
            playerId: String(r.player_id),
            sessionId: r.session_id ? String(r.session_id) : undefined,
            date: String(r.date),
            physicalEngagement: Number(r.physical_engagement ?? 0),
            socialEngagement: Number(r.social_engagement ?? 0),
            emotionalEngagement: Number(r.emotional_engagement ?? 0),
            engagementScore: Number(r.engagement_score ?? 0),
          }));
        }
      } catch (err) {
        console.warn("[wellbeingService] engagement read failed:", err);
      }
    }
    return readCache<EngagementSnapshot>(STORAGE_KEY_ENGAGEMENT)
      .filter((e) => e.playerId === playerId)
      .slice(0, limit);
  },

  async saveEngagement(snapshot: EngagementSnapshot): Promise<EngagementSnapshot> {
    const final: EngagementSnapshot = {
      ...snapshot,
      id: snapshot.id || genId("eng"),
    };
    const all = readCache<EngagementSnapshot>(STORAGE_KEY_ENGAGEMENT).filter(
      (e) => e.id !== final.id,
    );
    all.unshift(final);
    writeCache(STORAGE_KEY_ENGAGEMENT, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("engagement_snapshots").upsert(
          {
            id: final.id.length === 36 ? final.id : undefined,
            player_id: final.playerId,
            session_id: final.sessionId,
            date: final.date,
            physical_engagement: final.physicalEngagement,
            social_engagement: final.socialEngagement,
            emotional_engagement: final.emotionalEngagement,
            engagement_score: final.engagementScore,
          },
          { onConflict: "id" },
        );
      } catch (err) {
        console.warn("[wellbeingService] engagement save failed:", err);
      }
    }
    return final;
  },

  // ─── Questionnaires ────────────────────────────────────────────────
  async saveQuestionnaire(q: WellbeingQuestionnaire): Promise<WellbeingQuestionnaire> {
    const final: WellbeingQuestionnaire = {
      ...q,
      id: q.id || genId("qst"),
    };
    const all = readCache<WellbeingQuestionnaire>(STORAGE_KEY_QUESTIONNAIRES).filter(
      (x) => x.id !== final.id,
    );
    all.unshift(final);
    writeCache(STORAGE_KEY_QUESTIONNAIRES, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("wellbeing_questionnaires").upsert(
          {
            id: final.id.length === 36 ? final.id : undefined,
            player_id: final.playerId,
            respondent: final.respondent,
            date: final.date,
            responses: final.responses,
            score: final.score,
          },
          { onConflict: "id" },
        );
      } catch (err) {
        console.warn("[wellbeingService] questionnaire save failed:", err);
      }
    }
    return final;
  },

  async getQuestionnaires(
    playerId: string,
    respondent?: "player" | "coach" | "parent",
  ): Promise<WellbeingQuestionnaire[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        let q = supabase
          .from("wellbeing_questionnaires")
          .select("*")
          .eq("player_id", playerId)
          .order("date", { ascending: false });
        if (respondent) q = q.eq("respondent", respondent);
        const { data, error } = await q.limit(50);
        if (error) throw error;
        if (data) {
          return (data as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id),
            playerId: String(r.player_id),
            respondent: r.respondent as WellbeingQuestionnaire["respondent"],
            date: String(r.date),
            responses: (r.responses as Record<string, number | string>) ?? {},
            score: r.score !== null ? Number(r.score) : undefined,
          }));
        }
      } catch (err) {
        console.warn("[wellbeingService] questionnaire read failed:", err);
      }
    }
    let list = readCache<WellbeingQuestionnaire>(STORAGE_KEY_QUESTIONNAIRES).filter(
      (q) => q.playerId === playerId,
    );
    if (respondent) list = list.filter((q) => q.respondent === respondent);
    return list.slice(0, 50);
  },

  // ─── Dropout Risk ──────────────────────────────────────────────────
  async getLatestRisk(playerId: string): Promise<DropoutRiskAssessment | null> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("dropout_risk_assessments")
          .select("*")
          .eq("player_id", playerId)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const row = data as Record<string, unknown>;
          return {
            id: String(row.id),
            playerId: String(row.player_id),
            date: String(row.date),
            riskScore: Number(row.risk_score ?? 0),
            riskLevel: row.risk_level as DropoutRiskAssessment["riskLevel"],
            primaryFactor: String(row.primary_factor ?? ""),
            factors: (row.factors as Record<string, number>) ?? {},
            intervention:
              (row.intervention as DropoutRiskAssessment["intervention"]) ?? undefined,
          };
        }
      } catch (err) {
        console.warn("[wellbeingService] risk read failed:", err);
      }
    }
    return readCache<DropoutRiskAssessment>(STORAGE_KEY_RISK).find(
      (r) => r.playerId === playerId,
    ) ?? null;
  },

  async saveRisk(risk: DropoutRiskAssessment): Promise<DropoutRiskAssessment> {
    const final: DropoutRiskAssessment = {
      ...risk,
      id: risk.id || genId("risk"),
    };
    const all = readCache<DropoutRiskAssessment>(STORAGE_KEY_RISK).filter(
      (r) => r.id !== final.id,
    );
    all.unshift(final);
    writeCache(STORAGE_KEY_RISK, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("dropout_risk_assessments").upsert(
          {
            id: final.id.length === 36 ? final.id : undefined,
            player_id: final.playerId,
            date: final.date,
            risk_score: final.riskScore,
            risk_level: final.riskLevel,
            primary_factor: final.primaryFactor,
            factors: final.factors,
            intervention: final.intervention,
          },
          { onConflict: "id" },
        );
      } catch (err) {
        console.warn("[wellbeingService] risk save failed:", err);
      }
    }
    return final;
  },

  /** Get team-wide latest risk (for /wellbeing team overview) */
  async getTeamRisks(playerIds: string[]): Promise<DropoutRiskAssessment[]> {
    if (SUPABASE_CONFIGURED && playerIds.length > 0) {
      try {
        const { data, error } = await supabase
          .from("dropout_risk_assessments")
          .select("*")
          .in("player_id", playerIds)
          .order("date", { ascending: false });
        if (error) throw error;
        if (data) {
          const seen = new Set<string>();
          const result: DropoutRiskAssessment[] = [];
          for (const row of data as Array<Record<string, unknown>>) {
            const pid = String(row.player_id);
            if (seen.has(pid)) continue;
            seen.add(pid);
            result.push({
              id: String(row.id),
              playerId: pid,
              date: String(row.date),
              riskScore: Number(row.risk_score ?? 0),
              riskLevel: row.risk_level as DropoutRiskAssessment["riskLevel"],
              primaryFactor: String(row.primary_factor ?? ""),
              factors: (row.factors as Record<string, number>) ?? {},
              intervention:
                (row.intervention as DropoutRiskAssessment["intervention"]) ?? undefined,
            });
          }
          return result;
        }
      } catch (err) {
        console.warn("[wellbeingService] team risks failed:", err);
      }
    }
    const cache = readCache<DropoutRiskAssessment>(STORAGE_KEY_RISK);
    const byPlayer = new Map<string, DropoutRiskAssessment>();
    for (const r of cache) {
      if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, r);
    }
    return Array.from(byPlayer.values()).filter((r) => playerIds.includes(r.playerId));
  },
};
