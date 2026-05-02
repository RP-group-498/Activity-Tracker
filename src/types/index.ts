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

// ============================================================================
// New Activity Event Types (for desktop app integration)
// ============================================================================

/**
 * Activity Event - Single page visit captured for desktop app
 */
export interface ActivityEvent {
  eventId: string;
  sessionId: string | null; // From desktop app, null if disconnected
  source: 'browser';
  activityType: 'webpage';
  timestamp: string; // ISO 8601 format
  startTime: string;
  endTime: string | null;
  url: string;
  domain: string;
  path: string;
  title: string;
  activeTime: number; // milliseconds
  idleTime: number; // milliseconds
  tabId: number;
  windowId: number;
  isIncognito: boolean;
  synced: boolean;
  syncAttempts: number;
  // Optional enrichment data
  urlComponents?: UrlComponents;
  titleHints?: TitleHints;
  engagement?: EngagementMetrics;
  // Domain-specific context
  youtubeContext?: YouTubeContext;
  googleContext?: GoogleContext;
  socialContext?: SocialContext;
  classificationHints?: ClassificationHints;
}

/**
 * Tab Switch Event
 */
export interface TabSwitchEvent {
  eventId: string;
  sessionId: string | null;
  timestamp: string;
  fromTabId: number;
  fromUrl: string;
  fromDomain: string;
  toTabId: number;
  toUrl: string;
  toDomain: string;
  synced: boolean;
}

/**
 * Idle State Change Event
 */
export interface IdleStateEvent {
  eventId: string;
  sessionId: string | null;
  timestamp: string;
  previousState: 'active' | 'idle' | 'locked';
  newState: 'active' | 'idle' | 'locked';
  activeTabId: number | null;
  activeUrl: string | null;
  synced: boolean;
}

/**
 * Union type for all events
 */
export type BrowserEvent = ActivityEvent | TabSwitchEvent | IdleStateEvent;

// ============================================================================
// URL Components and Enrichment Types
// ============================================================================

export interface UrlComponents {
  protocol: string;
  domain: string;
  subdomain: string;
  path: string;
  pathSegments: string[];
  queryParams: Record<string, string>;
  hash: string;
}

export interface TitleHints {
  wordCount: number;
  hasNumbers: boolean;
  possibleVideo: boolean;
  possibleSearch: boolean;
  possibleDocs: boolean;
}

export interface EngagementMetrics {
  activeTime: number;
  idleTime: number;
  activeRatio: number;
  wasEngaged: boolean;
}

export interface YouTubeContext {
  isVideo: boolean;
  videoId: string | null;
  isPlaylist: boolean;
  isChannel: boolean;
  isSearch: boolean;
  searchQuery: string | null;
  titleForClassification: string;
}

export interface GoogleContext {
  service: string;
  isSearch: boolean;
  searchQuery: string | null;
  isScholar: boolean;
  isDocs: boolean;
  isDrive: boolean;
  isClassroom: boolean;
}

export interface SocialContext {
  platform: string;
  isDirectContent: boolean;
  isFeed: boolean;
  isMessaging: boolean;
  possibleAcademic: boolean;
}

export interface ClassificationHints {
  suggestedLayer: 'rules' | 'path_analysis' | 'ml_classifier';
  isKnownDomain: boolean;
  needsTitleAnalysis: boolean;
  mayNeedLLM: boolean;
}

// ============================================================================
// Native Messaging Types
// ============================================================================

/**
 * Extension -> Desktop App messages
 */
export interface ActivityBatchMessage {
  type: 'activity_batch';
  events: ActivityEvent[];
  extensionVersion: string;
  timestamp: string;
}

export interface ConnectMessage {
  type: 'connect';
  extensionId: string;
  extensionVersion: string;
  timestamp: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: string;
  pendingEvents: number;
  currentActivity?: {
    url: string;
    domain: string;
    title: string;
    activeTime: number;
  };
}

export type ExtensionMessage = ActivityBatchMessage | ConnectMessage | HeartbeatMessage;

/**
 * Desktop App -> Extension messages
 */
export interface SessionMessage {
  type: 'session';
  sessionId: string;
  userId: string;
  status: 'active' | 'paused' | 'ended';
}

export interface AckMessage {
  type: 'ack';
  receivedEventIds: string[];
}

export interface CommandMessage {
  type: 'command';
  command: 'pause' | 'resume' | 'clear_local';
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export type DesktopMessage = SessionMessage | AckMessage | CommandMessage | ErrorMessage;

// ============================================================================
// Local Storage Schema
// ============================================================================

export interface LocalStorageSchema {
  pendingEvents: BrowserEvent[];
  currentSession: {
    sessionId: string;
    userId: string;
    startTime: string;
  } | null;
  extensionState: ExtensionState;
  preferences: UserPreferences;
  stats: ExtensionStats;
  consent: ConsentData | null;
}

export interface ExtensionState {
  isConnected: boolean;
  isPaused: boolean;
  lastSyncTime: string | null;
}

export interface UserPreferences {
  trackIncognito: boolean;
  excludedDomains: string[];
  idleThresholdSeconds: number;
}

export interface ExtensionStats {
  totalEventsCaptured: number;
  totalEventsSynced: number;
  lastError: string | null;
}

export interface ConsentData {
  granted: boolean;
  version: string;
  timestamp: string;
  revokedAt?: string;
  declinedAt?: string;
  lastModified?: string;
  options?: ConsentOptions;
}

export interface ConsentOptions {
  trackBrowsing: boolean;
  trackIdleTime: boolean;
  trackIncognito: boolean;
  shareAnonymousStats: boolean;
}

// ============================================================================
// Legacy Types (for backward compatibility)
// ============================================================================

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
