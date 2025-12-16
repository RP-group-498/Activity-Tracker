# Activity Tracking Implementation

## Purpose
This file covers capturing browser activity: URL visits, tab switches, time tracking, and idle detection. Use this when enhancing data collection features.

---

## Chrome APIs Used

| API | Purpose | Permission |
|-----|---------|------------|
| `chrome.tabs` | Track active tabs, get URL/title | `tabs` |
| `chrome.webNavigation` | Detect page loads/navigation | `webNavigation` |
| `chrome.idle` | Detect user idle state | `idle` |
| `chrome.windows` | Track window focus | `tabs` |

---

## Manifest Permissions

```json
{
  "permissions": [
    "tabs",
    "webNavigation",
    "idle",
    "storage",
    "nativeMessaging"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

---

## Activity Tracker Service

Create `src/services/activityTracker.js`:

```javascript
/**
 * Activity Tracker Service
 * Captures all browser activity events
 */

import { storageManager } from './storageManager.js';
import { generateEventId, extractDomain, extractPath, getTimestamp } from './utils.js';

class ActivityTracker {
  constructor() {
    // Current state
    this.currentTab = null;
    this.currentPageStart = null;
    this.activeTime = 0;
    this.isUserActive = true;
    this.isPaused = false;
    
    // Idle tracking
    this.idleThreshold = 60; // seconds
    this.lastActivityTime = Date.now();
    this.activityCheckInterval = null;
    
    // Session from desktop app
    this.sessionId = null;
  }

  /**
   * Initialize all tracking listeners
   */
  initialize() {
    this._setupTabListeners();
    this._setupNavigationListeners();
    this._setupIdleListeners();
    this._setupWindowListeners();
    this._startActivityTimer();
    
    // Get initial active tab
    this._captureInitialState();
    
    console.log('[ActivityTracker] Initialized');
  }

  /**
   * Set session ID (called when desktop app connects)
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  /**
   * Pause/resume tracking
   */
  setPaused(paused) {
    this.isPaused = paused;
    if (paused) {
      this._finalizeCurrentPage();
    }
  }

  // =====================
  // TAB TRACKING
  // =====================

  _setupTabListeners() {
    // Tab activated (user switched tabs)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      if (this.isPaused) return;
      this._handleTabSwitch(activeInfo.tabId, activeInfo.windowId);
    });

    // Tab updated (URL or title changed)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.isPaused) return;
      if (changeInfo.status === 'complete' && this.currentTab?.id === tabId) {
        this._handlePageLoad(tab);
      }
    });

    // Tab closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.currentTab?.id === tabId) {
        this._finalizeCurrentPage();
        this.currentTab = null;
      }
    });
  }

  async _handleTabSwitch(tabId, windowId) {
    try {
      // Finalize previous page
      await this._finalizeCurrentPage();

      // Get new tab info
      const tab = await chrome.tabs.get(tabId);
      
      // Skip chrome:// and other special URLs
      if (!this._isTrackableUrl(tab.url)) {
        this.currentTab = null;
        return;
      }

      // Record tab switch event
      if (this.currentTab) {
        await this._recordTabSwitch(this.currentTab, tab);
      }

      // Start tracking new page
      this._startNewPage(tab);
      
    } catch (error) {
      console.error('[ActivityTracker] Tab switch error:', error);
    }
  }

  _handlePageLoad(tab) {
    // If URL changed on current tab, treat as new page
    if (this.currentTab && tab.url !== this.currentTab.url) {
      this._finalizeCurrentPage();
      this._startNewPage(tab);
    } else if (this.currentTab) {
      // Just update title if it changed
      this.currentTab.title = tab.title;
    }
  }

  _startNewPage(tab) {
    this.currentTab = {
      id: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      domain: extractDomain(tab.url),
      path: extractPath(tab.url),
      title: tab.title || ''
    };
    this.currentPageStart = Date.now();
    this.activeTime = 0;
    this.lastActivityTime = Date.now();
  }

  async _finalizeCurrentPage() {
    if (!this.currentTab || !this.currentPageStart) return;

    const now = Date.now();
    const totalTime = (now - this.currentPageStart) / 1000;
    const idleTime = totalTime - this.activeTime;

    const event = {
      eventId: generateEventId(),
      sessionId: this.sessionId,
      source: 'browser',
      activityType: 'webpage',
      timestamp: new Date(this.currentPageStart).toISOString(),
      startTime: new Date(this.currentPageStart).toISOString(),
      endTime: new Date(now).toISOString(),
      url: this.currentTab.url,
      domain: this.currentTab.domain,
      path: this.currentTab.path,
      title: this.currentTab.title,
      activeTime: Math.round(this.activeTime),
      idleTime: Math.round(Math.max(0, idleTime)),
      tabId: this.currentTab.id,
      windowId: this.currentTab.windowId,
      isIncognito: false, // Set from tab.incognito if tracking
      synced: false,
      syncAttempts: 0
    };

    await storageManager.bufferEvent(event);
  }

  async _recordTabSwitch(fromTab, toTab) {
    const event = {
      eventId: generateEventId(),
      sessionId: this.sessionId,
      type: 'tab_switch',
      timestamp: getTimestamp(),
      fromTabId: fromTab.id,
      fromUrl: fromTab.url,
      fromDomain: fromTab.domain,
      toTabId: toTab.id,
      toUrl: toTab.url,
      toDomain: extractDomain(toTab.url),
      synced: false
    };

    await storageManager.bufferEvent(event);
  }

  // =====================
  // NAVIGATION TRACKING
  // =====================

  _setupNavigationListeners() {
    // Fires when navigation is committed
    chrome.webNavigation.onCommitted.addListener((details) => {
      if (this.isPaused) return;
      // Only track main frame (not iframes)
      if (details.frameId !== 0) return;
      
      // This catches URL changes that tabs.onUpdated might miss
      if (this.currentTab?.id === details.tabId) {
        chrome.tabs.get(details.tabId, (tab) => {
          if (chrome.runtime.lastError) return;
          this._handlePageLoad(tab);
        });
      }
    });
  }

  // =====================
  // IDLE DETECTION
  // =====================

  _setupIdleListeners() {
    // Set idle detection threshold
    chrome.idle.setDetectionInterval(this.idleThreshold);

    // Listen for idle state changes
    chrome.idle.onStateChanged.addListener((newState) => {
      if (this.isPaused) return;
      this._handleIdleStateChange(newState);
    });
  }

  async _handleIdleStateChange(newState) {
    const previousState = this.isUserActive ? 'active' : 'idle';
    this.isUserActive = (newState === 'active');

    // Record idle state change
    const event = {
      eventId: generateEventId(),
      sessionId: this.sessionId,
      type: 'idle_state',
      timestamp: getTimestamp(),
      previousState: previousState,
      newState: newState,
      activeTabId: this.currentTab?.id || null,
      activeUrl: this.currentTab?.url || null,
      synced: false
    };

    await storageManager.bufferEvent(event);

    // If returning from idle, resume activity timer
    if (newState === 'active') {
      this.lastActivityTime = Date.now();
    }
  }

  // =====================
  // WINDOW FOCUS TRACKING
  // =====================

  _setupWindowListeners() {
    // Track when browser window loses/gains focus
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (this.isPaused) return;
      
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus - user switched to another app
        this.isUserActive = false;
      } else {
        // Browser gained focus
        this.isUserActive = true;
        this.lastActivityTime = Date.now();
        
        // Update current tab in case it changed
        chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
          if (tabs[0] && tabs[0].id !== this.currentTab?.id) {
            this._handleTabSwitch(tabs[0].id, windowId);
          }
        });
      }
    });
  }

  // =====================
  // ACTIVITY TIME TRACKING
  // =====================

  _startActivityTimer() {
    // Check activity every second
    this.activityCheckInterval = setInterval(() => {
      if (this.isPaused || !this.currentTab) return;
      
      if (this.isUserActive) {
        // Increment active time
        this.activeTime += 1;
        this.lastActivityTime = Date.now();
      }
    }, 1000);
  }

  // =====================
  // HELPERS
  // =====================

  _isTrackableUrl(url) {
    if (!url) return false;
    
    const nonTrackable = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'file://',
      'devtools://'
    ];
    
    return !nonTrackable.some(prefix => url.startsWith(prefix));
  }

  async _captureInitialState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && this._isTrackableUrl(tab.url)) {
        this._startNewPage(tab);
      }
    } catch (error) {
      console.error('[ActivityTracker] Initial state error:', error);
    }
  }

  /**
   * Get current tracking status
   */
  getStatus() {
    return {
      isTracking: !this.isPaused,
      currentPage: this.currentTab ? {
        url: this.currentTab.url,
        domain: this.currentTab.domain,
        title: this.currentTab.title,
        activeTime: this.activeTime
      } : null,
      isUserActive: this.isUserActive,
      hasSession: !!this.sessionId
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }
    this._finalizeCurrentPage();
  }
}

// Export singleton
export const activityTracker = new ActivityTracker();
```

---

## Utility Functions

Create `src/services/utils.js`:

```javascript
/**
 * Generate unique event ID
 */
export function generateEventId() {
  return 'evt_' + crypto.randomUUID().substring(0, 12);
}

/**
 * Extract domain from URL
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Extract path from URL (without query params)
 */
export function extractPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/**
 * Get current ISO timestamp
 */
export function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Check if URL is likely academic
 * Used for quick filtering, NOT for final classification
 */
export function isLikelyAcademic(url, title) {
  const academicDomains = [
    'scholar.google', 'coursera.org', 'edx.org',
    'udemy.com', 'khanacademy.org', 'stackoverflow.com',
    'github.com', 'docs.google.com', 'notion.so'
  ];
  
  const domain = extractDomain(url);
  return academicDomains.some(d => domain.includes(d));
}
```

---

## Integration in Background Script

```javascript
// background.js
import { activityTracker } from './services/activityTracker.js';
import { nativeMessaging } from './services/nativeMessaging.js';

// Initialize when extension starts
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

function initialize() {
  // Initialize activity tracker
  activityTracker.initialize();
  
  // Set up native messaging and link session
  nativeMessaging.onSessionUpdate = (session) => {
    activityTracker.setSessionId(session.sessionId);
  };
  
  nativeMessaging.onConnectionChange = (connected) => {
    if (!connected) {
      // Still track, but without session ID
      // Data will be associated when connection restored
    }
  };
  
  nativeMessaging.connect();
}

// Handle extension suspend (MV3 service worker)
chrome.runtime.onSuspend.addListener(() => {
  activityTracker.destroy();
});
```

---

## Testing Checklist

- [ ] Page visits are captured with correct URL/title
- [ ] Time tracking starts when page becomes active
- [ ] Tab switches are recorded with from/to info
- [ ] Idle detection triggers after threshold (60s default)
- [ ] Window focus changes are detected
- [ ] chrome:// URLs are excluded
- [ ] Events are stored locally when desktop app disconnected
- [ ] Session ID is attached to events when available
