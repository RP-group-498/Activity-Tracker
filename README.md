# Focus App Browser Extension

A Chrome browser extension for tracking and classifying browsing behavior as part of the procrastination detection research system. Integrates with the Focus App Desktop application via Native Messaging.

## Overview

This extension is **Component 1** of the Focus App research project. It captures browser activity data and sends it to the desktop application for analysis and ML-based classification.

```
Browser Extension (this) --> Native Messaging --> Desktop App --> SQLite/MongoDB
```

## Features

- **Tab Activity Tracking**: Monitors time spent on each tab, URL, domain, and page title
- **Multi-Tier Classification**: Classifies websites into 4 categories:
  - `academic` - Educational, research, learning platforms
  - `productivity` - Work tools, development, documentation
  - `neutral` - Context-dependent, general purpose
  - `non_academic` - Entertainment, social media, leisure
- **Native Messaging**: Real-time communication with the desktop application
- **Data Enrichment**: Extracts context from YouTube, Google, and social media URLs
- **Consent Management**: User consent flow with granular privacy controls
- **Session Management**: Organizes browsing data into sessions from the desktop app
- **Idle Detection**: Automatically pauses tracking during idle periods
- **Data Export**: Export data as JSON or CSV for analysis
- **Privacy-Focused**:
  - Local storage buffer when desktop app is disconnected
  - Filters sensitive URLs (passwords, banking, etc.)
  - URL sanitization (removes query parameters)
  - Respects incognito mode
  - User-controlled domain exclusions

## Project Structure

```
browser-extension/
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Background service worker for tracking
│   ├── classification/            # Multi-tier classification system
│   │   ├── index.ts               # Classification service entry point
│   │   ├── database.ts            # Domain database lookup
│   │   ├── rules.ts               # Rule engine for patterns
│   │   ├── cache.ts               # Classification cache
│   │   └── types.ts               # Classification types
│   ├── data/
│   │   └── domains/               # Pre-loaded domain databases
│   │       ├── academic.json      # Academic domains
│   │       ├── productivity.json  # Productivity domains
│   │       ├── neutral.json       # Neutral domains
│   │       └── non-academic.json  # Non-academic domains
│   ├── popup/
│   │   ├── popup.html             # Popup UI HTML
│   │   └── popup.tsx              # Popup React component
│   ├── options/
│   │   ├── options.html           # Options page HTML
│   │   └── options.tsx            # Options React component
│   ├── services/
│   │   ├── nativeMessaging.ts     # Desktop app communication
│   │   ├── activityTracker.ts     # Activity tracking logic
│   │   ├── eventStorage.ts        # Event storage and sync queue
│   │   ├── enrichment.ts          # URL/context enrichment
│   │   ├── consentManager.ts      # User consent management
│   │   ├── exclusionManager.ts    # Domain exclusion handling
│   │   └── utils.ts               # Service utilities
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   ├── utils/
│   │   ├── storage.ts             # Chrome Storage API wrapper
│   │   ├── helpers.ts             # Helper functions
│   │   └── export.ts              # JSON/CSV export utilities
│   └── manifest.json              # Extension manifest (Manifest V3)
├── docs/
│   └── classification_guide_md.md # Classification system design guide
├── dist/                          # Build output (generated)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── QUICKSTART.md                  # Quick setup guide
└── CLAUDE.md                      # Developer guide for Claude Code
```

## Tech Stack

- **TypeScript** - Type-safe development
- **React** - UI components
- **Vite** - Build tool and dev server
- **CRXJS** - Chrome extension development plugin for Vite
- **Tailwind CSS** - Utility-first styling
- **PapaParse** - CSV generation
- **Chrome Extension APIs** - Manifest V3 (tabs, webNavigation, idle, storage, nativeMessaging)

## Installation & Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Chrome browser
- Focus App Desktop application (for full functionality)

### Setup

1. **Install dependencies**:
   ```bash
   cd browser-extension
   npm install
   ```

2. **Development mode** (with hot reload):
   ```bash
   npm run dev
   ```

3. **Production build**:
   ```bash
   npm run build
   ```

### Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist` folder from the project directory
5. Note the **Extension ID** (needed for desktop app setup)

## Desktop App Integration

The extension communicates with the Focus App Desktop application via Chrome Native Messaging.

### How It Works

1. Desktop app registers a Native Messaging host with Chrome
2. Extension connects to the host when desktop app is running
3. Extension sends activity events to desktop app in real-time
4. Desktop app classifies activity and stores in database
5. If desktop app is offline, events are buffered locally

### Connection Status

The extension popup shows connection status:
- **Connected**: Desktop app is running and receiving data
- **Disconnected**: Events are buffered locally until reconnection

## Classification System

The extension includes a multi-tier classification system:

### Tier 1: Domain Database
Pre-loaded JSON files with known domains and their categories. Covers ~40% of traffic.

### Tier 2: Rule Engine
Pattern-based rules for TLDs (.edu, .ac.uk), keywords, and domain patterns.

### Tier 3: Local Cache
Caches classifications for faster subsequent lookups.

### Tier 4: Desktop App
Complex cases are sent to the desktop app for ML-based classification.

For detailed classification architecture, see `docs/classification_guide_md.md`.

## Data Types

### Activity Event
```typescript
interface ActivityEvent {
  eventId: string;
  sessionId: string | null;  // From desktop app
  source: 'browser';
  activityType: 'webpage';
  timestamp: string;         // ISO 8601
  startTime: string;
  endTime: string | null;
  url: string;
  domain: string;
  path: string;
  title: string;
  activeTime: number;        // seconds
  idleTime: number;
  tabId: number;
  windowId: number;
  isIncognito: boolean;
  synced: boolean;
  // Context enrichment
  youtubeContext?: YouTubeContext;
  googleContext?: GoogleContext;
  socialContext?: SocialContext;
}
```

### Classification Categories
- `academic` - Scholar, Coursera, university sites, research platforms
- `productivity` - GitHub, Notion, VS Code Web, documentation
- `neutral` - Google Search, general tools
- `non_academic` - YouTube (entertainment), Netflix, social media

## Privacy & Security

- **Local storage buffer**: Data stored locally when desktop app is offline
- **Sensitive URL filtering**: Skips URLs containing "password", "login", "bank", etc.
- **URL sanitization**: Query parameters removed for privacy
- **Incognito mode**: Not tracked by default
- **User consent**: Explicit consent required before tracking
- **Domain exclusions**: Users can exclude specific domains
- **User control**: Pause, delete, and export data at any time

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production version
- `npm run preview` - Preview production build

### Debugging

1. **Service Worker Console**:
   - Go to `chrome://extensions/`
   - Find your extension
   - Click "service worker" link to open DevTools

2. **Popup Console**:
   - Open popup
   - Right-click and select "Inspect"

3. **Check Native Messaging**:
   - Verify desktop app is running
   - Check service worker logs for connection status

## Troubleshooting

**Extension not connecting to desktop app**:
- Ensure desktop app is running
- Check that Native Messaging host is registered (see desktop app docs)
- Verify extension ID matches in native host manifest
- Check service worker console for connection errors

**Tracking not working**:
- Check that tracking is enabled in settings
- Ensure consent has been granted
- Open service worker console to check for errors
- Make sure you're not in incognito mode

**Classification not working**:
- Check service worker console for classification errors
- Verify domain database files exist in build output
- Check that classification service is initialized

## Related Documentation

- `QUICKSTART.md` - Quick setup guide
- `CLAUDE.md` - Developer guide for Claude Code
- `docs/classification_guide_md.md` - Classification system design

## License

ISC
