# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser extension for tracking user browsing behavior (time spent on tabs, domains visited, session management) to support procrastination detection analysis. Built with TypeScript, React, Vite, and Manifest V3. Part of a larger system that includes a desktop application for comprehensive behavior analysis.

## Build Commands

```bash
# Development with hot reload
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

After building, load the `dist/` folder as an unpacked extension in Chrome (`chrome://extensions/` → Developer mode → Load unpacked).

## Architecture Overview

### Three-Tier Architecture

1. **Background Service Worker** (`src/background/service-worker.ts`)
   - Singleton `TabTracker` class manages all tracking state
   - Event-driven architecture using Chrome Extension APIs
   - Persists state periodically (every 1 minute) and on critical events
   - **State is ephemeral in Manifest V3**: Service worker can be terminated at any time, so all state must be persisted to `chrome.storage.local`

2. **React UI Layer** (popup and options pages)
   - Popup (`src/popup/`): Current session stats, history, export controls
   - Options (`src/options/`): Settings configuration for domain categorization
   - Communicate with service worker via `chrome.runtime.sendMessage()`

3. **Storage Layer** (`src/utils/storage.ts`)
   - `StorageManager` class wraps `chrome.storage.local` API
   - Static methods for type-safe storage operations
   - Manages: current session, session history, user settings

### Data Flow

```
Chrome Tab Events → Service Worker → TabTracker Class → StorageManager → chrome.storage.local
                                          ↓
                                    Message Handler
                                          ↓
                                   UI Components (Popup/Options)
```

### Key Concepts

**Session Management**:
- A "session" is created on extension load and tracks all tab activity until manually ended
- Each session contains multiple `TabActivity` objects representing individual tabs
- Sessions are saved to history when ended and a new session begins

**Tab Tracking Lifecycle**:
1. Tab activated → `startTrackingTab()` → Create/update `TabActivity` with new `ActivityPeriod`
2. Tab deactivated/closed → `stopTrackingTab()` → Close current `ActivityPeriod`, calculate `timeSpent`
3. Browser loses focus/idle → `pauseTracking()` → Stop all active tracking
4. Browser regains focus → `resumeTracking()` → Resume tracking active tab

**Privacy Safeguards**:
- URLs containing sensitive keywords (password, login, bank, etc.) are filtered in `isSensitiveUrl()`
- Query parameters stripped via `sanitizeUrl()`
- Chrome:// and extension:// URLs are excluded
- Incognito mode excluded by default (extension must be explicitly enabled for incognito)

## Type System

All core types in `src/types/index.ts`:

- **TabActivity**: Represents a single tab's tracking data (URL, domain, time spent, category, activity periods)
- **Session**: Collection of TabActivity objects with session metadata (ID, start/end times)
- **Settings**: User configuration (tracking enabled, domain categorization, thresholds)
- **ActivityPeriod**: Time range when a tab was active (start/end timestamps)

## Service Worker Message API

The background service worker listens for messages with these actions:

- `getCurrentSession`: Returns active session or null
- `getSessions`: Returns all historical sessions
- `endSession`: Ends current session, saves to history, starts new session
- `exportData`: Returns complete `StorageData` for export
- `clearAllData`: Wipes all stored data
- `updateSettings`: Updates user settings

All messages return `{ success: boolean, data?: any, error?: string }`

## Vite + CRXJS Configuration

- **CRXJS plugin** (`@crxjs/vite-plugin`) transforms `src/manifest.json` and builds the extension
- Manifest references TypeScript files directly; CRXJS handles bundling
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (requires `import '../index.css'` in entry points)
- Hot Module Replacement works in dev mode for UI files; service worker requires manual extension reload

## Important Constraints

**Manifest V3 Service Workers**:
- Cannot use long-lived background pages; service workers are event-driven and can terminate
- All persistent state MUST be in `chrome.storage.local`, not in-memory variables
- Use `chrome.alarms` for periodic tasks (not `setInterval`)
- Module-based workers only (`"type": "module"` in manifest)

**Chrome Storage Limits**:
- `chrome.storage.local`: 10MB by default (unlimited if `"unlimitedStorage"` permission added)
- Current implementation uses periodic cleanup based on `dataRetentionDays` setting

## Testing the Extension

1. Build: `npm run build`
2. Load `dist/` folder in Chrome as unpacked extension
3. Check service worker console: `chrome://extensions/` → Find extension → Click "service worker"
4. Debug popup: Open popup → Right-click → Inspect
5. Common logs to verify:
   - "Tab Tracker initialized"
   - "New session started: [uuid]"
   - "Started tracking tab: [domain]"
   - "Session saved: [uuid]"

## Export Functionality

- **JSON export**: Full structured data for programmatic analysis (ML pipelines)
- **CSV export**: Flattened tabular format using PapaParse (one row per TabActivity)
- Both use `chrome.downloads.download()` API (requires `"downloads"` permission)
- Export includes all sessions (historical + current) and settings

## Future Integration

Extension is designed to integrate with a desktop application for procrastination detection:
- Exported data combines browser behavior with desktop metrics (idle time, mouse movements, app usage)
- Desktop app performs ML-based classification (academic vs non-academic)
- Planned integration methods: Native Messaging API, local HTTP server, or file-based sync

## Common Modifications

**Adding a new tracked metric**:
1. Update `TabActivity` interface in `src/types/index.ts`
2. Modify `startTrackingTab()` in service worker to collect the metric
3. Update CSV export in `src/utils/export.ts` to include new field

**Changing categorization logic**:
- Edit `categorizeDomain()` in `src/utils/helpers.ts`
- Update `DEFAULT_SETTINGS.academicDomains/nonAcademicDomains` in `src/utils/storage.ts`

**Debugging storage issues**:
- Check `chrome://extensions/` → Extension → "Inspect views: service worker"
- View storage: DevTools → Application → Storage → Extension Storage
- Clear storage: Call `chrome.storage.local.clear()` in service worker console
