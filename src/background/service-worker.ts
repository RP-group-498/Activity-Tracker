import { Session, TabActivity } from '../types';
import { StorageManager } from '../utils/storage';
import {
  generateUUID,
  getDomainFromUrl,
  categorizeDomain,
  getDetailedClassification,
  isSensitiveUrl,
  sanitizeUrl,
} from '../utils/helpers';
import {
  initializeClassificationService,
  getClassificationService,
} from '../classification';

class TabTracker {
  private currentSession: Session | null = null;
  private activeTabId: number | null = null;
  private tabStartTimes: Map<number, number> = new Map();

  async initialize() {
    // Initialize the classification service
    try {
      await initializeClassificationService();
      console.log('Classification service initialized');
    } catch (error) {
      console.error('Failed to initialize classification service:', error);
      // Continue without classification service - will use fallback
    }

    // Load or create current session
    this.currentSession = await StorageManager.getCurrentSession();
    if (!this.currentSession) {
      await this.startNewSession();
    }

    // Set up event listeners
    this.setupListeners();

    // Set up periodic saves
    chrome.alarms.create('saveSession', { periodInMinutes: 1 });
    chrome.alarms.create('cleanupOldData', { periodInMinutes: 60 });

    console.log('Tab Tracker initialized');
  }

  private async startNewSession() {
    this.currentSession = {
      sessionId: generateUUID(),
      startTime: Date.now(),
      endTime: null,
      tabs: [],
    };
    await StorageManager.setCurrentSession(this.currentSession);
    console.log('New session started:', this.currentSession.sessionId);
  }

  private setupListeners() {
    // Tab activation
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.handleTabChange(activeInfo.tabId);
    });

    // Tab updates (URL changes, title changes)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        await this.handleTabChange(tabId);
      }
    });

    // Tab removal
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      await this.stopTrackingTab(tabId);
    });

    // Window focus change
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        await this.pauseTracking();
      } else {
        // Browser gained focus
        await this.resumeTracking();
      }
    });

    // Idle detection
    chrome.idle.onStateChanged.addListener(async (state) => {
      if (state === 'idle' || state === 'locked') {
        await this.pauseTracking();
      } else {
        await this.resumeTracking();
      }
    });

    // Alarm listener for periodic saves
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'saveSession') {
        await this.saveCurrentSession();
      } else if (alarm.name === 'cleanupOldData') {
        const settings = await StorageManager.getSettings();
        await StorageManager.clearOldData(settings.dataRetentionDays);
      }
    });
  }

  private async handleTabChange(tabId: number) {
    const settings = await StorageManager.getSettings();
    if (!settings.trackingEnabled) return;

    // Stop tracking previous tab
    if (this.activeTabId !== null && this.activeTabId !== tabId) {
      await this.stopTrackingTab(this.activeTabId);
    }

    // Start tracking new tab
    await this.startTrackingTab(tabId);
  }

  private async startTrackingTab(tabId: number) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return;
      }

      const settings = await StorageManager.getSettings();
      const domain = getDomainFromUrl(tab.url);

      // Check if URL is sensitive
      if (isSensitiveUrl(tab.url)) {
        console.log('Skipping sensitive URL:', domain);
        return;
      }

      this.activeTabId = tabId;
      this.tabStartTimes.set(tabId, Date.now());

      // Check if this tab already exists in current session
      const existingTabIndex = this.currentSession!.tabs.findIndex(
        t => t.url === sanitizeUrl(tab.url || '') && t.tabId === tabId
      );

      if (existingTabIndex === -1) {
        // Get classification info
        const detailedClassification = getDetailedClassification(domain, settings);

        // Create new tab activity
        const tabActivity: TabActivity = {
          url: sanitizeUrl(tab.url || ''),
          domain,
          title: tab.title || '',
          timeSpent: 0,
          activePeriods: [{
            start: Date.now(),
            end: null,
          }],
          interactions: {
            scrolls: 0,
            clicks: 0,
            typing: false,
          },
          category: categorizeDomain(domain, settings),
          classification: detailedClassification || undefined,
          tabId,
          windowId: tab.windowId,
        };

        this.currentSession!.tabs.push(tabActivity);
      } else {
        // Add new activity period to existing tab
        const tabActivity = this.currentSession!.tabs[existingTabIndex];
        tabActivity.activePeriods.push({
          start: Date.now(),
          end: null,
        });
      }

      console.log('Started tracking tab:', domain);
    } catch (error) {
      console.error('Error starting tab tracking:', error);
    }
  }

  private async stopTrackingTab(tabId: number) {
    if (!this.currentSession) return;

    const startTime = this.tabStartTimes.get(tabId);
    if (!startTime) return;

    const timeSpent = Date.now() - startTime;

    // Find the tab activity and update it
    const tabActivity = this.currentSession.tabs.find(t => t.tabId === tabId);
    if (tabActivity) {
      tabActivity.timeSpent += timeSpent;

      // Close the last activity period
      const lastPeriod = tabActivity.activePeriods[tabActivity.activePeriods.length - 1];
      if (lastPeriod && lastPeriod.end === null) {
        lastPeriod.end = Date.now();
      }

      console.log(`Stopped tracking tab: ${tabActivity.domain}, time spent: ${timeSpent}ms`);
    }

    this.tabStartTimes.delete(tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }

    await this.saveCurrentSession();
  }

  private async pauseTracking() {
    if (this.activeTabId !== null) {
      await this.stopTrackingTab(this.activeTabId);
    }
  }

  private async resumeTracking() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await this.startTrackingTab(tab.id);
      }
    } catch (error) {
      console.error('Error resuming tracking:', error);
    }
  }

  private async saveCurrentSession() {
    if (this.currentSession) {
      await StorageManager.setCurrentSession(this.currentSession);
      console.log('Session saved:', this.currentSession.sessionId);
    }
  }

  async endCurrentSession() {
    if (this.currentSession) {
      // Stop tracking active tab
      if (this.activeTabId !== null) {
        await this.stopTrackingTab(this.activeTabId);
      }

      // Set end time
      this.currentSession.endTime = Date.now();

      // Save to sessions history
      await StorageManager.addSession(this.currentSession);

      // Clear current session
      await StorageManager.setCurrentSession(null);
      this.currentSession = null;

      console.log('Session ended');
    }
  }
}

// Initialize tracker when service worker starts
const tracker = new TabTracker();
tracker.initialize();

// Listen for messages from popup/options pages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'getCurrentSession') {
        const session = await StorageManager.getCurrentSession();
        sendResponse({ success: true, data: session });
      } else if (message.action === 'getSessions') {
        const sessions = await StorageManager.getSessions();
        sendResponse({ success: true, data: sessions });
      } else if (message.action === 'endSession') {
        await tracker.endCurrentSession();
        await tracker.initialize();
        sendResponse({ success: true });
      } else if (message.action === 'exportData') {
        const data = await StorageManager.exportData();
        sendResponse({ success: true, data });
      } else if (message.action === 'clearAllData') {
        await StorageManager.clearAllData();
        sendResponse({ success: true });
      } else if (message.action === 'updateSettings') {
        await StorageManager.setSettings(message.settings);
        sendResponse({ success: true });
      }
      // Classification-related actions
      else if (message.action === 'classifyDomain') {
        const service = getClassificationService();
        if (service.isInitialized()) {
          const classification = service.classify(message.domain);
          sendResponse({ success: true, data: classification });
        } else {
          sendResponse({ success: false, error: 'Classification service not initialized' });
        }
      } else if (message.action === 'getClassificationStats') {
        const service = getClassificationService();
        if (service.isInitialized()) {
          const metrics = service.getMetrics();
          const cacheStats = service.getCacheStats();
          const dbStats = service.getDatabaseStats();
          sendResponse({
            success: true,
            data: { metrics, cacheStats, dbStats },
          });
        } else {
          sendResponse({ success: false, error: 'Classification service not initialized' });
        }
      } else if (message.action === 'setUserOverride') {
        const service = getClassificationService();
        if (service.isInitialized()) {
          service.setUserOverride(message.domain, message.category);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Classification service not initialized' });
        }
      } else if (message.action === 'removeUserOverride') {
        const service = getClassificationService();
        if (service.isInitialized()) {
          const removed = service.removeUserOverride(message.domain);
          sendResponse({ success: true, data: { removed } });
        } else {
          sendResponse({ success: false, error: 'Classification service not initialized' });
        }
      } else if (message.action === 'exportUserOverrides') {
        const service = getClassificationService();
        if (service.isInitialized()) {
          const overrides = service.exportUserOverrides();
          sendResponse({ success: true, data: overrides });
        } else {
          sendResponse({ success: false, error: 'Classification service not initialized' });
        }
      } else if (message.action === 'importUserOverrides') {
        const service = getClassificationService();
        if (service.isInitialized()) {
          await service.importUserOverrides(message.overrides);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Classification service not initialized' });
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();
  return true; // Keep message channel open for async response
});

console.log('Behavior Tracker service worker loaded');
