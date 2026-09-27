/** The catalogue health figures the panel's scraper section shows (lib/db/stats.ts). */
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
