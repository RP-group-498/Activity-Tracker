# Quick Reference Cheatsheet

## Purpose
Fast lookup for common patterns. Use this for quick code snippets without loading full documentation.

---

## Chrome Extension APIs - Quick Patterns

### Get Active Tab
```javascript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
// tab.url, tab.title, tab.id
```

### Listen for Tab Changes
```javascript
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  chrome.tabs.get(tabId, (tab) => { /* tab.url, tab.title */ });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') { /* page loaded */ }
});
```

### Storage
```javascript
// Save
await chrome.storage.local.set({ key: value });

// Load
const { key } = await chrome.storage.local.get('key');

// Load multiple
const data = await chrome.storage.local.get(['key1', 'key2']);

// Load all
const all = await chrome.storage.local.get(null);
```

### Native Messaging
```javascript
// Connect
const port = chrome.runtime.connectNative('com.focusapp.monitor');

// Send
port.postMessage({ type: 'data', payload: {...} });

// Receive
port.onMessage.addListener((msg) => { /* handle */ });

// Disconnect handler
port.onDisconnect.addListener(() => {
  const error = chrome.runtime.lastError?.message;
});
```

### Idle Detection
```javascript
chrome.idle.setDetectionInterval(60); // seconds

chrome.idle.onStateChanged.addListener((state) => {
  // state: 'active' | 'idle' | 'locked'
});

// Query current state
chrome.idle.queryState(60, (state) => { /* ... */ });
```

---

## Data Structures - Quick Reference

### Activity Event (minimal)
```javascript
{
  eventId: generateEventId(),      // 'evt_' + uuid
  sessionId: session?.id || null,
  timestamp: new Date().toISOString(),
  url: tab.url,
  domain: extractDomain(tab.url),
  title: tab.title,
  activeTime: 0,    // seconds
  synced: false
}
```

### Message to Desktop App
```javascript
{
  type: 'activity_batch',
  events: [...],
  timestamp: new Date().toISOString()
}
```

### Message from Desktop App
```javascript
{ type: 'session', sessionId: '...', userId: '...' }
{ type: 'ack', receivedEventIds: ['evt_1', 'evt_2'] }
{ type: 'command', command: 'pause' | 'resume' }
```

---

## Utility Functions

```javascript
// Generate ID
const generateEventId = () => 'evt_' + crypto.randomUUID().slice(0, 12);

// Extract domain
const extractDomain = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
};

// Check if trackable URL
const isTrackable = (url) => 
  url && !['chrome://', 'chrome-extension://', 'about:', 'file://']
    .some(p => url.startsWith(p));

// Timestamp
const timestamp = () => new Date().toISOString();
```

---

## Common Patterns

### Debounce Page Updates
```javascript
let debounceTimer;
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    handlePageUpdate(tab);
  }, 300);
});
```

### Batch Events for Sync
```javascript
async function batchAndSync() {
  const { pendingEvents } = await chrome.storage.local.get('pendingEvents');
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < pendingEvents.length; i += BATCH_SIZE) {
    const batch = pendingEvents.slice(i, i + BATCH_SIZE);
    await sendBatch(batch);
  }
}
```

### Handle Service Worker Wake
```javascript
// MV3 service workers can sleep - restore state on wake
chrome.runtime.onStartup.addListener(async () => {
  const { extensionState } = await chrome.storage.local.get('extensionState');
  if (extensionState?.isConnected) {
    nativeMessaging.connect(); // Reconnect
  }
});
```

---

## File Structure Reference

```
src/
├── manifest.json
├── background.js          # Service worker (MV3)
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── onboarding/
│   ├── onboarding.html
│   └── onboarding.js
└── services/
    ├── activityTracker.js   # Tab/URL tracking
    ├── nativeMessaging.js   # Desktop app communication
    ├── storageManager.js    # Local storage operations
    ├── consentManager.js    # Privacy/consent
    ├── exclusionManager.js  # Domain exclusions
    └── utils.js             # Helper functions
```

---

## Manifest.json Template

```json
{
  "manifest_version": 3,
  "name": "Focus App Monitor",
  "version": "1.0.0",
  "description": "Behavioral monitoring for procrastination research",
  
  "permissions": [
    "tabs",
    "webNavigation", 
    "idle",
    "storage",
    "nativeMessaging"
  ],
  
  "host_permissions": ["<all_urls>"],
  
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": "icons/icon48.png"
  },
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## Debug Commands

```javascript
// In DevTools console for background page

// View all storage
chrome.storage.local.get(null, console.log);

// Clear pending events
chrome.storage.local.set({ pendingEvents: [] });

// Check native messaging
chrome.runtime.connectNative('com.focusapp.monitor');

// Simulate idle state change
chrome.idle.onStateChanged.dispatch('idle');
```
