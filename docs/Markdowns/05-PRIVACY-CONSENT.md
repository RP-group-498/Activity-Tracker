# Privacy & User Consent Implementation

## Purpose
This file covers implementing privacy features, user consent flows, and data controls. Use this when working on privacy-related features.

---

## Privacy Principles

This system monitors user behavior, so privacy is critical:

1. **Opt-in by default** - Never track without explicit consent
2. **Transparency** - User can always see what's being tracked
3. **Control** - User can pause, exclude sites, or delete data anytime
4. **Minimization** - Only collect what's needed for classification
5. **Local-first** - Process locally when possible, minimize cloud data

---

## Consent Flow

### First-Time Setup

```javascript
// src/services/consentManager.js

class ConsentManager {
  constructor() {
    this.CONSENT_VERSION = '1.0'; // Increment when consent terms change
  }

  /**
   * Check if user has given valid consent
   */
  async hasValidConsent() {
    const data = await chrome.storage.local.get('consent');
    if (!data.consent) return false;
    
    // Check if consent version matches current
    return data.consent.version === this.CONSENT_VERSION && 
           data.consent.granted === true;
  }

  /**
   * Record user consent
   */
  async grantConsent(options = {}) {
    const consent = {
      granted: true,
      version: this.CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      options: {
        trackBrowsing: options.trackBrowsing ?? true,
        trackIdleTime: options.trackIdleTime ?? true,
        trackIncognito: options.trackIncognito ?? false,
        shareAnonymousStats: options.shareAnonymousStats ?? false
      }
    };
    
    await chrome.storage.local.set({ consent });
    return consent;
  }

  /**
   * Revoke consent and clear all data
   */
  async revokeConsent() {
    // Clear all stored data
    await chrome.storage.local.clear();
    
    // Reset to no consent
    await chrome.storage.local.set({
      consent: {
        granted: false,
        version: this.CONSENT_VERSION,
        revokedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Get current consent options
   */
  async getConsentOptions() {
    const data = await chrome.storage.local.get('consent');
    return data.consent?.options || null;
  }

  /**
   * Update specific consent option
   */
  async updateConsentOption(option, value) {
    const data = await chrome.storage.local.get('consent');
    if (data.consent?.options) {
      data.consent.options[option] = value;
      data.consent.lastModified = new Date().toISOString();
      await chrome.storage.local.set({ consent: data.consent });
    }
  }
}

export const consentManager = new ConsentManager();
```

---

## Onboarding UI

### Consent Screen (popup or dedicated page)

```html
<!-- onboarding.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Focus App Setup</title>
  <link rel="stylesheet" href="onboarding.css">
</head>
<body>
  <div class="container">
    <h1>Welcome to Focus App</h1>
    <p class="subtitle">Let's set up your productivity monitoring</p>
    
    <div class="consent-section">
      <h2>What we track</h2>
      <ul>
        <li>✓ Websites you visit (URL and page title)</li>
        <li>✓ Time spent on each site</li>
        <li>✓ When you're active vs idle</li>
      </ul>
      
      <h2>What we DON'T track</h2>
      <ul>
        <li>✗ Page content or text you read</li>
        <li>✗ Passwords or form data</li>
        <li>✗ Keystrokes or what you type</li>
        <li>✗ Personal files on your computer</li>
      </ul>
    </div>
    
    <div class="options-section">
      <h2>Your preferences</h2>
      
      <label class="checkbox-option">
        <input type="checkbox" id="trackIncognito">
        <span>Track incognito/private browsing</span>
        <small>Default: Off</small>
      </label>
      
      <label class="checkbox-option">
        <input type="checkbox" id="shareStats" checked>
        <span>Share anonymous statistics to improve the app</span>
        <small>No personal data, just usage patterns</small>
      </label>
    </div>
    
    <div class="privacy-note">
      <p>
        <strong>Your data stays local</strong> unless you connect to the 
        Focus desktop app. You can view, export, or delete your data anytime.
      </p>
    </div>
    
    <div class="actions">
      <button id="declineBtn" class="btn-secondary">No thanks</button>
      <button id="acceptBtn" class="btn-primary">Enable tracking</button>
    </div>
  </div>
  
  <script src="onboarding.js"></script>
</body>
</html>
```

```javascript
// onboarding.js
import { consentManager } from './services/consentManager.js';

document.getElementById('acceptBtn').addEventListener('click', async () => {
  await consentManager.grantConsent({
    trackBrowsing: true,
    trackIdleTime: true,
    trackIncognito: document.getElementById('trackIncognito').checked,
    shareAnonymousStats: document.getElementById('shareStats').checked
  });
  
  // Close onboarding, open main popup or show success
  window.close();
});

document.getElementById('declineBtn').addEventListener('click', async () => {
  // User declined - extension won't track
  await chrome.storage.local.set({ 
    consent: { granted: false, declinedAt: new Date().toISOString() }
  });
  window.close();
});
```

---

## Domain Exclusion

Let users exclude specific domains from tracking:

```javascript
// src/services/exclusionManager.js

class ExclusionManager {
  constructor() {
    this.DEFAULT_EXCLUSIONS = [
      // Banking & Finance
      '*.bank.*',
      'paypal.com',
      'venmo.com',
      
      // Health
      '*.health.*',
      'patient.*',
      
      // Personal
      'mail.google.com',  // Email (unless user opts in)
      '*.dating.*'
    ];
  }

  async getExcludedDomains() {
    const data = await chrome.storage.local.get('preferences');
    return data.preferences?.excludedDomains || [];
  }

  async addExclusion(domain) {
    const current = await this.getExcludedDomains();
    if (!current.includes(domain)) {
      current.push(domain);
      await this._saveExclusions(current);
    }
  }

  async removeExclusion(domain) {
    let current = await this.getExcludedDomains();
    current = current.filter(d => d !== domain);
    await this._saveExclusions(current);
  }

  async _saveExclusions(domains) {
    const data = await chrome.storage.local.get('preferences');
    const prefs = data.preferences || {};
    prefs.excludedDomains = domains;
    await chrome.storage.local.set({ preferences: prefs });
  }

  /**
   * Check if a URL should be excluded from tracking
   */
  async shouldExclude(url) {
    const domain = this._extractDomain(url);
    const exclusions = await this.getExcludedDomains();
    const allExclusions = [...this.DEFAULT_EXCLUSIONS, ...exclusions];
    
    return allExclusions.some(pattern => this._matchesPattern(domain, pattern));
  }

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  _matchesPattern(domain, pattern) {
    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(domain);
    }
    return domain === pattern || domain.endsWith('.' + pattern);
  }
}

export const exclusionManager = new ExclusionManager();
```

---

## Data Viewing & Export

Let users see and export their data:

```javascript
// src/services/dataViewer.js

class DataViewer {
  /**
   * Get summary of stored data
   */
  async getDataSummary() {
    const data = await chrome.storage.local.get(null);
    const events = data.pendingEvents || [];
    
    // Group by domain
    const domainCounts = {};
    events.forEach(e => {
      domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1;
    });
    
    return {
      totalEvents: events.length,
      oldestEvent: events[0]?.timestamp || null,
      newestEvent: events[events.length - 1]?.timestamp || null,
      topDomains: Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      storageUsed: JSON.stringify(data).length,
      syncedCount: data.stats?.totalEventsSynced || 0
    };
  }

  /**
   * Get all events for a date range
   */
  async getEvents(startDate, endDate) {
    const data = await chrome.storage.local.get('pendingEvents');
    const events = data.pendingEvents || [];
    
    return events.filter(e => {
      const eventDate = new Date(e.timestamp);
      return eventDate >= startDate && eventDate <= endDate;
    });
  }

  /**
   * Export all data as JSON
   */
  async exportAsJSON() {
    const data = await chrome.storage.local.get(null);
    
    // Remove internal state, keep only user data
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: chrome.runtime.getManifest().version,
      events: data.pendingEvents || [],
      preferences: data.preferences || {}
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as CSV
   */
  async exportAsCSV() {
    const data = await chrome.storage.local.get('pendingEvents');
    const events = data.pendingEvents || [];
    
    if (events.length === 0) return '';
    
    const headers = ['timestamp', 'domain', 'title', 'url', 'activeTime', 'idleTime'];
    const rows = events.map(e => 
      headers.map(h => {
        const val = e[h] || '';
        // Escape commas and quotes for CSV
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }
}

export const dataViewer = new DataViewer();
```

---

## Data Deletion

```javascript
// src/services/dataManager.js

class DataManager {
  /**
   * Delete all local data
   */
  async deleteAllData() {
    // Preserve consent status
    const consent = await chrome.storage.local.get('consent');
    
    await chrome.storage.local.clear();
    
    // Restore consent (user still consented, just cleared data)
    if (consent.consent) {
      await chrome.storage.local.set({ consent: consent.consent });
    }
    
    // Notify desktop app to also delete user's data
    // (if connected)
    chrome.runtime.sendMessage({ type: 'data_deletion_request' });
  }

  /**
   * Delete events older than specified days
   */
  async deleteOldData(daysToKeep = 30) {
    const data = await chrome.storage.local.get('pendingEvents');
    const events = data.pendingEvents || [];
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    
    const filtered = events.filter(e => 
      new Date(e.timestamp) > cutoff
    );
    
    await chrome.storage.local.set({ pendingEvents: filtered });
    
    return events.length - filtered.length; // Return count of deleted
  }

  /**
   * Delete events for a specific domain
   */
  async deleteByDomain(domain) {
    const data = await chrome.storage.local.get('pendingEvents');
    const events = data.pendingEvents || [];
    
    const filtered = events.filter(e => e.domain !== domain);
    
    await chrome.storage.local.set({ pendingEvents: filtered });
    
    return events.length - filtered.length;
  }
}

export const dataManager = new DataManager();
```

---

## Pause Functionality

```javascript
// In activityTracker or background.js

let isPaused = false;

// Quick pause from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggle_pause') {
    isPaused = !isPaused;
    chrome.storage.local.set({ 'extensionState.isPaused': isPaused });
    
    // Update badge to show paused state
    chrome.action.setBadgeText({ text: isPaused ? '⏸' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    
    sendResponse({ isPaused });
  }
});

// Check pause state before tracking
function shouldTrack() {
  return !isPaused && hasValidConsent();
}
```

---

## Privacy-Preserving Analytics (Optional)

If user opts in to anonymous stats:

```javascript
// Only aggregate, never individual events
async function collectAnonymousStats() {
  const data = await chrome.storage.local.get('pendingEvents');
  const events = data.pendingEvents || [];
  
  // Aggregate stats only - no URLs, titles, or timestamps
  return {
    eventCount: events.length,
    uniqueDomainCount: new Set(events.map(e => e.domain)).size,
    avgActiveTime: events.reduce((a, e) => a + e.activeTime, 0) / events.length,
    // Bucketed, not exact
    hourDistribution: bucketByHour(events),
    extensionVersion: chrome.runtime.getManifest().version
  };
}

function bucketByHour(events) {
  const buckets = new Array(24).fill(0);
  events.forEach(e => {
    const hour = new Date(e.timestamp).getHours();
    buckets[hour]++;
  });
  return buckets;
}
```

---

## Integration Checklist

- [ ] Onboarding screen shown on first install
- [ ] No tracking until consent granted
- [ ] Consent status persists across browser restarts
- [ ] User can pause tracking anytime
- [ ] User can view all stored data
- [ ] User can export data (JSON/CSV)
- [ ] User can delete all data
- [ ] User can exclude specific domains
- [ ] Sensitive domains excluded by default
- [ ] Incognito tracking is opt-in only
- [ ] Popup shows current tracking status
- [ ] Badge indicates when paused
