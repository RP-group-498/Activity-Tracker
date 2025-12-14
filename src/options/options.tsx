import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Settings } from '../types';
import { StorageManager } from '../utils/storage';
import '../index.css';

function Options() {
  const [settings, setSettings] = useState<Settings>({
    trackingEnabled: true,
    academicDomains: [],
    nonAcademicDomains: [],
    idleThreshold: 60,
    dataRetentionDays: 30,
  });
  const [saved, setSaved] = useState(false);
  const [newAcademicDomain, setNewAcademicDomain] = useState('');
  const [newNonAcademicDomain, setNewNonAcademicDomain] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const loadedSettings = await StorageManager.getSettings();
    setSettings(loadedSettings);
  };

  const saveSettings = async () => {
    await chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAddAcademicDomain = () => {
    if (newAcademicDomain.trim()) {
      setSettings({
        ...settings,
        academicDomains: [...settings.academicDomains, newAcademicDomain.trim()],
      });
      setNewAcademicDomain('');
    }
  };

  const handleRemoveAcademicDomain = (domain: string) => {
    setSettings({
      ...settings,
      academicDomains: settings.academicDomains.filter(d => d !== domain),
    });
  };

  const handleAddNonAcademicDomain = () => {
    if (newNonAcademicDomain.trim()) {
      setSettings({
        ...settings,
        nonAcademicDomains: [...settings.nonAcademicDomains, newNonAcademicDomain.trim()],
      });
      setNewNonAcademicDomain('');
    }
  };

  const handleRemoveNonAcademicDomain = (domain: string) => {
    setSettings({
      ...settings,
      nonAcademicDomains: settings.nonAcademicDomains.filter(d => d !== domain),
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Behavior Tracker Settings</h1>
          <p className="text-gray-600 mt-2">Configure how your browsing activity is tracked and categorized</p>
        </div>

        {/* Tracking Toggle */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">General Settings</h2>

          <div className="flex items-center justify-between mb-4">
            <div>
              <label className="font-medium text-gray-700">Enable Tracking</label>
              <p className="text-sm text-gray-600">Track your browsing activity</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.trackingEnabled}
                onChange={(e) => setSettings({ ...settings, trackingEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="mb-4">
            <label className="block font-medium text-gray-700 mb-2">
              Idle Threshold (seconds)
            </label>
            <input
              type="number"
              value={settings.idleThreshold}
              onChange={(e) => setSettings({ ...settings, idleThreshold: parseInt(e.target.value) || 60 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="15"
              max="300"
            />
            <p className="text-sm text-gray-600 mt-1">
              Stop tracking after this many seconds of inactivity
            </p>
          </div>

          <div className="mb-4">
            <label className="block font-medium text-gray-700 mb-2">
              Data Retention (days)
            </label>
            <input
              type="number"
              value={settings.dataRetentionDays}
              onChange={(e) => setSettings({ ...settings, dataRetentionDays: parseInt(e.target.value) || 30 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min="1"
              max="365"
            />
            <p className="text-sm text-gray-600 mt-1">
              Automatically delete data older than this many days
            </p>
          </div>
        </div>

        {/* Academic Domains */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Academic Domains</h2>
          <p className="text-gray-600 mb-4">
            Websites that should be categorized as academic/productive
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newAcademicDomain}
              onChange={(e) => setNewAcademicDomain(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddAcademicDomain()}
              placeholder="e.g., github.com, stackoverflow.com"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleAddAcademicDomain}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {settings.academicDomains.map((domain) => (
              <div key={domain} className="flex items-center justify-between bg-green-50 px-4 py-2 rounded-lg">
                <span className="text-gray-800">{domain}</span>
                <button
                  onClick={() => handleRemoveAcademicDomain(domain)}
                  className="text-red-600 hover:text-red-800 font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Non-Academic Domains */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Non-Academic Domains</h2>
          <p className="text-gray-600 mb-4">
            Websites that should be categorized as non-academic/distracting
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newNonAcademicDomain}
              onChange={(e) => setNewNonAcademicDomain(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddNonAcademicDomain()}
              placeholder="e.g., youtube.com, facebook.com"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleAddNonAcademicDomain}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {settings.nonAcademicDomains.map((domain) => (
              <div key={domain} className="flex items-center justify-between bg-red-50 px-4 py-2 rounded-lg">
                <span className="text-gray-800">{domain}</span>
                <button
                  onClick={() => handleRemoveNonAcademicDomain(domain)}
                  className="text-red-600 hover:text-red-800 font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <button
            onClick={saveSettings}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            {saved ? '✓ Settings Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Mount the React app
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Options />);
}
