import {
  StorageData,
  Session,
  Settings,
  UserPreferences,
  ExtensionState,
  ExtensionStats,
  ConsentData,
  BrowserEvent,
} from '../types';

const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  academicDomains: ['edu', 'scholar.google.com', 'stackoverflow.com', 'github.com'],
  nonAcademicDomains: ['youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'reddit.com'],
  idleThreshold: 60, // 60 seconds
  dataRetentionDays: 30,
};

const DEFAULT_PREFERENCES: UserPreferences = {
  trackIncognito: false,
  excludedDomains: [],
  idleThresholdSeconds: 60,
};

const DEFAULT_EXTENSION_STATE: ExtensionState = {
  isConnected: false,
  isPaused: false,
  lastSyncTime: null,
};

const DEFAULT_STATS: ExtensionStats = {
  totalEventsCaptured: 0,
  totalEventsSynced: 0,
  lastError: null,
};

export class StorageManager {
  private static async get<T>(key: string): Promise<T | null> {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  }

  private static async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  // ============================================================================
  // Legacy Session Management (for backward compatibility)
  // ============================================================================

  static async getCurrentSession(): Promise<Session | null> {
    return this.get<Session>('currentSession');
  }

  static async setCurrentSession(session: Session | null): Promise<void> {
    await this.set('currentSession', session);
  }

  static async getSessions(): Promise<Session[]> {
    const sessions = await this.get<Session[]>('sessions');
    return sessions || [];
  }

  static async addSession(session: Session): Promise<void> {
    const sessions = await this.getSessions();
    sessions.push(session);
    await this.set('sessions', sessions);
  }

  static async updateSession(sessionId: string, updatedSession: Session): Promise<void> {
    const sessions = await this.getSessions();
    const index = sessions.findIndex(s => s.sessionId === sessionId);
    if (index !== -1) {
      sessions[index] = updatedSession;
      await this.set('sessions', sessions);
    }
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  static async getSettings(): Promise<Settings> {
    const settings = await this.get<Settings>('settings');
    return settings || DEFAULT_SETTINGS;
  }

  static async setSettings(settings: Settings): Promise<void> {
    await this.set('settings', settings);
  }

  // ============================================================================
  // User Preferences (New)
  // ============================================================================

  static async getPreferences(): Promise<UserPreferences> {
    const prefs = await this.get<UserPreferences>('preferences');
    return prefs || DEFAULT_PREFERENCES;
  }

  static async setPreferences(preferences: UserPreferences): Promise<void> {
    await this.set('preferences', preferences);
  }

  static async updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ): Promise<void> {
    const prefs = await this.getPreferences();
    prefs[key] = value;
    await this.set('preferences', prefs);
  }

  // ============================================================================
  // Extension State (New)
  // ============================================================================

  static async getExtensionState(): Promise<ExtensionState> {
    const state = await this.get<ExtensionState>('extensionState');
    return state || DEFAULT_EXTENSION_STATE;
  }

  static async setExtensionState(state: ExtensionState): Promise<void> {
    await this.set('extensionState', state);
  }

  static async updateExtensionState(updates: Partial<ExtensionState>): Promise<void> {
    const state = await this.getExtensionState();
    await this.set('extensionState', { ...state, ...updates });
  }

  // ============================================================================
  // Stats (New)
  // ============================================================================

  static async getStats(): Promise<ExtensionStats> {
    const stats = await this.get<ExtensionStats>('stats');
    return stats || DEFAULT_STATS;
  }

  static async setStats(stats: ExtensionStats): Promise<void> {
    await this.set('stats', stats);
  }

  static async incrementStat(key: 'totalEventsCaptured' | 'totalEventsSynced'): Promise<void> {
    const stats = await this.getStats();
    stats[key]++;
    await this.set('stats', stats);
  }

  static async setLastError(error: string | null): Promise<void> {
    const stats = await this.getStats();
    stats.lastError = error;
    await this.set('stats', stats);
  }

  // ============================================================================
  // Consent (New)
  // ============================================================================

  static async getConsent(): Promise<ConsentData | null> {
    return this.get<ConsentData>('consent');
  }

  static async setConsent(consent: ConsentData): Promise<void> {
    await this.set('consent', consent);
  }

  // ============================================================================
  // Pending Events (New - for native messaging sync)
  // ============================================================================

  static async getPendingEvents(): Promise<BrowserEvent[]> {
    const events = await this.get<BrowserEvent[]>('pendingEvents');
    return events || [];
  }

  static async setPendingEvents(events: BrowserEvent[]): Promise<void> {
    await this.set('pendingEvents', events);
  }

  static async addPendingEvent(event: BrowserEvent): Promise<void> {
    const events = await this.getPendingEvents();
    events.push(event);
    // Enforce max buffer size
    if (events.length > 1000) {
      events.shift();
    }
    await this.set('pendingEvents', events);
  }

  static async removePendingEvents(eventIds: string[]): Promise<void> {
    const events = await this.getPendingEvents();
    const idsSet = new Set(eventIds);
    const filtered = events.filter(e => !idsSet.has(e.eventId));
    await this.set('pendingEvents', filtered);
  }

  // ============================================================================
  // Data Management
  // ============================================================================

  static async clearOldData(retentionDays: number): Promise<void> {
    const sessions = await this.getSessions();
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const filteredSessions = sessions.filter(s => s.startTime > cutoffTime);
    await this.set('sessions', filteredSessions);

    // Also clear old pending events
    const events = await this.getPendingEvents();
    const filteredEvents = events.filter(e => new Date(e.timestamp).getTime() > cutoffTime);
    await this.set('pendingEvents', filteredEvents);
  }

  static async clearAllData(): Promise<void> {
    // Preserve consent data when clearing
    const consent = await this.getConsent();
    await chrome.storage.local.clear();
    if (consent) {
      await this.setConsent(consent);
    }
  }

  static async clearAllDataIncludingConsent(): Promise<void> {
    await chrome.storage.local.clear();
  }

  static async exportData(): Promise<StorageData> {
    const currentSession = await this.getCurrentSession();
    const sessions = await this.getSessions();
    const settings = await this.getSettings();
    return {
      currentSession,
      sessions,
      settings,
    };
  }

  // ============================================================================
  // Storage Info
  // ============================================================================

  static async getStorageUsage(): Promise<{ bytesUsed: number; quotaBytes: number }> {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytesUsed) => {
        // chrome.storage.local has a 10MB limit by default
        resolve({ bytesUsed, quotaBytes: 10 * 1024 * 1024 });
      });
    });
  }

  static async getAllData(): Promise<Record<string, unknown>> {
    return chrome.storage.local.get(null);
  }
}
