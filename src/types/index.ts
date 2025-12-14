/**
 * Legacy category type for backward compatibility
 */
export type LegacyCategory = 'academic' | 'non-academic' | 'unknown';

/**
 * Detailed category from the new classification system
 */
export type DetailedCategory = 'academic' | 'productivity' | 'neutral' | 'non_academic';

/**
 * Classification source for tracking how a domain was classified
 */
export type ClassificationSource = 'database' | 'rule' | 'cache' | 'api' | 'user';

/**
 * Detailed classification info for a tab
 */
export interface ClassificationInfo {
  detailedCategory: DetailedCategory;
  confidence: number;
  source: ClassificationSource;
  userOverride?: boolean;
}

export interface TabActivity {
  url: string;
  domain: string;
  title: string;
  timeSpent: number; // milliseconds
  activePeriods: ActivityPeriod[];
  interactions: TabInteractions;
  category: LegacyCategory; // Kept for backward compatibility
  classification?: ClassificationInfo; // New detailed classification
  tabId: number;
  windowId: number;
}

export interface ActivityPeriod {
  start: number; // timestamp
  end: number | null; // timestamp, null if still active
}

export interface TabInteractions {
  scrolls: number;
  clicks: number;
  typing: boolean;
}

export interface Session {
  sessionId: string;
  startTime: number; // timestamp
  endTime: number | null; // timestamp, null if still active
  tabs: TabActivity[];
}

export interface StorageData {
  currentSession: Session | null;
  sessions: Session[];
  settings: Settings;
}

export interface Settings {
  trackingEnabled: boolean;
  academicDomains: string[];
  nonAcademicDomains: string[];
  idleThreshold: number; // seconds
  dataRetentionDays: number;
}

export interface ExportData {
  exportDate: number;
  sessions: Session[];
  totalTabs: number;
  totalTimeSpent: number;
}
