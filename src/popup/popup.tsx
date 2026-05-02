import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Session, ExtensionState } from '../types';
import { formatTime, formatDate } from '../utils/helpers';
import { exportToJSON } from '../utils/export';
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
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    loadData();
    // Refresh connection status periodically
    const interval = setInterval(loadConnectionInfo, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadConnectionInfo = async () => {
    try {
      const [stateRes, connRes, pendingRes] = await Promise.all([
        chrome.runtime.sendMessage({ action: 'getExtensionState' }),
        chrome.runtime.sendMessage({ action: 'getConnectionStatus' }),
        chrome.runtime.sendMessage({ action: 'getStats' }),
        chrome.runtime.sendMessage({ action: 'getPendingEventsCount' }),
      ]);

      if (stateRes?.success) setExtensionState(stateRes.data);
      if (connRes?.success) setConnectionStatus(connRes.data);
      if (pendingRes?.success) setPendingCount(pendingRes.data.count);
    } catch (error) {
      console.error('Error loading connection info:', error);
    }
  };

  const loadData = async () => {
    try {
      // Request current session from background
      const sessionResponse = await chrome.runtime.sendMessage({ action: 'getCurrentSession' });
      if (sessionResponse?.success) {
        setCurrentSession(sessionResponse.data);
      }

      // Request all sessions
      const sessionsResponse = await chrome.runtime.sendMessage({ action: 'getSessions' });
      if (sessionsResponse?.success) {
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
      if (response?.success) {
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
      // Wait a bit for the sync to complete and update count
      setTimeout(loadConnectionInfo, 1000);
    } catch (error) {
      console.error('Error forcing sync:', error);
    }
  };

  const handleExportJSON = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'exportData' });
      if (response?.success) {
        await exportToJSON(response.data);
        setMessage({ type: 'success', text: 'JSON exported' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error exporting JSON:', error);
      setMessage({ type: 'error', text: 'Failed to export JSON' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleClearData = async () => {
    if (confirm('Clear all local data? This will not affect the desktop app.')) {
      try {
        await chrome.runtime.sendMessage({ action: 'clearAllData' });
        await loadData();
        setMessage({ type: 'success', text: 'Data cleared' });
        setTimeout(() => setMessage(null), 2000);
      } catch (error) {
        console.error('Error clearing data:', error);
      }
    }
  };

  const getTotalTime = (session: Session): number => {
    return session.tabs.reduce((total, tab) => total + tab.timeSpent, 0);
  };

  const getStatsByCategory = (session: Session) => {
    const academic = session.tabs.filter(t => t.category === 'academic');
    const nonAcademic = session.tabs.filter(t => t.category === 'non-academic' || (t.category as any) === 'non_academic');

    return {
      academic: {
        count: academic.length,
        time: academic.reduce((sum, t) => sum + t.timeSpent, 0),
      },
      nonAcademic: {
        count: nonAcademic.length,
        time: nonAcademic.reduce((sum, t) => sum + t.timeSpent, 0),
      },
    };
  };

  if (loading) {
    return (
      <div className="w-80 h-96 flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white shadow-xl flex flex-col font-sans text-slate-800 overflow-hidden">
      {/* Premium Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-5 pb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold tracking-tight">Focus Flow</h1>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ring-4 ${connectionStatus?.isConnected ? 'bg-emerald-400 ring-emerald-400/20' : 'bg-slate-400 ring-slate-400/20'
                }`}
              title={connectionStatus?.isConnected ? 'Sync Active' : 'Disconnected'}
            />
          </div>
        </div>
        <p className="text-indigo-100 text-xs font-medium opacity-80">
          {connectionStatus?.isConnected ? 'Connected to Desktop' : 'Standalone Mode'}
        </p>
      </div>

      {/* Tabs - Modern Minimalist */}
      <div className="flex px-4 -mt-4">
        <div className="flex bg-white rounded-xl shadow-md p-1 w-full border border-slate-100">
          {(['current', 'history', 'status'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${activeTab === tab
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Message Notification */}
      {message && (
        <div className="px-4 mt-3">
          <div className={`p-2 rounded-lg text-center text-xs font-semibold animate-in fade-in slide-in-from-top-1 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}>
            {message.text}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="p-4 flex-1 min-h-[300px] max-h-[400px] overflow-y-auto custom-scrollbar">
        {activeTab === 'current' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {currentSession ? (
              <>
                <div className="text-center py-2">
                  <div className="text-3xl font-black text-slate-900 tracking-tight">
                    {formatTime(getTotalTime(currentSession))}
                  </div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mt-1">Total Focus Time</p>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {(() => {
                    const stats = getStatsByCategory(currentSession);
                    return (
                      <>
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center space-x-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                            <span className="text-sm font-semibold text-slate-700">Academic</span>
                          </div>
                          <span className="text-sm font-mono font-bold text-indigo-600">{formatTime(stats.academic.time)}</span>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center space-x-3">
                            <div className="w-2 h-2 rounded-full bg-slate-300" />
                            <span className="text-sm font-semibold text-slate-700">Others</span>
                          </div>
                          <span className="text-sm font-mono font-bold text-slate-500">{formatTime(stats.nonAcademic.time)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <button
                  onClick={handleEndSession}
                  className="w-full mt-4 bg-slate-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-[0.98]"
                >
                  Complete Session
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                <svg className="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-500">Ready to start?</p>
                  <p className="text-xs">Browse to begin tracking</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2 animate-in fade-in duration-300">
            {sessions.length > 0 ? (
              sessions.slice(-8).reverse().map((session) => (
                <div key={session.sessionId} className="group p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{formatDate(session.startTime).split(',')[0]}</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{formatTime(getTotalTime(session))}</p>
                    </div>
                    <div className="bg-slate-100 group-hover:bg-indigo-100 text-[10px] font-bold px-2 py-1 rounded text-slate-500 group-hover:text-indigo-600 transition-colors">
                      {session.tabs.length} tabs
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">No recent sessions found</div>
            )}
          </div>
        )}

        {activeTab === 'status' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            {/* Sync Card */}
            <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">Pending Sync</h3>
                  <span className="text-xl font-black">{pendingCount}</span>
                </div>
                <p className="text-[10px] text-indigo-100 mb-3">Activities waiting for desktop sync</p>
                <button
                  disabled={!connectionStatus?.isConnected || pendingCount === 0}
                  onClick={handleForceSync}
                  className="w-full py-2 bg-white/20 hover:bg-white/30 disabled:opacity-30 disabled:hover:bg-white/20 rounded-lg text-xs font-bold transition-all backdrop-blur-md"
                >
                  Sync Now
                </button>
              </div>
              {/* Decoration */}
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            </div>

            {/* Connection Status */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Desktop Bridge</p>
                <p className={`text-xs font-bold mt-1 ${connectionStatus?.isConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {connectionStatus?.isConnected ? 'Live' : 'Offline'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Tracker State</p>
                <p className={`text-xs font-bold mt-1 ${extensionState?.isPaused ? 'text-amber-500' : 'text-indigo-600'}`}>
                  {extensionState?.isPaused ? 'Paused' : 'Capturing'}
                </p>
              </div>
            </div>

            <button
              onClick={handleTogglePause}
              className={`w-full py-3 rounded-xl text-xs font-bold transition-all border ${extensionState?.isPaused
                ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
                : 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100'
                }`}
            >
              {extensionState?.isPaused ? 'Resume Tracking' : 'Pause Tracking'}
            </button>
          </div>
        )}
      </div>

      {/* Modern Footer Actions */}
      <div className="p-4 bg-slate-50 border-t border-slate-100">
        <div className="flex space-x-2">
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center space-x-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span>Settings</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center space-x-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            <span>Export</span>
          </button>
        </div>
        <button
          onClick={handleClearData}
          className="w-full mt-2 py-2 text-rose-400 hover:text-rose-600 text-[10px] font-bold uppercase tracking-widest transition-colors"
        >
          Reset Local Data
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
