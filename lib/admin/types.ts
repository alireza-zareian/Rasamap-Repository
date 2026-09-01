// ============================================================
// RASAMAP Admin — Shared Types
// ============================================================

export type AdminRole = "admin" | "editor" | "viewer";

export interface AdminUser {
  id: string;
  name: string;
  role: AdminRole;
}

export interface AdminStats {
  total: number;
  active: number;
  inactive: number;
  bySource: Record<string, number>;
  byCity: Record<string, number>;
  byType: Record<string, number>;
  withCoords: number;
  missingCoords: number;
  missingImages: number;
  recentlyImported: number; // last 7 days
  duplicateGroups: number;
}

export interface QualityWarning {
  id: string | number;
  name: string;
  issues: string[];
}

export type ScraperStatus = "idle" | "running" | "done" | "error";

export interface ScraperRun {
  source: string;
  status: ScraperStatus;
  startedAt?: string;
  finishedAt?: string;
  count?: number;
  error?: string;
}