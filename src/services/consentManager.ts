/**
 * Consent Manager Service
 * Handles user consent for data collection with version tracking.
 *
 * Privacy principles:
 * 1. Opt-in by default - Never track without explicit consent
 * 2. Transparency - User can always see what's being tracked
 * 3. Control - User can pause, exclude sites, or delete data anytime
 * 4. Minimization - Only collect what's needed for classification
 */

import { ConsentData, ConsentOptions } from '../types';

const CONSENT_VERSION = '1.0';
const STORAGE_KEY = 'consent';

/**
 * Consent Manager - Singleton
 */
class ConsentManager {
  private consent: ConsentData | null = null;
  private initialized: boolean = false;

  /**
   * Initialize the consent manager by loading stored consent
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const data = await chrome.storage.local.get(STORAGE_KEY);
    this.consent = data[STORAGE_KEY] || null;
    this.initialized = true;
  }

  /**
   * Check if user has given valid consent
   */
  async hasValidConsent(): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.consent) return false;

    // Check if consent version matches current
    return this.consent.version === CONSENT_VERSION && this.consent.granted === true;
  }

  /**
   * Check if consent was explicitly declined
   */
  async wasDeclined(): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.consent) return false;

    return this.consent.granted === false && !!this.consent.declinedAt;
  }

  /**
   * Record user consent
   */
  async grantConsent(options: Partial<ConsentOptions> = {}): Promise<ConsentData> {
    await this.ensureInitialized();

    this.consent = {
      granted: true,
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      options: {
        trackBrowsing: options.trackBrowsing ?? true,
        trackIdleTime: options.trackIdleTime ?? true,
        trackIncognito: options.trackIncognito ?? false,
        shareAnonymousStats: options.shareAnonymousStats ?? false,
      },
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: this.consent });
    return this.consent;
  }

  /**
   * Record consent decline
   */
  async declineConsent(): Promise<void> {
    await this.ensureInitialized();

    this.consent = {
      granted: false,
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      declinedAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: this.consent });
  }

  /**
   * Revoke consent and optionally clear all data
   */
  async revokeConsent(clearData: boolean = true): Promise<void> {
    await this.ensureInitialized();

    if (clearData) {
      // Clear all stored data except consent record
      const keys = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(keys).filter((k) => k !== STORAGE_KEY);
      await chrome.storage.local.remove(keysToRemove);
    }

    // Update consent to revoked state
    this.consent = {
      granted: false,
      version: CONSENT_VERSION,
      timestamp: this.consent?.timestamp || new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: this.consent });
  }

  /**
   * Get current consent options
   */
  async getConsentOptions(): Promise<ConsentOptions | null> {
    await this.ensureInitialized();
    return this.consent?.options || null;
  }

  /**
   * Get full consent data
   */
  async getConsentData(): Promise<ConsentData | null> {
    await this.ensureInitialized();
    return this.consent;
  }

  /**
   * Update a specific consent option
   */
  async updateConsentOption<K extends keyof ConsentOptions>(
    option: K,
    value: ConsentOptions[K]
  ): Promise<void> {
    await this.ensureInitialized();

    if (this.consent?.options) {
      this.consent.options[option] = value;
      this.consent.lastModified = new Date().toISOString();
      await chrome.storage.local.set({ [STORAGE_KEY]: this.consent });
    }
  }

  /**
   * Check if a specific tracking option is enabled
   */
  async isOptionEnabled(option: keyof ConsentOptions): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.consent?.granted || !this.consent.options) {
      return false;
    }

    return this.consent.options[option] ?? false;
  }

  /**
   * Check if tracking is allowed (consent granted and tracking enabled)
   */
  async canTrack(): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.consent?.granted || !this.consent.options) {
      return false;
    }

    return this.consent.options.trackBrowsing === true;
  }

  /**
   * Check if idle tracking is allowed
   */
  async canTrackIdle(): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.consent?.granted || !this.consent.options) {
      return false;
    }

    return this.consent.options.trackIdleTime === true;
  }

  /**
   * Check if incognito tracking is allowed
   */
  async canTrackIncognito(): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.consent?.granted || !this.consent.options) {
      return false;
    }

    return this.consent.options.trackIncognito === true;
  }

  /**
   * Get the current consent version
   */
  getCurrentVersion(): string {
    return CONSENT_VERSION;
  }

  /**
   * Check if consent needs to be re-obtained due to version change
   */
  async needsConsentUpdate(): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.consent) return true;
    if (!this.consent.granted) return false; // No need to update declined consent

    return this.consent.version !== CONSENT_VERSION;
  }

  /**
   * Ensure the manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Singleton instance
let managerInstance: ConsentManager | null = null;

/**
 * Get the singleton consent manager instance
 */
export function getConsentManager(): ConsentManager {
  if (!managerInstance) {
    managerInstance = new ConsentManager();
  }
  return managerInstance;
}
