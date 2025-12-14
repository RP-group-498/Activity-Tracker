/**
 * Classification Cache
 *
 * This is Tier 3 of the classification system.
 * Stores previously classified domains and user overrides.
 * Persists to chrome.storage.local for durability across sessions.
 */

import {
  Category,
  DomainClassification,
  CacheStats,
} from './types';

const CACHE_STORAGE_KEY = 'domainClassifications';
const USER_OVERRIDES_KEY = 'userClassificationOverrides';
const CACHE_STATS_KEY = 'classificationStats';
const MAX_CACHE_SIZE = 10000; // Maximum number of cached domains

/**
 * Manages the classification cache using chrome.storage.local
 */
export class ClassificationCache {
  private cache: Map<string, DomainClassification>;
  private userOverrides: Map<string, DomainClassification>;
  private stats: CacheStats;
  private initialized: boolean = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.cache = new Map();
    this.userOverrides = new Map();
    this.stats = this.createEmptyStats();
  }

  /**
   * Create empty stats object
   */
  private createEmptyStats(): CacheStats {
    return {
      totalClassified: 0,
      bySource: {
        database: 0,
        rule: 0,
        cache: 0,
        api: 0,
        user: 0,
      },
      byCategory: {
        academic: 0,
        productivity: 0,
        neutral: 0,
        non_academic: 0,
      },
    };
  }

  /**
   * Initialize cache from storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const result = await chrome.storage.local.get([
        CACHE_STORAGE_KEY,
        USER_OVERRIDES_KEY,
        CACHE_STATS_KEY,
      ]);

      // Load classifications cache
      if (result[CACHE_STORAGE_KEY]) {
        const cacheData = result[CACHE_STORAGE_KEY] as Record<string, DomainClassification>;
        this.cache = new Map(Object.entries(cacheData));
      }

      // Load user overrides
      if (result[USER_OVERRIDES_KEY]) {
        const overridesData = result[USER_OVERRIDES_KEY] as Record<string, DomainClassification>;
        this.userOverrides = new Map(Object.entries(overridesData));
      }

      // Load stats
      if (result[CACHE_STATS_KEY]) {
        this.stats = result[CACHE_STATS_KEY] as CacheStats;
      }

      this.initialized = true;
      console.log(`Classification cache initialized: ${this.cache.size} cached, ${this.userOverrides.size} overrides`);
    } catch (error) {
      console.error('Failed to initialize classification cache:', error);
      this.initialized = true; // Continue with empty cache
    }
  }

  /**
   * Get a classification from cache
   * User overrides take priority over regular cache
   */
  get(domain: string): DomainClassification | null {
    const normalizedDomain = domain.toLowerCase();

    // Check user overrides first (highest priority)
    const override = this.userOverrides.get(normalizedDomain);
    if (override) {
      return { ...override, userOverride: true };
    }

    // Check regular cache
    return this.cache.get(normalizedDomain) || null;
  }

  /**
   * Store a classification in cache
   */
  set(domain: string, classification: DomainClassification): void {
    const normalizedDomain = domain.toLowerCase();

    // Don't cache if it's already a user override
    if (this.userOverrides.has(normalizedDomain)) {
      return;
    }

    // Ensure cache doesn't grow too large
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictOldEntries();
    }

    this.cache.set(normalizedDomain, {
      ...classification,
      domain: normalizedDomain,
    });

    // Update stats
    this.updateStats(classification);

    // Schedule save (debounced)
    this.scheduleSave();
  }

  /**
   * Set a user override (manual correction)
   */
  setUserOverride(domain: string, category: Category, _note?: string): void {
    const normalizedDomain = domain.toLowerCase();

    const override: DomainClassification = {
      domain: normalizedDomain,
      category,
      confidence: 1.0, // User overrides have full confidence
      source: 'user',
      timestamp: Date.now(),
      userOverride: true,
    };

    this.userOverrides.set(normalizedDomain, override);

    // Also update the main cache
    this.cache.set(normalizedDomain, override);

    // Update stats
    this.stats.bySource.user++;
    this.stats.byCategory[category]++;
    this.stats.totalClassified++;

    // Save immediately for user actions
    this.saveToStorage();
  }

  /**
   * Remove a user override
   */
  removeUserOverride(domain: string): boolean {
    const normalizedDomain = domain.toLowerCase();
    const existed = this.userOverrides.delete(normalizedDomain);

    if (existed) {
      // Also remove from main cache so it can be reclassified
      this.cache.delete(normalizedDomain);
      this.saveToStorage();
    }

    return existed;
  }

  /**
   * Get all user overrides
   */
  getUserOverrides(): Map<string, DomainClassification> {
    return new Map(this.userOverrides);
  }

  /**
   * Check if domain has a user override
   */
  hasUserOverride(domain: string): boolean {
    return this.userOverrides.has(domain.toLowerCase());
  }

  /**
   * Update classification statistics
   */
  private updateStats(classification: DomainClassification): void {
    this.stats.totalClassified++;
    this.stats.bySource[classification.source]++;
    this.stats.byCategory[classification.category]++;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rate (cache hits / total lookups)
   */
  getCacheHitRate(): number {
    const cacheHits = this.stats.bySource.cache;
    const total = this.stats.totalClassified;
    return total > 0 ? cacheHits / total : 0;
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldEntries(): void {
    // Sort by timestamp and remove oldest 20%
    const entries = Array.from(this.cache.entries())
      .filter(([domain]) => !this.userOverrides.has(domain)) // Don't evict user overrides
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const evictCount = Math.floor(entries.length * 0.2);
    for (let i = 0; i < evictCount; i++) {
      this.cache.delete(entries[i][0]);
    }

    console.log(`Evicted ${evictCount} old cache entries`);
  }

  /**
   * Schedule a save to storage (debounced)
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveToStorage();
    }, 5000); // Save after 5 seconds of inactivity
  }

  /**
   * Save cache to chrome.storage.local
   */
  async saveToStorage(): Promise<void> {
    try {
      const cacheData: Record<string, DomainClassification> = {};
      this.cache.forEach((value, key) => {
        cacheData[key] = value;
      });

      const overridesData: Record<string, DomainClassification> = {};
      this.userOverrides.forEach((value, key) => {
        overridesData[key] = value;
      });

      await chrome.storage.local.set({
        [CACHE_STORAGE_KEY]: cacheData,
        [USER_OVERRIDES_KEY]: overridesData,
        [CACHE_STATS_KEY]: this.stats,
      });
    } catch (error) {
      console.error('Failed to save classification cache:', error);
    }
  }

  /**
   * Clear all cached classifications (preserves user overrides)
   */
  async clearCache(): Promise<void> {
    this.cache.clear();

    // Re-add user overrides to cache
    this.userOverrides.forEach((classification, domain) => {
      this.cache.set(domain, classification);
    });

    // Reset stats but keep user override count
    const userCount = this.stats.bySource.user;
    this.stats = this.createEmptyStats();
    this.stats.bySource.user = userCount;

    await this.saveToStorage();
  }

  /**
   * Clear everything including user overrides
   */
  async clearAll(): Promise<void> {
    this.cache.clear();
    this.userOverrides.clear();
    this.stats = this.createEmptyStats();

    await chrome.storage.local.remove([
      CACHE_STORAGE_KEY,
      USER_OVERRIDES_KEY,
      CACHE_STATS_KEY,
    ]);
  }

  /**
   * Export cache data for backup
   */
  export(): {
    classifications: Record<string, DomainClassification>;
    userOverrides: Record<string, DomainClassification>;
    stats: CacheStats;
  } {
    const classifications: Record<string, DomainClassification> = {};
    this.cache.forEach((value, key) => {
      classifications[key] = value;
    });

    const userOverrides: Record<string, DomainClassification> = {};
    this.userOverrides.forEach((value, key) => {
      userOverrides[key] = value;
    });

    return {
      classifications,
      userOverrides,
      stats: this.stats,
    };
  }

  /**
   * Import cache data from backup
   */
  async import(data: {
    classifications?: Record<string, DomainClassification>;
    userOverrides?: Record<string, DomainClassification>;
  }): Promise<void> {
    if (data.classifications) {
      Object.entries(data.classifications).forEach(([domain, classification]) => {
        this.cache.set(domain, classification);
      });
    }

    if (data.userOverrides) {
      Object.entries(data.userOverrides).forEach(([domain, classification]) => {
        this.userOverrides.set(domain, classification);
        this.cache.set(domain, classification);
      });
    }

    await this.saveToStorage();
  }

  /**
   * Get cache size
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let cacheInstance: ClassificationCache | null = null;

/**
 * Get the singleton cache instance
 */
export function getClassificationCache(): ClassificationCache {
  if (!cacheInstance) {
    cacheInstance = new ClassificationCache();
  }
  return cacheInstance;
}

/**
 * Initialize the classification cache
 */
export async function initializeClassificationCache(): Promise<ClassificationCache> {
  const cache = getClassificationCache();
  await cache.initialize();
  return cache;
}
