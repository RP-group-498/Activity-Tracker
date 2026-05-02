import { Session, TabActivity, SessionMessage } from '../types';
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
import {
  getNativeMessagingService,
  getConsentManager,
  getActivityTracker,
  getEventStorageManager,
  prepareAndSanitizeBatch,
} from '../services';

// ============================================================================
// New Services Integration
// ============================================================================

const nativeMessaging = getNativeMessagingService();
const consentManager = getConsentManager();
const activityTracker = getActivityTracker();
const eventStorage = getEventStorageManager();

// Current session info from desktop app (stored in closure for native messaging callbacks)

/**
 * Initialize the new services for desktop app integration
 */
async function initializeNewServices() {
  try {
    // Initialize consent manager
    await consentManager.initialize();

    // Check if we have consent - auto-grant for research app if not yet decided
    const hasConsent = await consentManager.hasValidConsent();
    if (!hasConsent) {
      const wasDeclined = await consentManager.wasDeclined();
      if (!wasDeclined) {
        // Auto-grant consent for research app (user hasn't explicitly declined)
        await consentManager.grantConsent({
          trackBrowsing: true,
          trackIdleTime: true,
          trackIncognito: false,
          shareAnonymousStats: false,
        });
        console.log('[ServiceWorker] Auto-granted consent for research tracking');
      } else {
        console.log('[ServiceWorker] Consent was declined - tracking disabled');
      }
    }

    // Initialize event storage
    await eventStorage.initialize();

    // Initialize activity tracker (handles its own consent checking)
    await activityTracker.initialize();

    // Set up native messaging callbacks
    nativeMessaging.setSessionUpdateCallback((session: SessionMessage) => {
      activityTracker.setSessionId(session.sessionId);
      StorageManager.updateExtensionState({ isConnected: true });
      StorageManager.setLastError(null); // Clear any stale error from previous disconnects
      console.log('[ServiceWorker] Desktop session started:', session.sessionId);

      // Sync any pending events
      syncPendingEvents();
    });

    nativeMessaging.setConnectionChangeCallback(async (isConnected: boolean) => {
      await StorageManager.updateExtensionState({ isConnected });
      if (isConnected) {
        await StorageManager.setLastError(null); // Clear stale errors
        await syncPendingEvents();
      } else {
        activityTracker.setSessionId(null);
      }
    });

    nativeMessaging.setErrorCallback(async (error: string | null) => {
      await StorageManager.setLastError(error);
      if (error) {
        console.error('[ServiceWorker] Native messaging error:', error);
      }
    });

    nativeMessaging.setCommandCallback(async (command) => {
      switch (command) {
        case 'pause':
          await activityTracker.pause();
          await StorageManager.updateExtensionState({ isPaused: true });
          break;
        case 'resume':
          await activityTracker.resume();
          await StorageManager.updateExtensionState({ isPaused: false });
          break;
        case 'clear_local':
          await eventStorage.clearPendingEvents();
          break;
      }
    });

    // Set up ACK callback to mark events as synced in storage
    nativeMessaging.setAckCallback(async (eventIds: string[]) => {
      const syncedCount = await eventStorage.markEventsSynced(eventIds);
      console.log(`[ServiceWorker] Marked ${syncedCount} events as synced`);
    });

    // Attempt to connect to desktop app
    nativeMessaging.connect();

    // Set up periodic sync (every 30 seconds)
    chrome.alarms.create('syncEvents', { periodInMinutes: 0.16 }); // ~10 seconds

    // Set up heartbeat (every 60 seconds)
    chrome.alarms.create('heartbeat', { periodInMinutes: 1 });

    // Set up periodic reconnect check (every 2 minutes)
    // This ensures reconnection even if the service worker was restarted
    // and in-memory reconnect timers were lost
    chrome.alarms.create('reconnectDesktop', { periodInMinutes: 2 });

    console.log('[ServiceWorker] New services initialized');
  } catch (error) {
    console.error('[ServiceWorker] Failed to initialize new services:', error);
  }
}

/**
 * Sync pending events to desktop app
 */
async function syncPendingEvents() {
  const status = nativeMessaging.getConnectionStatus();
  if (!status.isConnected) return;

  const events = await eventStorage.getPendingActivityEvents();
  if (events.length === 0) return;

  // Enrich and sanitize events before sending
  const enrichedEvents = prepareAndSanitizeBatch(events);

  // Send in batches of 50
  const batchSize = 50;
  for (let i = 0; i < enrichedEvents.length; i += batchSize) {
    const batch = enrichedEvents.slice(i, i + batchSize);
    const success = nativeMessaging.sendActivityBatch(batch);
    if (!success) {
      console.log('[ServiceWorker] Batch send failed, will retry later');
      break;
    }
  }
}

// ============================================================================
// Legacy TabTracker (for backward compatibility)
// ============================================================================

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

    // Alarm listener for periodic saves and new features
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'saveSession') {
        await this.saveCurrentSession();
      } else if (alarm.name === 'cleanupOldData') {
        const settings = await StorageManager.getSettings();
        await StorageManager.clearOldData(settings.dataRetentionDays);
      } else if (alarm.name === 'syncEvents') {
        await syncPendingEvents();
      } else if (alarm.name === 'heartbeat') {
        const count = await eventStorage.getPendingCount();
        const status = activityTracker.getStatus();
        nativeMessaging.sendHeartbeat(count, status.currentPage || undefined);
      } else if (alarm.name === 'reconnectDesktop') {
        // Periodic reconnect check - handles service worker restarts
        if (!nativeMessaging.isDesktopConnected()) {
          console.log('[ServiceWorker] Periodic reconnect check: not connected, attempting...');
          nativeMessaging.resetReconnectAttempts();
          nativeMessaging.connect();
        }
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

// Initialize both legacy and new services
async function initializeAll() {
  await tracker.initialize();
  await initializeNewServices();
}

initializeAll();

// Handle service worker lifecycle
chrome.runtime.onInstalled.addListener(() => {
  console.log('[ServiceWorker] Extension installed/updated');
  initializeAll();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[ServiceWorker] Browser started');
  initializeAll();
});

// Listen for messages from popup/options pages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      // Legacy session actions
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
        await eventStorage.clearPendingEvents();
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
      // ============================================================================
      // New actions for desktop app integration
      // ============================================================================
      else if (message.action === 'getExtensionState') {
        const state = await StorageManager.getExtensionState();
        sendResponse({ success: true, data: state });
      } else if (message.action === 'getConnectionStatus') {
        const status = nativeMessaging.getConnectionStatus();
        sendResponse({ success: true, data: status });
      } else if (message.action === 'togglePause') {
        const state = await StorageManager.getExtensionState();
        const newPaused = !state.isPaused;
        if (newPaused) {
          await activityTracker.pause();
        } else {
          await activityTracker.resume();
        }
        await StorageManager.updateExtensionState({ isPaused: newPaused });
        sendResponse({ success: true, data: { isPaused: newPaused } });
      } else if (message.action === 'getPendingEventsCount') {
        const count = await eventStorage.getPendingCount();
        sendResponse({ success: true, data: { count } });
      } else if (message.action === 'getDataSummary') {
        const summary = await eventStorage.getDataSummary();
        sendResponse({ success: true, data: summary });
      } else if (message.action === 'getStats') {
        const stats = await StorageManager.getStats();
        sendResponse({ success: true, data: stats });
      } else if (message.action === 'forceSyncEvents') {
        await syncPendingEvents();
        sendResponse({ success: true });
      }
      // Consent actions
      else if (message.action === 'getConsentStatus') {
        const hasConsent = await consentManager.hasValidConsent();
        const consentData = await consentManager.getConsentData();
        sendResponse({ success: true, data: { hasConsent, consentData } });
      } else if (message.action === 'grantConsent') {
        const consent = await consentManager.grantConsent(message.options);
        // Re-initialize activity tracker with new consent
        await activityTracker.initialize();
        sendResponse({ success: true, data: consent });
      } else if (message.action === 'revokeConsent') {
        await consentManager.revokeConsent(message.clearData ?? true);
        sendResponse({ success: true });
      } else if (message.action === 'updateConsentOption') {
        await consentManager.updateConsentOption(message.option, message.value);
        sendResponse({ success: true });
      }
      // Exclusion actions
      else if (message.action === 'getExcludedDomains') {
        const { getExclusionManager } = await import('../services');
        const exclusions = await getExclusionManager().getExcludedDomains();
        sendResponse({ success: true, data: exclusions });
      } else if (message.action === 'addExclusion') {
        const { getExclusionManager } = await import('../services');
        await getExclusionManager().addExclusion(message.domain);
        sendResponse({ success: true });
      } else if (message.action === 'removeExclusion') {
        const { getExclusionManager } = await import('../services');
        const removed = await getExclusionManager().removeExclusion(message.domain);
        sendResponse({ success: true, data: { removed } });
      }
      // Tracker status
      else if (message.action === 'getTrackerStatus') {
        const status = activityTracker.getStatus();
        sendResponse({ success: true, data: status });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();
  return true; // Keep message channel open for async response
});

console.log('Focus App Monitor service worker loaded');
