# Native Messaging Implementation

## Purpose
This file covers implementing Chrome Native Messaging to communicate with the Electron.js desktop application. Use this when working on desktop app connectivity.

---

## Overview

Native Messaging allows the browser extension to communicate with a native application (your Electron desktop app) installed on the user's computer.

```
┌─────────────────┐     Native Messaging     ┌─────────────────┐
│                 │  ←─────────────────────→ │                 │
│ Browser Extension│     (JSON over stdio)    │  Desktop App    │
│                 │                           │  (Electron.js)  │
└─────────────────┘                           └─────────────────┘
```

---

## Step 1: Manifest Configuration

Add to your `manifest.json`:

```json
{
  "permissions": [
    "nativeMessaging"
  ],
  "externally_connectable": {
    "ids": ["*"]
  }
}
```

---

## Step 2: Native Messaging Host (Desktop App Side)

The desktop app needs to register a native messaging host. This is configured via a JSON manifest file.

### Host Manifest Location:
- **Windows**: `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.focusapp.monitor`
- **macOS**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.focusapp.monitor.json`
- **Linux**: `~/.config/google-chrome/NativeMessagingHosts/com.focusapp.monitor.json`

### Host Manifest Content (`com.focusapp.monitor.json`):
```json
{
  "name": "com.focusapp.monitor",
  "description": "Focus App Behavioral Monitor",
  "path": "/path/to/your/electron/app/native-host.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

> **Note**: The desktop app installer should create this file automatically.

---

## Step 3: Connection Manager (Extension Side)

Create `src/services/nativeMessaging.js`:

```javascript
/**
 * Native Messaging Service
 * Handles communication with the desktop application
 */

const HOST_NAME = 'com.focusapp.monitor';

class NativeMessagingService {
  constructor() {
    this.port = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // ms
    this.messageQueue = [];
    this.pendingAcks = new Map();
    
    // Callbacks
    this.onSessionUpdate = null;
    this.onConnectionChange = null;
    this.onError = null;
  }

  /**
   * Initialize connection to desktop app
   */
  connect() {
    if (this.isConnected) {
      console.log('[NativeMsg] Already connected');
      return;
    }

    try {
      this.port = chrome.runtime.connectNative(HOST_NAME);
      
      this.port.onMessage.addListener((message) => {
        this._handleMessage(message);
      });

      this.port.onDisconnect.addListener(() => {
        this._handleDisconnect();
      });

      // Send initial connection message
      this._send({
        type: 'connect',
        extensionId: chrome.runtime.id,
        extensionVersion: chrome.runtime.getManifest().version,
        timestamp: new Date().toISOString()
      });

      console.log('[NativeMsg] Connection initiated');
      
    } catch (error) {
      console.error('[NativeMsg] Connection failed:', error);
      this._handleDisconnect();
    }
  }

  /**
   * Handle incoming messages from desktop app
   */
  _handleMessage(message) {
    console.log('[NativeMsg] Received:', message.type);

    switch (message.type) {
      case 'session':
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (this.onSessionUpdate) {
          this.onSessionUpdate(message);
        }
        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }
        // Flush queued messages
        this._flushQueue();
        break;

      case 'ack':
        // Mark events as synced
        if (message.receivedEventIds) {
          message.receivedEventIds.forEach(id => {
            this.pendingAcks.delete(id);
          });
        }
        break;

      case 'command':
        this._handleCommand(message.command);
        break;

      case 'error':
        console.error('[NativeMsg] Desktop app error:', message.error);
        if (this.onError) {
          this.onError(message.error);
        }
        break;

      default:
        console.warn('[NativeMsg] Unknown message type:', message.type);
    }
  }

  /**
   * Handle disconnect from desktop app
   */
  _handleDisconnect() {
    const error = chrome.runtime.lastError;
    console.log('[NativeMsg] Disconnected:', error?.message || 'Unknown reason');

    this.port = null;
    this.isConnected = false;

    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }

    // Attempt reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[NativeMsg] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('[NativeMsg] Max reconnect attempts reached');
      if (this.onError) {
        this.onError('Desktop app not available. Data will be stored locally.');
      }
    }
  }

  /**
   * Handle commands from desktop app
   */
  _handleCommand(command) {
    switch (command) {
      case 'pause':
        chrome.storage.local.set({ 'extensionState.isPaused': true });
        break;
      case 'resume':
        chrome.storage.local.set({ 'extensionState.isPaused': false });
        break;
      case 'clear_local':
        chrome.storage.local.set({ pendingEvents: [] });
        break;
    }
  }

  /**
   * Send message to desktop app
   */
  _send(message) {
    if (this.port && this.isConnected) {
      try {
        this.port.postMessage(message);
        return true;
      } catch (error) {
        console.error('[NativeMsg] Send failed:', error);
        this.messageQueue.push(message);
        return false;
      }
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      return false;
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  _flushQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this._send(message);
    }
  }

  /**
   * Send activity events to desktop app
   */
  sendActivityBatch(events) {
    if (!events || events.length === 0) return;

    const message = {
      type: 'activity_batch',
      events: events,
      extensionVersion: chrome.runtime.getManifest().version,
      timestamp: new Date().toISOString()
    };

    // Track pending acknowledgments
    events.forEach(event => {
      this.pendingAcks.set(event.eventId, event);
    });

    return this._send(message);
  }

  /**
   * Send heartbeat to desktop app
   */
  sendHeartbeat(pendingCount) {
    return this._send({
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      pendingEvents: pendingCount
    });
  }

  /**
   * Check if connected to desktop app
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      pendingMessages: this.messageQueue.length,
      pendingAcks: this.pendingAcks.size
    };
  }

  /**
   * Disconnect from desktop app
   */
  disconnect() {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.isConnected = false;
  }
}

// Export singleton instance
export const nativeMessaging = new NativeMessagingService();
```

---

## Step 4: Integration with Background Script

In your `background.js` (service worker):

```javascript
import { nativeMessaging } from './services/nativeMessaging.js';
import { activityTracker } from './services/activityTracker.js';
import { storageManager } from './services/storageManager.js';

// Current session info
let currentSession = null;

// Initialize on extension load
chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

function initializeExtension() {
  // Set up native messaging callbacks
  nativeMessaging.onSessionUpdate = (session) => {
    currentSession = {
      sessionId: session.sessionId,
      userId: session.userId,
      startTime: new Date().toISOString()
    };
    chrome.storage.local.set({ currentSession });
    console.log('[BG] Session started:', session.sessionId);
  };

  nativeMessaging.onConnectionChange = (isConnected) => {
    chrome.storage.local.set({ 
      'extensionState.isConnected': isConnected 
    });
    
    if (isConnected) {
      // Sync any pending events
      syncPendingEvents();
    }
  };

  nativeMessaging.onError = (error) => {
    chrome.storage.local.set({ 'stats.lastError': error });
  };

  // Connect to desktop app
  nativeMessaging.connect();

  // Set up periodic sync (every 30 seconds)
  setInterval(syncPendingEvents, 30000);

  // Set up heartbeat (every 60 seconds)
  setInterval(() => {
    chrome.storage.local.get('pendingEvents', (data) => {
      const count = data.pendingEvents?.length || 0;
      nativeMessaging.sendHeartbeat(count);
    });
  }, 60000);
}

async function syncPendingEvents() {
  const data = await chrome.storage.local.get('pendingEvents');
  const events = data.pendingEvents || [];
  
  if (events.length === 0) return;

  const status = nativeMessaging.getConnectionStatus();
  
  if (status.isConnected) {
    // Send in batches of 50
    const batchSize = 50;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      nativeMessaging.sendActivityBatch(batch);
    }
  } else {
    // Not connected, data stays in local storage
    console.log('[BG] Not connected, keeping', events.length, 'events locally');
  }
}

// Export for use by content scripts/popup
export function getCurrentSession() {
  return currentSession;
}
```

---

## Step 5: Error Handling & Offline Mode

When desktop app is unavailable:

```javascript
// In storageManager.js
export async function bufferEvent(event) {
  const data = await chrome.storage.local.get(['pendingEvents', 'stats']);
  const events = data.pendingEvents || [];
  const stats = data.stats || { totalEventsCaptured: 0 };

  // Add to buffer
  events.push(event);
  stats.totalEventsCaptured++;

  // Enforce buffer limit (1000 events max)
  if (events.length > 1000) {
    events.shift(); // Remove oldest
    console.warn('[Storage] Buffer full, dropped oldest event');
  }

  await chrome.storage.local.set({ 
    pendingEvents: events,
    stats: stats
  });
}

export async function markEventsSynced(eventIds) {
  const data = await chrome.storage.local.get(['pendingEvents', 'stats']);
  let events = data.pendingEvents || [];
  const stats = data.stats || { totalEventsSynced: 0 };

  // Remove synced events
  const syncedSet = new Set(eventIds);
  events = events.filter(e => !syncedSet.has(e.eventId));
  stats.totalEventsSynced += eventIds.length;

  await chrome.storage.local.set({ 
    pendingEvents: events,
    stats: stats 
  });
}
```

---

## Testing Native Messaging

1. **Check if host is registered:**
   - Chrome: `chrome://apps` → Developer mode → Check native messaging hosts

2. **Debug messages:**
   - Add `console.log` in both extension and desktop app
   - Check Chrome DevTools for extension background page
   - Check Electron DevTools for desktop app

3. **Common errors:**
   - "Native host has exited" → Desktop app crashed or path wrong
   - "Specified native messaging host not found" → Manifest not registered
   - "Access to the specified native messaging host is forbidden" → Extension ID mismatch

---

## Security Notes

1. Always validate messages from desktop app
2. Never trust `sessionId` without verification
3. The desktop app should validate extension ID from the host manifest
4. Use the connection message to establish trust on both sides
