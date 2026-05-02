/**
 * Activity Tracker Service
 * Captures all browser activity events including page visits, tab switches, and idle states.
 *
 * This service integrates with:
 * - ConsentManager: Only tracks if consent is granted
 * - ExclusionManager: Respects domain exclusions
 * - StorageManager: Buffers events locally
 * - NativeMessaging: Session ID from desktop app
 */

import { ActivityEvent, TabSwitchEvent, IdleStateEvent } from '../types';
import { getExclusionManager } from './exclusionManager';
import { getConsentManager } from './consentManager';
import { getEventStorageManager } from './eventStorage';
import {
  generateEventId,
  extractDomain,
  extractPath,
  getTimestamp,
  sanitizeUrl,
} from './utils';

interface CurrentTabInfo {
  id: number;
  windowId: number;
  url: string;
  domain: string;
  path: string;
  title: string;
  isIncognito: boolean;
}

interface TrackerStatus {
  isTracking: boolean;
  currentPage: {
    url: string;
    domain: string;
    title: string;
    activeTime: number;
  } | null;
  isUserActive: boolean;
  hasSession: boolean;
  isPaused: boolean;
  idleDuration: number; // seconds since last activity
}

/**
 * Activity Tracker - Singleton
 */
class ActivityTracker {
  // Current state
  private currentTab: CurrentTabInfo | null = null;
  private currentPageStart: number | null = null;
  private activeTime: number = 0; // seconds
  private isUserActive: boolean = true;
  private isPaused: boolean = false;

  // Idle tracking
  private idleThreshold: number = 60; // seconds
  private lastActivityTime: number = Date.now();
  private lastActiveTick: number = Date.now();
  private lastProcessedUrl: string | null = null;
  private activityCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Session from desktop app (null if disconnected)
  private sessionId: string | null = null;

  private initialized: boolean = false;
  private exclusionManager = getExclusionManager();
  private consentManager = getConsentManager();
  private eventStorage = getEventStorageManager();

  /**
   * Initialize all tracking listeners
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize dependencies
    await Promise.all([
      this.exclusionManager.initialize(),
      this.consentManager.initialize(),
      this.eventStorage.initialize(),
    ]);

    // Check if we should track
    const canTrack = await this.consentManager.canTrack();
    if (!canTrack) {
      console.log('[ActivityTracker] Tracking disabled - no consent');
      this.initialized = true;
      return;
    }

    this.setupTabListeners();
    this.setupNavigationListeners();
    this.setupIdleListeners();
    this.setupWindowListeners();
    this.startActivityTimer();

    // Get initial active tab
    await this.captureInitialState();

    this.initialized = true;
    console.log('[ActivityTracker] Initialized');
  }

  /**
   * Set session ID (called when desktop app connects)
   */
  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
    console.log('[ActivityTracker] Session ID set:', sessionId);
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Pause tracking
   */
  async pause(): Promise<void> {
    if (this.isPaused) return;

    this.isPaused = true;
    await this.finalizeCurrentPage();
    console.log('[ActivityTracker] Paused');
  }

  /**
   * Resume tracking
   */
  async resume(): Promise<void> {
    if (!this.isPaused) return;

    this.isPaused = false;

    // Re-capture current active tab and activity state
    try {
      // Query current idle state
      const idleState = await chrome.idle.queryState(this.idleThreshold);
      this.isUserActive = idleState === 'active';

      // Check if current window has focus
      const currentWindow = await chrome.windows.getCurrent();
      if (!currentWindow.focused) {
        this.isUserActive = false;
      }

      console.log('[ActivityTracker] Resumed with isUserActive:', this.isUserActive);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await this.handleTabSwitch(tab.id, tab.windowId || 0);
      }
    } catch (error) {
      console.error('[ActivityTracker] Resume error:', error);
    }
  }

  /**
   * Check if tracker is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Set idle threshold
   */
  setIdleThreshold(seconds: number): void {
    this.idleThreshold = seconds;
    chrome.idle.setDetectionInterval(seconds);
  }

  // =====================
  // TAB TRACKING
  // =====================

  private setupTabListeners(): void {
    // Tab activated (user switched tabs)
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      if (this.isPaused || !(await this.shouldTrack())) return;
      await this.handleTabSwitch(activeInfo.tabId, activeInfo.windowId);
    });

    // Tab updated (URL or title changed)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (this.isPaused || !(await this.shouldTrack())) return;
      
      // Handle page load (status change) or title updates (crucial for SPAs like YouTube)
      if ((changeInfo.status === 'complete' || changeInfo.title) && this.currentTab?.id === tabId) {
        console.log(`[ActivityTracker] Tab updated: ${tabId}, status=${changeInfo.status}, title=${changeInfo.title}`);
        await this.handlePageLoad(tab);
      }
    });

    // Tab closed
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      if (this.currentTab?.id === tabId) {
        await this.finalizeCurrentPage();
        this.currentTab = null;
      }
    });
  }

  private async handleTabSwitch(tabId: number, _windowId: number): Promise<void> {
    try {
      const tab = await chrome.tabs.get(tabId);

      // Check if URL is trackable
      if (!tab.url || !(await this.exclusionManager.shouldTrackUrl(tab.url))) {
        // Finalize current page but don't start tracking new one
        await this.finalizeCurrentPage();
        this.currentTab = null;
        return;
      }

      // Check incognito permission
      if (tab.incognito && !(await this.consentManager.canTrackIncognito())) {
        await this.finalizeCurrentPage();
        this.currentTab = null;
        return;
      }

      // Record tab switch event (if switching from another tab)
      if (this.currentTab && this.currentTab.id !== tabId) {
        await this.recordTabSwitch(this.currentTab, tab);
      }

      // Finalize previous page
      await this.finalizeCurrentPage();

      // Start tracking new page
      this.startNewPage(tab);
    } catch (error) {
      console.error('[ActivityTracker] Tab switch error:', error);
    }
  }

  private async handlePageLoad(tab: chrome.tabs.Tab): Promise<void> {
    if (!tab.url) return;
    
    const sanitizedUrl = sanitizeUrl(tab.url);

    // Skip if we just processed this exact URL on this tab (prevents duplicate SPA events)
    if (this.lastProcessedUrl === sanitizedUrl && this.currentTab?.id === tab.id) {
      if (this.currentTab) {
        this.currentTab.title = tab.title || this.currentTab.title;
      }
      return;
    }

    // If URL changed on current tab, treat as new page
    if (this.currentTab && sanitizedUrl !== this.currentTab.url) {
      console.log(`[ActivityTracker] Page change detected: ${this.currentTab.url} -> ${sanitizedUrl}`);
      
      // Before finalizing, check if the current title is still the generic one or empty
      // Some SPAs update the title *after* the URL change.
      // If we are about to start a new page, the OLD page should keep its current title.
      await this.finalizeCurrentPage();

      // Check if new URL is trackable
      if (await this.exclusionManager.shouldTrackUrl(tab.url)) {
        // Special handling for YouTube: the title might still be the old one
        if (sanitizedUrl.includes('youtube.com/watch')) {
          // If the title still contains the old title or is "YouTube", we might need to wait
          // But instead of blocking, we'll start and let onUpdated fix it later.
          // However, we capture the most fresh title possible here.
          this.startNewPage(tab);
        } else {
          this.startNewPage(tab);
        }
      } else {
        this.currentTab = null;
        this.lastProcessedUrl = null;
      }
    } else if (this.currentTab) {
      // Just update title if it changed
      if (tab.title && tab.title !== this.currentTab.title) {
        console.log(`[ActivityTracker] Title update for ${this.currentTab.domain}: ${this.currentTab.title} -> ${tab.title}`);
        this.currentTab.title = tab.title;
      }
    }
  }

  private startNewPage(tab: chrome.tabs.Tab): void {
    this.currentTab = {
      id: tab.id || 0,
      windowId: tab.windowId || 0,
      url: sanitizeUrl(tab.url || ''),
      domain: extractDomain(tab.url || ''),
      path: extractPath(tab.url || ''),
      title: tab.title || '',
      isIncognito: tab.incognito || false,
    };
    this.currentPageStart = Date.now();
    this.activeTime = 0;
    this.lastActivityTime = Date.now();
    this.lastActiveTick = Date.now();
    this.lastProcessedUrl = this.currentTab.url;

    console.log('[ActivityTracker] Started tracking:', this.currentTab.domain);
  }

  private async finalizeCurrentPage(): Promise<void> {
    const tab = this.currentTab;
    const startTime = this.currentPageStart;
    
    if (!tab || !startTime) return;

    const now = Date.now();
    const totalTimeMs = now - startTime;
    
    // Ignore extremely short events with no active time (e.g., rapid tab switching)
    // Minimum 1 second of total time OR some active time
    if (totalTimeMs < 1000 && this.activeTime < 500) {
      console.log(`[ActivityTracker] Skipping brief event: ${tab.domain} (${totalTimeMs}ms)`);
      this.currentPageStart = null;
      this.activeTime = 0;
      return;
    }

    const idleTimeMs = Math.max(0, totalTimeMs - this.activeTime);

    console.log(`[ActivityTracker] Finalizing page: ${tab.domain}, totalTime=${(totalTimeMs/1000).toFixed(1)}s, activeTime=${(this.activeTime/1000).toFixed(1)}s`);

    const event: ActivityEvent = {
      eventId: generateEventId(),
      sessionId: this.sessionId,
      source: 'browser',
      activityType: 'webpage',
      timestamp: new Date(startTime).toISOString(),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(now).toISOString(),
      url: tab.url,
      domain: tab.domain,
      path: tab.path,
      title: tab.title,
      activeTime: Math.round(this.activeTime),
      idleTime: Math.round(idleTimeMs),
      tabId: tab.id,
      windowId: tab.windowId,
      isIncognito: tab.isIncognito,
      synced: false,
      syncAttempts: 0,
    };

    // Reset state before await to prevent double-finalization
    this.currentPageStart = null;
    this.activeTime = 0;
    // We only set currentTab to null if it's still the same one
    if (this.currentTab === tab) {
      this.currentTab = null;
    }

    await this.eventStorage.bufferEvent(event);
    console.log(`[ActivityTracker] Finalized and buffered: ${tab.domain}`);
  }

  private async recordTabSwitch(
    fromTab: CurrentTabInfo,
    toTab: chrome.tabs.Tab
  ): Promise<void> {
    const event: TabSwitchEvent = {
      eventId: generateEventId(),
      sessionId: this.sessionId,
      timestamp: getTimestamp(),
      fromTabId: fromTab.id,
      fromUrl: fromTab.url,
      fromDomain: fromTab.domain,
      toTabId: toTab.id || 0,
      toUrl: sanitizeUrl(toTab.url || ''),
      toDomain: extractDomain(toTab.url || ''),
      synced: false,
    };

    await this.eventStorage.bufferEvent(event);
  }

  // =====================
  // NAVIGATION TRACKING
  // =====================

  private setupNavigationListeners(): void {
    // Fires when navigation is committed
    chrome.webNavigation.onCommitted.addListener(async (details) => {
      if (this.isPaused || !(await this.shouldTrack())) return;

      // Only track main frame (not iframes)
      if (details.frameId !== 0) return;

      // This catches URL changes that tabs.onUpdated might miss
      if (this.currentTab?.id === details.tabId) {
        try {
          const tab = await chrome.tabs.get(details.tabId);
          await this.handlePageLoad(tab);
        } catch {
          // Tab may have been closed
        }
      }
    });

    // Handle SPA (Single Page App) navigations like YouTube video changes
    chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
      if (this.isPaused || !(await this.shouldTrack())) return;
      if (details.frameId !== 0) return;

      if (this.currentTab?.id === details.tabId) {
        try {
          const tab = await chrome.tabs.get(details.tabId);
          await this.handlePageLoad(tab);
        } catch {
          // Tab may have been closed
        }
      }
    });
  }

  // =====================
  // IDLE DETECTION
  // =====================

  private setupIdleListeners(): void {
    // Set idle detection threshold
    chrome.idle.setDetectionInterval(this.idleThreshold);

    // Listen for idle state changes
    chrome.idle.onStateChanged.addListener(async (newState) => {
      if (this.isPaused) return;

      await this.handleIdleStateChange(newState);
    });
  }

  private async handleIdleStateChange(
    newState: 'active' | 'idle' | 'locked'
  ): Promise<void> {
    const previousState = this.isUserActive ? 'active' : 'idle';
    const mappedNewState =
      newState === 'active' ? 'active' : newState === 'idle' ? 'idle' : 'locked';

    this.isUserActive = newState === 'active';

    // Only track idle events if consent allows
    const canTrackIdle = await this.consentManager.canTrackIdle();
    if (!canTrackIdle) return;

    // Record idle state change
    const event: IdleStateEvent = {
      eventId: generateEventId(),
      sessionId: this.sessionId,
      timestamp: getTimestamp(),
      previousState: previousState,
      newState: mappedNewState,
      activeTabId: this.currentTab?.id || null,
      activeUrl: this.currentTab?.url || null,
      synced: false,
    };

    await this.eventStorage.bufferEvent(event);

    // If returning from idle, resume activity timer
    if (newState === 'active') {
      this.lastActivityTime = Date.now();
    }

    console.log(`[ActivityTracker] Idle state: ${previousState} -> ${mappedNewState}`);
  }

  // =====================
  // WINDOW FOCUS TRACKING
  // =====================

  private setupWindowListeners(): void {
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (this.isPaused || !(await this.shouldTrack())) return;

      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus - user switched to another app
        this.isUserActive = false;
      } else {
        // Browser gained focus
        this.isUserActive = true;
        this.lastActivityTime = Date.now();

        // Update current tab in case it changed
        try {
          const [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
          if (tab && tab.id && tab.id !== this.currentTab?.id) {
            await this.handleTabSwitch(tab.id, windowId);
          }
        } catch {
          // Window may have been closed
        }
      }
    });
  }

  // =====================
  // ACTIVITY TIME TRACKING
  // =====================

  private startActivityTimer(): void {
    // Clear any existing timer
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }

    console.log('[ActivityTracker] Starting activity timer, isUserActive:', this.isUserActive);

    // Check activity every 500ms for better precision
    this.activityCheckInterval = setInterval(() => {
      if (this.isPaused || !this.currentTab || !this.currentPageStart) {
        this.lastActiveTick = Date.now();
        return;
      }

      const now = Date.now();
      const delta = now - this.lastActiveTick;

      if (this.isUserActive) {
        // Increment active time in milliseconds
        this.activeTime += delta;
        this.lastActivityTime = now;
      }
      
      this.lastActiveTick = now;
    }, 500);
  }

  // =====================
  // HELPERS
  // =====================

  private async shouldTrack(): Promise<boolean> {
    return await this.consentManager.canTrack();
  }

  private async captureInitialState(): Promise<void> {
    try {
      // Query current idle state to properly initialize isUserActive
      const idleState = await chrome.idle.queryState(this.idleThreshold);
      this.isUserActive = idleState === 'active';
      console.log('[ActivityTracker] Initial idle state:', idleState, 'isUserActive:', this.isUserActive);

      // Check if current window has focus
      const currentWindow = await chrome.windows.getCurrent();
      if (!currentWindow.focused) {
        this.isUserActive = false;
        console.log('[ActivityTracker] Browser window not focused, setting isUserActive to false');
      }

      // Get initial active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && (await this.exclusionManager.shouldTrackUrl(tab.url))) {
        // Check incognito
        if (tab.incognito && !(await this.consentManager.canTrackIncognito())) {
          return;
        }
        this.startNewPage(tab);
      }
    } catch (error) {
      console.error('[ActivityTracker] Initial state error:', error);
    }
  }

  /**
   * Get current tracking status
   */
  getStatus(): TrackerStatus {
    const idleDuration = Math.floor((Date.now() - this.lastActivityTime) / 1000);
    return {
      isTracking: !this.isPaused && this.initialized,
      currentPage: this.currentTab
        ? {
            url: this.currentTab.url,
            domain: this.currentTab.domain,
            title: this.currentTab.title,
            activeTime: this.activeTime,
          }
        : null,
      isUserActive: this.isUserActive,
      hasSession: !!this.sessionId,
      isPaused: this.isPaused,
      idleDuration,
    };
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
    await this.finalizeCurrentPage();
    this.initialized = false;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let trackerInstance: ActivityTracker | null = null;

/**
 * Get the singleton activity tracker instance
 */
export function getActivityTracker(): ActivityTracker {
  if (!trackerInstance) {
    trackerInstance = new ActivityTracker();
  }
  return trackerInstance;
}
