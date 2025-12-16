/**
 * Exclusion Manager Service
 * Manages domain exclusions for privacy - allows users to exclude specific domains from tracking.
 *
 * Includes default exclusions for sensitive domains (banking, health, etc.)
 */

import { UserPreferences } from '../types';

const PREFERENCES_KEY = 'preferences';

// Default exclusions for sensitive domains
const DEFAULT_EXCLUSIONS: string[] = [
  // Banking & Finance
  '*.bank.*',
  '*.banking.*',
  'paypal.com',
  'venmo.com',
  '*.creditcard.*',
  // Health
  '*.health.*',
  '*.medical.*',
  'patient.*',
  '*.hospital.*',
  // Personal/Dating
  '*.dating.*',
  'tinder.com',
  'bumble.com',
  'match.com',
  // Authentication/Security
  '*.auth.*',
  '*.login.*',
  '*.signin.*',
];

// Non-trackable URL prefixes (browser internal pages)
const NON_TRACKABLE_PREFIXES: string[] = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'file://',
  'devtools://',
  'moz-extension://',
];

/**
 * Exclusion Manager - Singleton
 */
class ExclusionManager {
  private userExclusions: string[] = [];
  private initialized: boolean = false;

  /**
   * Initialize the exclusion manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const data = await chrome.storage.local.get(PREFERENCES_KEY);
    const preferences: UserPreferences = data[PREFERENCES_KEY] || {
      trackIncognito: false,
      excludedDomains: [],
      idleThresholdSeconds: 60,
    };
    this.userExclusions = preferences.excludedDomains || [];
    this.initialized = true;
  }

  /**
   * Get all excluded domains (user-defined)
   */
  async getExcludedDomains(): Promise<string[]> {
    await this.ensureInitialized();
    return [...this.userExclusions];
  }

  /**
   * Get all exclusions including defaults
   */
  async getAllExclusions(): Promise<string[]> {
    await this.ensureInitialized();
    return [...DEFAULT_EXCLUSIONS, ...this.userExclusions];
  }

  /**
   * Add a domain exclusion
   */
  async addExclusion(domain: string): Promise<void> {
    await this.ensureInitialized();

    const normalizedDomain = domain.toLowerCase().trim();
    if (!this.userExclusions.includes(normalizedDomain)) {
      this.userExclusions.push(normalizedDomain);
      await this.saveExclusions();
    }
  }

  /**
   * Remove a domain exclusion
   */
  async removeExclusion(domain: string): Promise<boolean> {
    await this.ensureInitialized();

    const normalizedDomain = domain.toLowerCase().trim();
    const index = this.userExclusions.indexOf(normalizedDomain);

    if (index !== -1) {
      this.userExclusions.splice(index, 1);
      await this.saveExclusions();
      return true;
    }

    return false;
  }

  /**
   * Check if a domain is excluded
   */
  async isExcluded(domain: string): Promise<boolean> {
    await this.ensureInitialized();

    const normalizedDomain = domain.toLowerCase();
    const allExclusions = [...DEFAULT_EXCLUSIONS, ...this.userExclusions];

    return allExclusions.some((pattern) => this.matchesPattern(normalizedDomain, pattern));
  }

  /**
   * Check if a URL should be tracked
   */
  async shouldTrackUrl(url: string): Promise<boolean> {
    if (!url) return false;

    // Check for non-trackable URL prefixes
    if (NON_TRACKABLE_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return false;
    }

    // Check domain exclusions
    const domain = this.extractDomain(url);
    if (!domain) return false;

    const isExcluded = await this.isExcluded(domain);
    return !isExcluded;
  }

  /**
   * Check if a URL is a browser internal page
   */
  isInternalUrl(url: string): boolean {
    if (!url) return true;
    return NON_TRACKABLE_PREFIXES.some((prefix) => url.startsWith(prefix));
  }

  /**
   * Check if URL contains sensitive keywords
   */
  isSensitiveUrl(url: string): boolean {
    const sensitivePatterns = [
      'password',
      'passwd',
      'login',
      'signin',
      'auth',
      'oauth',
      'token',
      'api_key',
      'apikey',
      'secret',
    ];

    const lowerUrl = url.toLowerCase();
    return sensitivePatterns.some((pattern) => lowerUrl.includes(pattern));
  }

  /**
   * Get default exclusions (read-only)
   */
  getDefaultExclusions(): readonly string[] {
    return DEFAULT_EXCLUSIONS;
  }

  /**
   * Clear all user exclusions
   */
  async clearUserExclusions(): Promise<void> {
    await this.ensureInitialized();
    this.userExclusions = [];
    await this.saveExclusions();
  }

  /**
   * Import exclusions from a list
   */
  async importExclusions(domains: string[]): Promise<number> {
    await this.ensureInitialized();

    let added = 0;
    for (const domain of domains) {
      const normalizedDomain = domain.toLowerCase().trim();
      if (normalizedDomain && !this.userExclusions.includes(normalizedDomain)) {
        this.userExclusions.push(normalizedDomain);
        added++;
      }
    }

    if (added > 0) {
      await this.saveExclusions();
    }

    return added;
  }

  /**
   * Export user exclusions
   */
  async exportExclusions(): Promise<string[]> {
    await this.ensureInitialized();
    return [...this.userExclusions];
  }

  /**
   * Save exclusions to storage
   */
  private async saveExclusions(): Promise<void> {
    const data = await chrome.storage.local.get(PREFERENCES_KEY);
    const preferences: UserPreferences = data[PREFERENCES_KEY] || {
      trackIncognito: false,
      excludedDomains: [],
      idleThresholdSeconds: 60,
    };

    preferences.excludedDomains = this.userExclusions;
    await chrome.storage.local.set({ [PREFERENCES_KEY]: preferences });
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Check if a domain matches a pattern (supports wildcards)
   */
  private matchesPattern(domain: string, pattern: string): boolean {
    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(domain);
    }

    // Exact match or suffix match
    return domain === pattern || domain.endsWith('.' + pattern);
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
let managerInstance: ExclusionManager | null = null;

/**
 * Get the singleton exclusion manager instance
 */
export function getExclusionManager(): ExclusionManager {
  if (!managerInstance) {
    managerInstance = new ExclusionManager();
  }
  return managerInstance;
}
