import Papa from 'papaparse';
import { StorageData } from '../types';

export async function exportToJSON(data: StorageData): Promise<void> {
  const exportData = {
    exportDate: Date.now(),
    sessions: data.sessions,
    currentSession: data.currentSession,
    settings: data.settings,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `behavior-tracker-${new Date().toISOString().split('T')[0]}.json`;

  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });

    // Clean up the blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function exportToCSV(data: StorageData): Promise<void> {
  // Flatten the data structure for CSV
  const rows: any[] = [];

  // Include current session if exists
  const allSessions = [...data.sessions];
  if (data.currentSession) {
    allSessions.push(data.currentSession);
  }

  // Flatten each session and tab into rows
  allSessions.forEach((session) => {
    session.tabs.forEach((tab) => {
      rows.push({
        sessionId: session.sessionId,
        sessionStart: new Date(session.startTime).toISOString(),
        sessionEnd: session.endTime ? new Date(session.endTime).toISOString() : 'ongoing',
        url: tab.url,
        domain: tab.domain,
        title: tab.title,
        timeSpentMs: tab.timeSpent,
        timeSpentMinutes: Math.round(tab.timeSpent / 1000 / 60 * 100) / 100,
        category: tab.category,
        scrolls: tab.interactions.scrolls,
        clicks: tab.interactions.clicks,
        typing: tab.interactions.typing,
        activePeriods: tab.activePeriods.length,
      });
    });
  });

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const filename = `behavior-tracker-${new Date().toISOString().split('T')[0]}.csv`;

  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });

    // Clean up the blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
