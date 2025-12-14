# Student Behavior Tracking System - Implementation Plan

## System Overview

A comprehensive procrastination detection system for research data collection:
1. **Browser Extension** - Tracks web browsing, classifies academic vs non-academic activity
2. **Desktop Application** - Tracks system activity (mouse, keyboard, idle, app focus)
3. **MongoDB Atlas** - Centralized cloud database (researcher-managed)
4. **ML Analysis** - Combines data to detect procrastination patterns

### Deployment Model
- **Zero configuration for students** - Download, install, run
- **Auto-generated anonymous participant ID**
- **Automatic cloud sync** - No database setup required
- **Researcher manages single MongoDB Atlas instance**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        STUDENT'S MACHINE (Zero Config)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌───────────────────────┐              ┌─────────────────────────────────────┐ │
│  │   BROWSER EXTENSION   │              │         DESKTOP APP                 │ │
│  │   (Installed by user) │              │      (Electron.js - Portable)       │ │
│  ├───────────────────────┤              ├─────────────────────────────────────┤ │
│  │ • URL/Tab tracking    │   Native     │ • Auto-generated Participant ID     │ │
│  │ • Domain classifying  │   Messaging  │ • Embedded SQLite (local buffer)    │ │
│  │ • Time on sites       │ ──────────▶  │ • Mouse/Keyboard/Idle tracking      │ │
│  │ • Academic vs not     │  (Shared     │ • Window focus monitoring           │ │
│  │ • User interactions   │  Session ID) │ • Auto-sync to cloud                │ │
│  └───────────────────────┘              └──────────────────┬──────────────────┘ │
│                                                            │                    │
└────────────────────────────────────────────────────────────┼────────────────────┘
                                                             │
                                                             │ HTTPS (Auto-sync)
                                                             │ (bundled credentials)
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      RESEARCHER'S CLOUD (MongoDB Atlas)                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    MongoDB Atlas App Services                            │   │
│  │  • API Key authentication (bundled in app)                               │   │
│  │  • Data access rules (students write own data only)                      │   │
│  │  • Rate limiting                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         MongoDB Atlas Database                           │   │
│  │  • All student data centralized                                          │   │
│  │  • You (researcher) manage and analyze                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│                                      ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                       ML Analysis (Researcher Side)                      │   │
│  │  • Run analysis on collected data                                        │   │
│  │  • Procrastination pattern detection                                     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Student Setup | Zero configuration | Students just download and run |
| Local Storage | Embedded SQLite | No database server installation required |
| Participant ID | Auto-generated UUID | Fully anonymous, no login required |
| Cloud Database | MongoDB Atlas | You manage one central instance |
| Cloud Auth | Atlas App Services API | Secure, students can only write own data |
| Data Correlation | Shared Session ID | Desktop app generates ID, extension uses same ID |
| Sync Frequency | Every 5-15 minutes | Near real-time data collection |

---

## Data Models

### Unified Session (combines both data sources)

```typescript
interface UnifiedSession {
  sessionId: string;              // Generated by desktop app
  userId: string;                 // Device/user identifier
  startTime: Date;
  endTime: Date | null;

  // Browser data (from extension)
  browserActivity: BrowserActivitySummary;

  // Desktop data (from desktop app)
  desktopActivity: DesktopActivitySummary;

  // Computed metrics
  productivity: ProductivityMetrics;
}

interface BrowserActivitySummary {
  totalBrowsingTime: number;      // ms
  categoryBreakdown: {
    academic: CategoryMetrics;
    productivity: CategoryMetrics;
    neutral: CategoryMetrics;
    nonAcademic: CategoryMetrics;
  };
  topDomains: DomainSummary[];
  tabSwitchCount: number;
  totalTabs: number;
}

interface DesktopActivitySummary {
  // Input activity
  mouseActivity: {
    totalMovement: number;        // pixels
    clickCount: number;
    idleGaps: TimePeriod[];       // Periods with no mouse activity
  };
  keyboardActivity: {
    keystrokeCount: number;
    typingPeriods: TimePeriod[];
    idleGaps: TimePeriod[];
  };

  // System state
  idlePeriods: TimePeriod[];      // OS-level idle detection
  activeWindows: WindowActivity[];

  // Aggregated
  totalActiveTime: number;        // ms
  totalIdleTime: number;          // ms
  longestFocusPeriod: number;     // ms
}

interface WindowActivity {
  appName: string;                // e.g., "Google Chrome", "VS Code"
  windowTitle: string;
  timeSpent: number;
  focusPeriods: TimePeriod[];
}

interface ProductivityMetrics {
  productiveTime: number;         // Academic + Productivity browsing + coding apps
  distractedTime: number;         // Non-academic browsing + entertainment apps
  idleTime: number;
  focusScore: number;             // 0-100
  procrastinationFlags: string[]; // e.g., "frequent_tab_switching", "long_social_media"
}
```

---

## Storage Architecture

### Local Storage (Embedded SQLite - on student's machine)
```sql
-- Participant info (generated on first run)
CREATE TABLE participant (
  id TEXT PRIMARY KEY,           -- Auto-generated UUID
  created_at INTEGER,
  device_info TEXT               -- OS, app version
);

-- Sessions (local buffer before sync)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  participant_id TEXT,
  start_time INTEGER,
  end_time INTEGER,
  synced INTEGER DEFAULT 0,      -- 0 = pending, 1 = synced
  data TEXT                      -- JSON blob of session data
);

-- Sync queue
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  created_at INTEGER,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);
```

### Cloud Storage (MongoDB Atlas - researcher-managed)
```javascript
// participants - Auto-registered on first sync
{
  _id: ObjectId,
  participantId: String (unique), // Auto-generated UUID
  deviceInfo: { os, appVersion, extensionVersion },
  firstSeen: Date,
  lastSeen: Date,
  totalSessions: Number
}

// sessions - All student data centralized
{
  _id: ObjectId,
  participantId: String (index),
  sessionId: String (unique),
  startTime: Date (index),
  endTime: Date,

  browserActivity: { /* BrowserActivitySummary */ },
  desktopActivity: { /* DesktopActivitySummary */ },
  productivity: { /* ProductivityMetrics */ },

  syncedAt: Date,
  appVersion: String
}

// Indexes for efficient querying
// - { participantId: 1, startTime: -1 }
// - { sessionId: 1 } (unique)
// - { startTime: -1 } (for date range queries)
```

---

## Implementation Phases

### Phase 1: Browser Extension - Classification System
**Goal:** Implement automated domain classification (from CLASSIFICATION_SYSTEM.md)

**Files to create:**
- `src/classification/types.ts`
- `src/classification/database.ts`
- `src/classification/rules.ts`
- `src/classification/cache.ts`
- `src/classification/index.ts`
- `src/data/domains/*.json`

**Files to modify:**
- `src/types/index.ts` - Add classification types
- `src/utils/helpers.ts` - Update `categorizeDomain()`
- `src/background/service-worker.ts` - Integrate classification

### Phase 2: Browser Extension - Sync Infrastructure
**Goal:** Enable extension to communicate with desktop app

**Files to create:**
- `src/sync/types.ts`
- `src/sync/native-messaging.ts`
- `src/sync/sync-service.ts`

**Files to modify:**
- `src/manifest.json` - Add nativeMessaging permission
- `src/background/service-worker.ts` - Add sync triggers
- `src/popup/popup.tsx` - Add sync status UI

### Phase 3: Desktop App - Foundation
**Goal:** Set up Electron app with zero-config deployment

**New project:** `desktop-app/`
```
desktop-app/
├── package.json
├── electron/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts
│   └── native-host/
│       ├── host.ts             # Native messaging host process
│       └── manifest.json
├── src/
│   ├── main.tsx                # React entry
│   ├── App.tsx
│   ├── components/
│   ├── services/
│   │   ├── participant.ts      # Auto-generate participant ID
│   │   ├── session-manager.ts  # Session management
│   │   ├── browser-receiver.ts # Receive data from extension
│   │   ├── sqlite.ts           # Embedded SQLite (better-sqlite3)
│   │   └── cloud-sync.ts       # MongoDB Atlas sync
│   └── types/
│       └── index.ts
├── scripts/
│   └── register-native-host.ts
└── tsconfig.json
```

**Key tasks:**
1. Initialize Electron + Vite + React + TypeScript
2. Set up Native Messaging host
3. **Implement participant ID auto-generation** (first run)
4. **Set up embedded SQLite** (better-sqlite3)
5. Create browser data receiver
6. **Bundle MongoDB Atlas credentials** securely

### Phase 4: Desktop App - Activity Tracking
**Goal:** Implement desktop activity monitoring

**Files to create:**
- `src/services/activity/mouse-tracker.ts`
- `src/services/activity/keyboard-tracker.ts`
- `src/services/activity/idle-detector.ts`
- `src/services/activity/window-tracker.ts`
- `src/services/activity/index.ts`

**Libraries to use:**
- `uiohook-napi` - Global keyboard/mouse hooks (better maintained than iohook)
- `active-win` - Get active window information
- Electron's `powerMonitor` - System idle detection

### Phase 5: Desktop App - Local Storage & Cloud Sync
**Goal:** Store locally and auto-sync to cloud

**Files to create:**
- `src/services/storage/local-store.ts` - SQLite operations
- `src/services/storage/sync-queue.ts` - Manage pending syncs
- `src/services/cloud/atlas-client.ts` - MongoDB Atlas App Services client
- `src/services/cloud/sync-service.ts` - Background sync logic

**Tasks:**
1. Implement SQLite session storage
2. Create sync queue (retry failed syncs)
3. **Set up MongoDB Atlas App Services** (researcher does this once)
4. Implement auto-sync (every 5-15 minutes)
5. Handle offline gracefully (queue until online)

### Phase 6: Researcher Setup Tools
**Goal:** One-time setup for researcher's MongoDB Atlas

**Deliverables:**
- Setup guide for MongoDB Atlas + App Services
- Script to configure data access rules
- API key generation instructions
- Dashboard queries for data analysis

### Phase 7: Dashboard UI (Student Side)
**Goal:** Minimal status UI for students

**Components:**
- Connection status (extension linked?)
- Sync status (last sync time, pending count)
- Participant ID display (for support)
- Start/Stop tracking toggle

### Phase 8: Packaging & Distribution
**Goal:** Easy installation for students

**Tasks:**
1. Electron Builder configuration
2. Windows installer (.exe)
3. macOS installer (.dmg)
4. Auto-update mechanism (optional)
5. Extension packaging for Chrome Web Store (or manual install)

---

## Native Messaging Protocol

### Session Management
```typescript
// Desktop → Extension (on connection)
{ type: 'SESSION_START', sessionId: string, timestamp: number }

// Desktop → Extension (on session end)
{ type: 'SESSION_END', sessionId: string }
```

### Data Transfer
```typescript
// Extension → Desktop (periodic, e.g., every 5 min)
{
  type: 'BROWSER_DATA',
  sessionId: string,
  data: {
    tabs: TabActivity[],
    currentUrl: string,
    timestamp: number
  }
}

// Desktop → Extension (acknowledgment)
{ type: 'ACK', received: number }
```

### Status Queries
```typescript
// Extension → Desktop
{ type: 'GET_STATUS' }

// Desktop → Extension
{
  type: 'STATUS',
  connected: boolean,
  sessionId: string | null,
  lastSync: number
}
```

---

## Implementation Order

| Order | Component | Description | Dependencies |
|-------|-----------|-------------|--------------|
| 1 | Extension: Classification | Automated domain classification | None |
| 2 | Desktop: Foundation | Electron setup, Native Messaging | None |
| 3 | Extension: Sync Client | Native Messaging client | Desktop foundation |
| 4 | Desktop: Activity Tracking | Mouse, keyboard, idle, windows | Desktop foundation |
| 5 | Desktop: Local Storage | SQLite + sync queue | Activity tracking |
| 6 | Desktop: Cloud Sync | Sync to Atlas | Local storage |
| 7 | Dashboard UI | Visualization | All above |
| 8 | Packaging | Installers for distribution | All above |

---

## File Changes Summary

### Browser Extension - New Files
| File | Purpose |
|------|---------|
| `src/classification/*` | Domain classification system |
| `src/sync/native-messaging.ts` | Native Messaging client |
| `src/sync/sync-service.ts` | Sync orchestration |
| `src/data/domains/*.json` | Domain database |

### Browser Extension - Modified Files
| File | Changes |
|------|---------|
| `src/manifest.json` | Add nativeMessaging permission |
| `src/types/index.ts` | Add classification & sync types |
| `src/utils/helpers.ts` | Integrate new classification |
| `src/background/service-worker.ts` | Add sync & classification |
| `src/popup/popup.tsx` | Add sync status |

### Desktop App - All New
| Directory | Purpose |
|-----------|---------|
| `electron/` | Electron main process & native host |
| `src/services/activity/` | Activity tracking modules |
| `src/services/storage/` | SQLite operations |
| `src/services/cloud/` | Cloud sync |
| `src/components/` | React UI components |

---

## Privacy & Security

1. **Raw data stays local** - Only summaries sync to cloud
2. **No PII in cloud** - Domain names only, no full URLs
3. **User control** - Can disable cloud sync entirely
4. **Local encryption** - Optional at-rest encryption
5. **Secure transport** - TLS for all cloud communication

---

## Execution Plan

**Approach:** Parallel implementation of Phase 1 and Phase 3

### Stream A: Browser Extension - Classification System
1. Create classification types and interfaces
2. Build domain database (JSON files)
3. Implement rule engine
4. Add local cache
5. Integrate with existing `categorizeDomain()`
6. Test classification accuracy

### Stream B: Desktop App - Foundation
1. Initialize Electron + Vite + React + TypeScript project
2. Set up project structure
3. **Implement participant ID auto-generation**
4. **Set up embedded SQLite** (better-sqlite3)
5. Implement Native Messaging host
6. Create session manager & browser data receiver

### Stream C: Researcher Cloud Setup (can run in parallel)
1. Create MongoDB Atlas account & cluster
2. Set up Atlas App Services
3. Configure data access rules
4. Generate API key for app

### Integration Point
After Streams A & B complete:
- Extension sync client (connects to desktop app)
- Desktop activity tracking (Phase 4)
- Cloud sync implementation (Phase 5)
- Packaging & distribution (Phase 8)

---

## Student Experience (Zero Config)

1. **Download** - Get installer from shared link
2. **Install** - Run installer (Windows/macOS)
3. **Install Extension** - Add browser extension
4. **Done** - App auto-starts, generates participant ID, begins tracking

No database setup. No configuration. No login.
