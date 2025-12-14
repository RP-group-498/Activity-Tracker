import { StorageData, Session, Settings } from '../types';

const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  academicDomains: ['edu', 'scholar.google.com', 'stackoverflow.com', 'github.com'],
  nonAcademicDomains: ['youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'reddit.com'],
  idleThreshold: 60, // 60 seconds
  dataRetentionDays: 30,
};

export class StorageManager {
  private static async get<T>(key: string): Promise<T | null> {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  }

  private static async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

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

  static async getSettings(): Promise<Settings> {
    const settings = await this.get<Settings>('settings');
    return settings || DEFAULT_SETTINGS;
  }

  static async setSettings(settings: Settings): Promise<void> {
    await this.set('settings', settings);
  }

  static async clearOldData(retentionDays: number): Promise<void> {
    const sessions = await this.getSessions();
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const filteredSessions = sessions.filter(s => s.startTime > cutoffTime);
    await this.set('sessions', filteredSessions);
  }

  static async clearAllData(): Promise<void> {
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
}
