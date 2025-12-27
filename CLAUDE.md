# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser extension for tracking and classifying user browsing behavior to support procrastination detection research. Built with TypeScript, React, Vite, and Manifest V3. Integrates with the Focus App Desktop application via Chrome Native Messaging for real-time data sync and ML-based classification.

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

### Four-Layer Architecture

1. **Background Service Worker** (`src/background/service-worker.ts`)
   - Event-driven architecture using Chrome Extension APIs
   - Coordinates all services (tracking, classification, native messaging)
   - Persists state periodically and on critical events
   - **State is ephemeral in Manifest V3**: Service worker can be terminated at any time

2. **Services Layer** (`src/services/`)
   - `nativeMessaging.ts` - Desktop app communication via Chrome Native Messaging
   - `activityTracker.ts` - Tab and activity tracking logic
   - `eventStorage.ts` - Event buffering and sync queue
   - `enrichment.ts` - URL/context enrichment for classification
   - `consentManager.ts` - User consent flow management
   - `exclusionManager.ts` - Domain exclusion handling

3. **Classification Layer** (`src/classification/`)
   - `database.ts` - Pre-loaded domain database lookup
   - `rules.ts` - Rule engine for pattern matching
   - `cache.ts` - Classification cache management
   - Multi-tier classification: database → rules → cache → desktop app

4. **React UI Layer** (popup and options pages)
   - Popup (`src/popup/`): Session stats, connection status, export controls
   - Options (`src/options/`): Settings, domain management, consent
   - Communicate with service worker via `chrome.runtime.sendMessage()`

### Data Flow

```
Chrome Tab Events → Service Worker → Activity Tracker → Event Storage
                                           ↓
                                    Classification Service
                                           ↓
                                    Native Messaging → Desktop App
                                           ↓
                                    UI Components (Popup/Options)
```

### Key Concepts

**Desktop App Integration**:
- Extension connects to desktop app via Chrome Native Messaging
- Session IDs come FROM the desktop app
- Events are buffered locally when desktop app is disconnected
- Desktop app performs advanced ML classification

**Multi-Tier Classification**:
1. Domain database lookup (instant, high confidence)
2. Rule engine (pattern matching for .edu, keywords, etc.)
3. Local cache (previously classified domains)
4. Desktop app (ML-based for complex cases)

**Data Enrichment**:
- YouTube context (video ID, playlist, search query)
- Google context (service type, search vs docs)
- Social media context (feed vs messaging)

**Privacy Safeguards**:
- Sensitive URLs filtered (`isSensitiveUrl()`)
- Query parameters stripped
- Incognito mode excluded by default
- User consent required before tracking

## Type System

All core types in `src/types/index.ts`:

**New Event Types (for desktop app)**:
- `ActivityEvent` - Single page visit with enrichment data
- `TabSwitchEvent` - Tab switch events
- `IdleStateEvent` - Idle state changes

**Classification Types**:
- `DetailedCategory` - 'academic' | 'productivity' | 'neutral' | 'non_academic'
- `ClassificationSource` - 'database' | 'rule' | 'cache' | 'api' | 'user'
- `ClassificationInfo` - Full classification with confidence and source

**Legacy Types (backward compatibility)**:
- `TabActivity`, `Session`, `Settings` - Original types still used in UI

## Domain Database

Pre-loaded domain databases in `src/data/domains/`:
- `academic.json` - Educational, research, learning platforms
- `productivity.json` - Work tools, development, documentation
- `neutral.json` - Context-dependent (Google Search, etc.)
- `non-academic.json` - Entertainment, social media, leisure

## Native Messaging Protocol

**Extension → Desktop App**:
- `connect` - Initial connection with extension info
- `activity_batch` - Batch of activity events
- `heartbeat` - Keep-alive with pending event count

**Desktop App → Extension**:
- `session` - Session info (ID, user, status)
- `ack` - Acknowledgment of received events
- `command` - Commands (pause, resume, clear_local)
- `error` - Error messages

## Important Files

| File | Purpose |
|------|---------|
| `src/services/nativeMessaging.ts` | Desktop app communication |
| `src/services/activityTracker.ts` | Tab tracking logic |
| `src/services/eventStorage.ts` | Event buffering |
| `src/classification/index.ts` | Classification service |
| `src/classification/database.ts` | Domain database |
| `src/classification/rules.ts` | Rule engine |
| `src/types/index.ts` | All type definitions |
| `docs/classification_guide_md.md` | Classification architecture |

## Vite + CRXJS Configuration

- **CRXJS plugin** (`@crxjs/vite-plugin`) transforms `src/manifest.json` and builds the extension
- Manifest references TypeScript files directly; CRXJS handles bundling
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin
- Hot Module Replacement works in dev mode for UI files

## Important Constraints

**Manifest V3 Service Workers**:
- Cannot use long-lived background pages; service workers are event-driven
- All persistent state MUST be in `chrome.storage.local`
- Use `chrome.alarms` for periodic tasks (not `setInterval`)
- Module-based workers only (`"type": "module"` in manifest)

**Native Messaging**:
- Requires desktop app to be running for real-time sync
- Events buffered locally when disconnected
- Native host must be registered in Windows Registry

## Testing the Extension

1. Build: `npm run build`
2. Load `dist/` folder in Chrome as unpacked extension
3. Note the Extension ID (needed for desktop app)
4. Start desktop app backend
5. Check service worker console for connection logs
6. Common logs to verify:
   - "NativeMessaging: Connected to desktop app"
   - "Classification: Domain classified as [category]"
   - "EventStorage: Events synced successfully"

## Common Modifications

**Adding a new domain to database**:
1. Edit appropriate file in `src/data/domains/`
2. Follow existing JSON structure
3. Rebuild extension

**Adding a new classification rule**:
1. Edit `src/classification/rules.ts`
2. Add rule to appropriate category
3. Test with service worker console

**Changing enrichment logic**:
1. Edit `src/services/enrichment.ts`
2. Update context extraction functions
3. Update types in `src/types/index.ts` if needed

**Debugging native messaging**:
1. Check desktop app is running
2. Check native host is registered
3. View service worker console for connection status
4. Check `nativeMessaging.getConnectionStatus()`

## Debugging

**Service Worker Console**:
- `chrome://extensions/` → Extension → Click "service worker"

**Popup Console**:
- Open popup → Right-click → Inspect

**Storage Inspection**:
- DevTools → Application → Storage → Extension Storage

**Native Messaging Debug**:
- Check `chrome.runtime.lastError` in service worker
- Verify extension ID in native host manifest
- Check native host log file in desktop app
