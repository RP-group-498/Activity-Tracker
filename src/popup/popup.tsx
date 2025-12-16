import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Session, ExtensionState, ExtensionStats } from '../types';
import { formatTime, formatDate } from '../utils/helpers';
import { exportToJSON, exportToCSV } from '../utils/export';
import '../index.css';

interface ConnectionStatus {
  isConnected: boolean;
  pendingMessages: number;
  pendingAcks: number;
}

function Popup() {
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'status'>('current');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New state for desktop app integration
  const [extensionState, setExtensionState] = useState<ExtensionState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [stats, setStats] = useState<ExtensionStats | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    loadData();
    // Refresh connection status periodically
    const interval = setInterval(loadConnectionInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadConnectionInfo = async () => {
    try {
      const [stateRes, connRes, statsRes, pendingRes] = await Promise.all([
        chrome.runtime.sendMessage({ action: 'getExtensionState' }),
        chrome.runtime.sendMessage({ action: 'getConnectionStatus' }),
        chrome.runtime.sendMessage({ action: 'getStats' }),
        chrome.runtime.sendMessage({ action: 'getPendingEventsCount' }),
      ]);

      if (stateRes.success) setExtensionState(stateRes.data);
      if (connRes.success) setConnectionStatus(connRes.data);
      if (statsRes.success) setStats(statsRes.data);
      if (pendingRes.success) setPendingCount(pendingRes.data.count);
    } catch (error) {
      console.error('Error loading connection info:', error);
    }
  };

  const loadData = async () => {
    try {
      // Request current session from background
      const sessionResponse = await chrome.runtime.sendMessage({ action: 'getCurrentSession' });
      if (sessionResponse.success) {
        setCurrentSession(sessionResponse.data);
      }

      // Request all sessions
      const sessionsResponse = await chrome.runtime.sendMessage({ action: 'getSessions' });
      if (sessionsResponse.success) {
        setSessions(sessionsResponse.data);
      }

      // Load connection info
      await loadConnectionInfo();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'endSession' });
      await loadData();
    } catch (error) {
      console.error('Error ending session:', error);
    }
  };

  const handleTogglePause = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'togglePause' });
      if (response.success) {
        setExtensionState((prev) =>
          prev ? { ...prev, isPaused: response.data.isPaused } : null
        );
        setMessage({
          type: 'success',
          text: response.data.isPaused ? 'Tracking paused' : 'Tracking resumed',
        });
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (error) {
      console.error('Error toggling pause:', error);
    }
  };

  const handleForceSync = async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'forceSyncEvents' });
      setMessage({ type: 'success', text: 'Sync initiated' });
      setTimeout(() => setMessage(null), 2000);
      await loadConnectionInfo();
    } catch (error) {
      console.error('Error forcing sync:', error);
    }
  };

  const handleExportJSON = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'exportData' });
      if (response.success) {
        await exportToJSON(response.data);
        setMessage({ type: 'success', text: 'JSON exported successfully!' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error exporting JSON:', error);
      setMessage({ type: 'error', text: 'Failed to export JSON' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'exportData' });
      if (response.success) {
        await exportToCSV(response.data);
        setMessage({ type: 'success', text: 'CSV exported successfully!' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      setMessage({ type: 'error', text: 'Failed to export CSV' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleClearData = async () => {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      try {
        await chrome.runtime.sendMessage({ action: 'clearAllData' });
        await loadData();
      } catch (error) {
        console.error('Error clearing data:', error);
      }
    }
  };

  const getTotalTime = (session: Session): number => {
    return session.tabs.reduce((total, tab) => total + tab.timeSpent, 0);
  };

  const getTabsByCategory = (session: Session) => {
    const academic = session.tabs.filter(t => t.category === 'academic');
    const nonAcademic = session.tabs.filter(t => t.category === 'non-academic');
    const unknown = session.tabs.filter(t => t.category === 'unknown');

    return {
      academic: {
        count: academic.length,
        time: academic.reduce((sum, t) => sum + t.timeSpent, 0),
      },
      nonAcademic: {
        count: nonAcademic.length,
        time: nonAcademic.reduce((sum, t) => sum + t.timeSpent, 0),
      },
      unknown: {
        count: unknown.length,
        time: unknown.reduce((sum, t) => sum + t.timeSpent, 0),
      },
    };
  };

  if (loading) {
    return (
      <div className="w-96 h-96 flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-white">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Focus App Monitor</h1>
            <p className="text-sm opacity-90">Monitor your browsing activity</p>
          </div>
          <div className="flex items-center space-x-2">
            {/* Connection Status Indicator */}
            <div
              className={`w-3 h-3 rounded-full ${
                connectionStatus?.isConnected ? 'bg-green-400' : 'bg-gray-400'
              }`}
              title={connectionStatus?.isConnected ? 'Connected to Desktop App' : 'Disconnected'}
            />
            {/* Pause Status Indicator */}
            {extensionState?.isPaused && (
              <span className="text-xs bg-yellow-500 px-2 py-1 rounded">PAUSED</span>
            )}
          </div>
        </div>
      </div>

      {/* Message Notification */}
      {message && (
        <div className={`p-3 ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('current')}
          className={`flex-1 py-3 px-4 font-medium text-sm ${
            activeTab === 'current'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Current
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 px-4 font-medium text-sm ${
            activeTab === 'history'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-3 px-4 font-medium text-sm ${
            activeTab === 'status'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Status
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'current' && (
          <div>
            {currentSession ? (
              <>
                <div className="mb-4">
                  <p className="text-sm text-gray-600">
                    Started: {formatDate(currentSession.startTime)}
                  </p>
                  <p className="text-2xl font-bold text-gray-800 mt-2">
                    {formatTime(getTotalTime(currentSession))}
                  </p>
                  <p className="text-sm text-gray-600">Total active time</p>
                </div>

                <div className="space-y-3 mb-4">
                  {(() => {
                    const stats = getTabsByCategory(currentSession);
                    return (
                      <>
                        <div className="bg-green-50 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-green-800">Academic</span>
                            <span className="text-green-600">{formatTime(stats.academic.time)}</span>
                          </div>
                          <p className="text-sm text-green-600">{stats.academic.count} tabs</p>
                        </div>

                        <div className="bg-red-50 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-red-800">Non-Academic</span>
                            <span className="text-red-600">{formatTime(stats.nonAcademic.time)}</span>
                          </div>
                          <p className="text-sm text-red-600">{stats.nonAcademic.count} tabs</p>
                        </div>

                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-800">Unknown</span>
                            <span className="text-gray-600">{formatTime(stats.unknown.time)}</span>
                          </div>
                          <p className="text-sm text-gray-600">{stats.unknown.count} tabs</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <button
                  onClick={handleEndSession}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  End Current Session
                </button>
              </>
            ) : (
              <div className="text-center py-8 text-gray-600">
                <p>No active session</p>
                <p className="text-sm mt-2">Browse some websites to start tracking!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.slice(-10).reverse().map((session) => (
                  <div key={session.sessionId} className="border rounded-lg p-3 hover:bg-gray-50">
                    <p className="text-sm text-gray-600">{formatDate(session.startTime)}</p>
                    <p className="font-medium text-gray-800">{formatTime(getTotalTime(session))}</p>
                    <p className="text-sm text-gray-600">{session.tabs.length} tabs tracked</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-600">
                <p>No session history</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'status' && (
          <div className="space-y-4">
            {/* Connection Status */}
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-gray-800 mb-2">Desktop App Connection</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span
                  className={`text-sm font-medium ${
                    connectionStatus?.isConnected ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {connectionStatus?.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {connectionStatus?.isConnected && extensionState?.lastSyncTime && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-600">Last Sync</span>
                  <span className="text-sm text-gray-800">
                    {formatDate(extensionState.lastSyncTime)}
                  </span>
                </div>
              )}
            </div>

            {/* Tracking Status */}
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-gray-800 mb-2">Tracking Status</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span
                  className={`text-sm font-medium ${
                    extensionState?.isPaused ? 'text-yellow-600' : 'text-green-600'
                  }`}
                >
                  {extensionState?.isPaused ? 'Paused' : 'Active'}
                </span>
              </div>
              <button
                onClick={handleTogglePause}
                className={`w-full mt-3 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  extensionState?.isPaused
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-yellow-500 text-white hover:bg-yellow-600'
                }`}
              >
                {extensionState?.isPaused ? 'Resume Tracking' : 'Pause Tracking'}
              </button>
            </div>

            {/* Pending Events */}
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-gray-800 mb-2">Pending Events</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Events waiting to sync</span>
                <span className="text-sm font-medium text-gray-800">{pendingCount}</span>
              </div>
              {connectionStatus?.isConnected && pendingCount > 0 && (
                <button
                  onClick={handleForceSync}
                  className="w-full mt-3 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Sync Now
                </button>
              )}
            </div>

            {/* Stats */}
            {stats && (
              <div className="border rounded-lg p-3">
                <h3 className="font-medium text-gray-800 mb-2">Statistics</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Events Captured</span>
                    <span className="text-sm font-medium text-gray-800">
                      {stats.totalEventsCaptured}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Events Synced</span>
                    <span className="text-sm font-medium text-gray-800">
                      {stats.totalEventsSynced}
                    </span>
                  </div>
                </div>
                {stats.lastError && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-600">
                    {stats.lastError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t p-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleExportJSON}
            className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors text-sm"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportCSV}
            className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors text-sm"
          >
            Export CSV
          </button>
        </div>

        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors text-sm"
        >
          Settings
        </button>

        <button
          onClick={handleClearData}
          className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors text-sm"
        >
          Clear All Data
        </button>
      </div>
    </div>
  );
}

// Mount the React app
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Popup />);
}
