/**
 * Event Storage Manager
 * Handles buffering and storage of activity events for sync with desktop app.
 *
 * Features:
 * - Buffers events locally when desktop app is disconnected
 * - Enforces buffer limits (max 1000 events)
 * - Marks events as synced after acknowledgment
 * - Provides statistics for monitoring
 */

import {
  BrowserEvent,
  ActivityEvent,
  ExtensionState,
  ExtensionStats,
} from '../types';

const STORAGE_KEYS = {
  PENDING_EVENTS: 'pendingEvents',
  EXTENSION_STATE: 'extensionState',
  STATS: 'stats',
} as const;

const MAX_BUFFER_SIZE = 1000;

const DEFAULT_STATE: ExtensionState = {
  isConnected: false,
  isPaused: false,
  lastSyncTime: null,
};

const DEFAULT_STATS: ExtensionStats = {
  totalEventsCaptured: 0,
  totalEventsSynced: 0,
  lastError: null,
};

/**
 * Event Storage Manager - Singleton
 */
class EventStorageManager {
  private initialized: boolean = false;
  private state: ExtensionState = { ...DEFAULT_STATE };
  private stats: ExtensionStats = { ...DEFAULT_STATS };

  /**
   * Initialize the storage manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const data = await chrome.storage.local.get([
      STORAGE_KEYS.EXTENSION_STATE,
      STORAGE_KEYS.STATS,
    ]);

    this.state = data[STORAGE_KEYS.EXTENSION_STATE] || { ...DEFAULT_STATE };
    this.stats = data[STORAGE_KEYS.STATS] || { ...DEFAULT_STATS };

    this.initialized = true;
    console.log('[EventStorage] Initialized');
  }

  /**
   * Buffer an event for later sync
   */
  async bufferEvent(event: BrowserEvent): Promise<void> {
    await this.ensureInitialized();

    const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_EVENTS);
    const events: BrowserEvent[] = data[STORAGE_KEYS.PENDING_EVENTS] || [];

    // Add to buffer
    events.push(event);

    // Enforce buffer limit
    if (events.length > MAX_BUFFER_SIZE) {
      events.shift(); // Remove oldest
      console.warn('[EventStorage] Buffer full, dropped oldest event');
    }

    // Update stats
    this.stats.totalEventsCaptured++;

    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_EVENTS]: events,
      [STORAGE_KEYS.STATS]: this.stats,
    });
  }

  /**
   * Get all pending events
   */
  async getPendingEvents(): Promise<BrowserEvent[]> {
    await this.ensureInitialized();

    const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_EVENTS);
    return data[STORAGE_KEYS.PENDING_EVENTS] || [];
  }

  /**
   * Get pending activity events only
   */
  async getPendingActivityEvents(): Promise<ActivityEvent[]> {
    const events = await this.getPendingEvents();
    return events.filter(
      (e): e is ActivityEvent =>
        'activityType' in e && e.activityType === 'webpage'
    );
  }

  /**
   * Get pending events count
   */
  async getPendingCount(): Promise<number> {
    const events = await this.getPendingEvents();
    return events.length;
  }

  /**
   * Mark events as synced (remove from pending)
   */
  async markEventsSynced(eventIds: string[]): Promise<number> {
    await this.ensureInitialized();

    const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_EVENTS);
    let events: BrowserEvent[] = data[STORAGE_KEYS.PENDING_EVENTS] || [];

    const syncedSet = new Set(eventIds);
    const originalCount = events.length;

    events = events.filter((e) => !syncedSet.has(e.eventId));

    const syncedCount = originalCount - events.length;
    this.stats.totalEventsSynced += syncedCount;
    this.state.lastSyncTime = new Date().toISOString();

    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_EVENTS]: events,
      [STORAGE_KEYS.STATS]: this.stats,
      [STORAGE_KEYS.EXTENSION_STATE]: this.state,
    });

    return syncedCount;
  }

  /**
   * Increment sync attempts for specific events
   */
  async incrementSyncAttempts(eventIds: string[]): Promise<void> {
    await this.ensureInitialized();

    const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_EVENTS);
    const events: BrowserEvent[] = data[STORAGE_KEYS.PENDING_EVENTS] || [];

    const idsSet = new Set(eventIds);
    events.forEach((e) => {
      if (idsSet.has(e.eventId) && 'syncAttempts' in e) {
        (e as ActivityEvent).syncAttempts++;
      }
    });

    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_EVENTS]: events,
    });
  }

  /**
   * Clear all pending events
   */
  async clearPendingEvents(): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_EVENTS]: [],
    });
  }

  /**
   * Get extension state
   */
  async getState(): Promise<ExtensionState> {
    await this.ensureInitialized();
    return { ...this.state };
  }

  /**
   * Update connection state
   */
  async setConnectionState(isConnected: boolean): Promise<void> {
    await this.ensureInitialized();
    this.state.isConnected = isConnected;
    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_STATE]: this.state,
    });
  }

  /**
   * Update paused state
   */
  async setPausedState(isPaused: boolean): Promise<void> {
    await this.ensureInitialized();
    this.state.isPaused = isPaused;
    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_STATE]: this.state,
    });
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<ExtensionStats> {
    await this.ensureInitialized();
    return { ...this.stats };
  }

  /**
   * Set error message
   */
  async setError(error: string | null): Promise<void> {
    await this.ensureInitialized();
    this.stats.lastError = error;
    await chrome.storage.local.set({
      [STORAGE_KEYS.STATS]: this.stats,
    });
  }

  /**
   * Get data summary for display
   */
  async getDataSummary(): Promise<{
    totalEvents: number;
    oldestEvent: string | null;
    newestEvent: string | null;
    topDomains: [string, number][];
    pendingCount: number;
    syncedCount: number;
  }> {
    await this.ensureInitialized();

    const events = await this.getPendingEvents();
    const activityEvents = events.filter(
      (e): e is ActivityEvent =>
        'activityType' in e && e.activityType === 'webpage'
    );

    // Group by domain
    const domainCounts: Record<string, number> = {};
    activityEvents.forEach((e) => {
      domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1;
    });

    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) as [string, number][];

    return {
      totalEvents: events.length,
      oldestEvent: events[0]?.timestamp || null,
      newestEvent: events[events.length - 1]?.timestamp || null,
      topDomains,
      pendingCount: events.length,
      syncedCount: this.stats.totalEventsSynced,
    };
  }

  /**
   * Delete events older than specified days
   */
  async deleteOldEvents(daysToKeep: number): Promise<number> {
    await this.ensureInitialized();

    const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_EVENTS);
    const events: BrowserEvent[] = data[STORAGE_KEYS.PENDING_EVENTS] || [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const cutoffTime = cutoff.getTime();

    const filtered = events.filter(
      (e) => new Date(e.timestamp).getTime() > cutoffTime
    );
    const deletedCount = events.length - filtered.length;

    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_EVENTS]: filtered,
    });

    return deletedCount;
  }

  /**
   * Delete events for a specific domain
   */
  async deleteByDomain(domain: string): Promise<number> {
    await this.ensureInitialized();

    const data = await chrome.storage.local.get(STORAGE_KEYS.PENDING_EVENTS);
    const events: BrowserEvent[] = data[STORAGE_KEYS.PENDING_EVENTS] || [];

    const filtered = events.filter((e) => {
      if ('domain' in e) {
        return e.domain !== domain;
      }
      return true;
    });
    const deletedCount = events.length - filtered.length;

    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_EVENTS]: filtered,
    });

    return deletedCount;
  }

  /**
   * Export all data as JSON
   */
  async exportAsJSON(): Promise<string> {
    await this.ensureInitialized();

    const events = await this.getPendingEvents();

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      events: events,
      stats: this.stats,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Reset all stats
   */
  async resetStats(): Promise<void> {
    this.stats = { ...DEFAULT_STATS };
    await chrome.storage.local.set({
      [STORAGE_KEYS.STATS]: this.stats,
    });
  }

  /**
   * Ensure the manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Singleton instance
let storageInstance: EventStorageManager | null = null;

/**
 * Get the singleton event storage manager instance
 */
export function getEventStorageManager(): EventStorageManager {
  if (!storageInstance) {
    storageInstance = new EventStorageManager();
  }
  return storageInstance;
}
