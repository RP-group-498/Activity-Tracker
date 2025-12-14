# Browser Behavior Tracker Extension

A Chrome browser extension that tracks user browsing behavior for procrastination analysis. Built with TypeScript, React, Vite, and Tailwind CSS.

## Features

- **Tab Activity Tracking**: Monitors time spent on each tab, URL, domain, and title
- **Session Management**: Organizes browsing data into sessions
- **Category Classification**: Categorizes websites as academic, non-academic, or unknown
- **Idle Detection**: Automatically pauses tracking during idle periods
- **Data Export**: Export data as JSON or CSV for analysis
- **Privacy-Focused**:
  - Local storage only
  - Filters sensitive URLs (passwords, banking, etc.)
  - URL sanitization (removes query parameters)
  - Respects incognito mode
- **Customizable Settings**: Configure academic/non-academic domains, idle thresholds, and data retention

## Project Structure

```
browser-extension/
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Background service worker for tracking
│   ├── popup/
│   │   ├── popup.html             # Popup UI HTML
│   │   └── popup.tsx              # Popup React component
│   ├── options/
│   │   ├── options.html           # Options page HTML
│   │   └── options.tsx            # Options React component
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   ├── utils/
│   │   ├── storage.ts             # Chrome Storage API wrapper
│   │   ├── helpers.ts             # Helper functions
│   │   └── export.ts              # JSON/CSV export utilities
│   └── manifest.json              # Extension manifest (Manifest V3)
├── public/
│   └── icons/                     # Extension icons (optional)
├── dist/                          # Build output (generated)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Tech Stack

- **TypeScript** - Type-safe development
- **React** - UI components
- **Vite** - Build tool and dev server
- **CRXJS** - Chrome extension development plugin for Vite
- **Tailwind CSS** - Utility-first styling
- **PapaParse** - CSV generation
- **Chrome Extension APIs** - Manifest V3

## Installation & Development

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Chrome browser

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
5. The extension should now appear in your extensions list

### Testing the Extension

1. **Click the extension icon** in your toolbar to open the popup
2. **Browse some websites** to start tracking
3. **View current session** data in the popup
4. **Configure settings** by clicking "Settings" button
5. **Export data** using the "Export JSON" or "Export CSV" buttons

## Usage

### Popup Interface

The extension popup shows:
- **Current Session tab**:
  - Total active time
  - Breakdown by category (Academic, Non-Academic, Unknown)
  - Number of tabs tracked
  - End session button
- **History tab**:
  - Previous sessions (last 10)
  - Session duration and tab count
- **Action buttons**:
  - Export JSON
  - Export CSV
  - Settings
  - Clear All Data

### Settings/Options Page

Configure the extension behavior:
- **Enable/Disable tracking**
- **Idle threshold**: Time before tracking pauses (seconds)
- **Data retention**: Auto-delete old data (days)
- **Academic domains**: Whitelist productive websites
- **Non-academic domains**: Blacklist distracting websites

### Data Export

**JSON Export**:
- Complete structured data
- Includes all sessions, settings, and metadata
- Ideal for programmatic analysis

**CSV Export**:
- Flattened data structure
- One row per tab activity
- Includes: sessionId, timestamps, URL, domain, category, time spent, etc.
- Ideal for spreadsheet analysis

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production version
- `npm run preview` - Preview production build

### Adding Icons

To add custom icons:
1. Create PNG files: `icon16.png`, `icon48.png`, `icon128.png`
2. Place them in `public/icons/` directory
3. Update `src/manifest.json` to reference them:
   ```json
   "icons": {
     "16": "icons/icon16.png",
     "48": "icons/icon48.png",
     "128": "icons/icon128.png"
   },
   "action": {
     "default_icon": {
       "16": "icons/icon16.png",
       "48": "icons/icon48.png",
       "128": "icons/icon128.png"
     }
   }
   ```

### Debugging

1. **Service Worker Console**:
   - Go to `chrome://extensions/`
   - Find your extension
   - Click "service worker" link to open DevTools

2. **Popup Console**:
   - Open popup
   - Right-click and select "Inspect"

3. **Options Page Console**:
   - Open options page
   - Right-click and select "Inspect"

## Data Schema

### Session
```typescript
{
  sessionId: string;
  startTime: number;
  endTime: number | null;
  tabs: TabActivity[];
}
```

### TabActivity
```typescript
{
  url: string;
  domain: string;
  title: string;
  timeSpent: number; // milliseconds
  activePeriods: ActivityPeriod[];
  interactions: TabInteractions;
  category: 'academic' | 'non-academic' | 'unknown';
  tabId: number;
  windowId: number;
}
```

## Privacy & Security

- **Local storage only**: No data sent to external servers
- **Sensitive URL filtering**: Automatically skips URLs containing "password", "login", "bank", etc.
- **URL sanitization**: Query parameters removed for privacy
- **Incognito mode**: Not tracked by default
- **User control**: Pause, delete, and export data at any time

## Future Enhancements

- Content scripts for more detailed engagement metrics (scrolling, clicking)
- Native messaging for desktop app integration
- More sophisticated ML-based categorization
- Real-time data sync with desktop application
- Activity heatmaps and visualizations
- Productivity insights and recommendations

## Integration with Desktop Application

This extension is designed to be part of a larger procrastination detection system. Data can be:
1. Exported manually (JSON/CSV) and imported into desktop app
2. Sent via Native Messaging API (future implementation)
3. Combined with desktop behavior data for comprehensive analysis

## License

ISC

## Contributing

This is a research project. For issues or suggestions, please open an issue in the repository.

## Troubleshooting

**Extension not loading**:
- Make sure you've run `npm run build`
- Check that you're loading the `dist` folder, not the `src` folder
- Check the Chrome extensions page for error messages

**Tracking not working**:
- Check that tracking is enabled in settings
- Open service worker console to check for errors
- Make sure you're not in incognito mode (unless extension is enabled for incognito)

**Data not saving**:
- Check Chrome storage permissions
- Check service worker console for errors
- Try clearing data and starting fresh

**Build errors**:
- Delete `node_modules` and `dist` folders
- Run `npm install` again
- Try `npm run build` again
