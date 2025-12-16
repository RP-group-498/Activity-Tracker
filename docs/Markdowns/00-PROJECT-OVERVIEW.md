# Browser Extension - Project Overview

## Project Context
This browser extension is **Component 1** of a 4-component research project (ID: 25-26J-498) focused on procrastination intervention for university students.

## What This Extension Does
Captures browser activity data (URLs, titles, timestamps, tab switches) and sends it to a desktop application for classification and analysis.

## Current State
- ✅ Basic URL and tab tracking implemented
- ✅ Can export data as JSON/CSV
- 🔄 Needs: Native Messaging integration with desktop app
- 🔄 Needs: Session management from desktop app
- 🔄 Needs: Real-time data streaming (not just export)

## Architecture Summary
```
Browser Extension (this) 
    ↓ Native Messaging API
Desktop App (Electron.js) 
    ↓ Classification + Sync
MongoDB Atlas (Cloud)
    ↓ Query API
Component 2 (Procrastination Detection)
```

## Related Documentation Files
Use these files as context in Claude Code based on what you're working on:

| File | Use When |
|------|----------|
| `01-DATA-SCHEMA.md` | Defining data structures, storage formats |
| `02-NATIVE-MESSAGING.md` | Implementing desktop app communication |
| `03-ACTIVITY-TRACKING.md` | Enhancing URL/tab/idle tracking |
| `04-CLASSIFICATION-PREP.md` | Preparing data for classification layer |
| `05-PRIVACY-CONSENT.md` | Implementing user consent and data controls |

## Tech Stack
- **Manifest Version**: V3 (Chrome Extension)
- **APIs Used**: `chrome.tabs`, `chrome.webNavigation`, `chrome.idle`, `chrome.storage`, `chrome.runtime` (Native Messaging)
- **Communication**: Chrome Native Messaging to Electron.js desktop app

## Key Constraints
1. Extension must be lightweight (classification happens in desktop app)
2. Data buffered locally if desktop app disconnected
3. Privacy-first: user can pause/view/delete data anytime
4. Session ID comes FROM desktop app (extension doesn't generate it)
