# Quick Start Guide

## Load the Extension in Chrome

1. **Build the extension** (if not already built):
   ```bash
   cd browser-extension
   npm run build
   ```

2. **Open Chrome Extensions page**:
   - Navigate to `chrome://extensions/`
   - Or: Menu (⋮) → Extensions → Manage Extensions

3. **Enable Developer Mode**:
   - Toggle the switch in the top-right corner

4. **Load the extension**:
   - Click "Load unpacked" button
   - Navigate to and select the `dist` folder inside the browser-extension directory
   - Click "Select Folder"

5. **Pin the extension** (optional):
   - Click the extensions icon (puzzle piece) in Chrome toolbar
   - Find "Behavior Tracker"
   - Click the pin icon to keep it visible

## Test the Extension

### Basic Tracking Test

1. **Click the extension icon** to open the popup
2. **Browse some websites** (try 3-4 different sites)
3. **Switch between tabs** to test tab tracking
4. **Return to the popup** to see your current session data
5. **Check the time tracked** for each category

### Settings Test

1. Open the popup and click **"Settings"**
2. Add a domain to **Academic Domains** (e.g., "wikipedia.org")
3. Add a domain to **Non-Academic Domains** (e.g., "twitter.com")
4. Adjust the **Idle Threshold** (e.g., 30 seconds)
5. Click **"Save Settings"**
6. Browse the configured domains and verify categorization

### Export Test

1. After tracking some activity, open the popup
2. Click **"Export JSON"** to download JSON data
3. Click **"Export CSV"** to download CSV data
4. Open the downloaded files to verify the data format

## Development Mode

For development with hot reload:

```bash
cd browser-extension
npm run dev
```

Then load the `dist` folder in Chrome as described above. Changes to the code will automatically rebuild and reload the extension.

## Verify It's Working

### Check Service Worker
1. Go to `chrome://extensions/`
2. Find "Behavior Tracker"
3. Click **"service worker"** link
4. You should see console logs like:
   - "Tab Tracker initialized"
   - "New session started: [uuid]"
   - "Started tracking tab: [domain]"

### Check Data Storage
1. Open the popup
2. Look for "Current Session" data
3. Should show:
   - Total active time
   - Academic/Non-Academic/Unknown categories
   - Number of tabs tracked

### Check History
1. Click "End Current Session" in the popup
2. Switch to the "History" tab
3. Your completed session should appear

## Common Issues

**Extension not showing data**:
- Check service worker console for errors
- Make sure you're browsing actual websites (not chrome:// pages)
- Verify tracking is enabled in settings

**Build errors**:
- Delete `node_modules` and run `npm install` again
- Make sure you have Node.js v16 or higher

**Changes not reflecting**:
- Click the refresh icon on `chrome://extensions/` page
- Or use `npm run dev` for auto-reload

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Review the [browser-extension-plan.md](../browser-extension-plan.md) for architecture details
- Start integrating with your desktop application
- Customize the domain categorization rules for your use case
