/**
 * VITAS — Type definitions only.
 * All mock/fake player data has been removed.
 * Real data comes from Supabase and localStorage via PlayerService.
 */

export interface Player {
  id: string;
  name: string;
  age: number;
  position: string;
  positionShort: string;
  academy: string;
  vsi: number; // Vitas Score Index 0-99
  phvOffset: number; // maturity offset
  phvCategory: "early" | "on-time" | "late";
  trending: "up" | "down" | "stable";
  avatar: string;
  image: string;
  stats: {
    speed: number;
    technique: number;
    vision: number;
    stamina: number;
    shooting: number;
    defending: number;
  };
  recentDrills: number;
  lastActive: string;
}

export interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  score: [number, number];
  minute: number;
  status: "live" | "upcoming" | "finished";
  playersTracked: number;
  topPerformer: string;
  topVsi: number;
}

export interface DrillCategory {
  id: string;
  name: string;
  icon: string;
  drillCount: number;
  color: string;
}

export interface ScoutInsight {
  id: string;
  player: Player;
  insightType: "breakout" | "comparison" | "phv-alert" | "drill-record";
  title: string;
  description: string;
  metric: string;
  metricValue: string;
  timestamp: string;
}

export interface PlayerReport {
  id: string;
  name: string;
  position: string;
  academy: string;
  vsi: number;
  biasAlert: "low" | "med" | "high";
}

export interface AnalysisPipeline {
  id: string;
  title: string;
  source: string;
  pilar: string;
  progress: number;
  status: "processing" | "queued" | "complete";
  eta?: string;
  queuePosition?: number;
}

export interface LiveFeedEvent {
  id: string;
  message: string;
  time: string;
  color: "primary" | "electric" | "gold";
}


