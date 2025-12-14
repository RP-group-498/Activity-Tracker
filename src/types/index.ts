export interface TabActivity {
  url: string;
  domain: string;
  title: string;
  timeSpent: number; // milliseconds
  activePeriods: ActivityPeriod[];
  interactions: TabInteractions;
  category: 'academic' | 'non-academic' | 'unknown';
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
