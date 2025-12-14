/**
 * Classification Service
 *
 * Main entry point for the domain classification system.
 * Orchestrates the 4-tier classification pipeline:
 *   1. User Overrides (highest priority)
 *   2. Database lookup
 *   3. Rule engine
 *   4. Cache (for API results, future external service)
 *
 * Every domain MUST be classified - no "unknown" category.
 */

import {
  Category,
  DomainClassification,
  ClassificationMetrics,
  CacheStats,
} from './types';
import {
  DomainDatabaseManager,
  getDomainDatabase,
} from './database';
import { RuleEngine, getRuleEngine } from './rules';
import {
  ClassificationCache,
  getClassificationCache,
} from './cache';

// Re-export types for external use
export * from './types';
export { parseDomain } from './rules';

/**
 * Main Classification Service
 */
export class ClassificationService {
  private database: DomainDatabaseManager;
  private ruleEngine: RuleEngine;
  private cache: ClassificationCache;
  private initialized: boolean = false;

  // Metrics tracking
  private metrics: ClassificationMetrics;

  constructor() {
    this.database = getDomainDatabase();
    this.ruleEngine = getRuleEngine();
    this.cache = getClassificationCache();
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): ClassificationMetrics {
    return {
      totalClassifications: 0,
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
        nonAcademic: 0,
      },
      apiCalls: {
        total: 0,
        successful: 0,
        failed: 0,
        avgLatencyMs: 0,
      },
      cacheHitRate: 0,
    };
  }

  /**
   * Initialize the classification service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize all components in parallel
      await Promise.all([
        this.database.initialize(),
        this.cache.initialize(),
      ]);

      this.initialized = true;
      console.log('Classification service initialized');
    } catch (error) {
      console.error('Failed to initialize classification service:', error);
      throw error;
    }
  }

  /**
   * Classify a domain
   *
   * Classification priority:
   * 1. User override (from cache)
   * 2. Cache hit (previously classified)
   * 3. Database lookup
   * 4. Rule engine
   * 5. Default to 'neutral' if nothing matches
   *
   * @param domain - The domain to classify
   * @returns Classification result
   */
  classify(domain: string): DomainClassification {
    if (!this.initialized) {
      console.warn('Classification service not initialized, using default');
      return this.createDefaultClassification(domain);
    }

    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

    // Step 1: Check cache (includes user overrides)
    const cached = this.cache.get(normalizedDomain);
    if (cached) {
      this.updateMetrics(cached);
      // Mark as cache hit if it wasn't a fresh classification
      if (!cached.userOverride) {
        this.metrics.bySource.cache++;
      }
      return cached;
    }

    // Step 2: Try database lookup
    const dbResult = this.database.classify(normalizedDomain);
    if (dbResult) {
      this.cache.set(normalizedDomain, dbResult);
      this.updateMetrics(dbResult);
      return dbResult;
    }

    // Step 3: Try rule engine
    const ruleResult = this.ruleEngine.classify(normalizedDomain);
    if (ruleResult) {
      this.cache.set(normalizedDomain, ruleResult);
      this.updateMetrics(ruleResult);
      return ruleResult;
    }

    // Step 4: Default classification (neutral)
    // In production, this is where an API call would go
    const defaultResult = this.createDefaultClassification(normalizedDomain);
    this.cache.set(normalizedDomain, defaultResult);
    this.updateMetrics(defaultResult);

    return defaultResult;
  }

  /**
   * Create a default classification for unknown domains
   */
  private createDefaultClassification(domain: string): DomainClassification {
    return {
      domain: domain.toLowerCase(),
      category: 'neutral',
      confidence: 0.5, // Low confidence for unclassified domains
      source: 'rule', // Marked as rule since it's a fallback
      timestamp: Date.now(),
    };
  }

  /**
   * Update metrics after a classification
   */
  private updateMetrics(classification: DomainClassification): void {
    this.metrics.totalClassifications++;
    this.metrics.bySource[classification.source]++;

    // Map category to metrics key
    const categoryKey = classification.category === 'non_academic'
      ? 'nonAcademic'
      : classification.category;
    this.metrics.byCategory[categoryKey as keyof typeof this.metrics.byCategory]++;

    // Update cache hit rate
    const cacheStats = this.cache.getStats();
    this.metrics.cacheHitRate = cacheStats.totalClassified > 0
      ? cacheStats.bySource.cache / cacheStats.totalClassified
      : 0;
  }

  /**
   * Manually set a domain's category (user override)
   */
  setUserOverride(domain: string, category: Category): void {
    this.cache.setUserOverride(domain.toLowerCase(), category);
    this.metrics.bySource.user++;
  }

  /**
   * Remove a user override
   */
  removeUserOverride(domain: string): boolean {
    return this.cache.removeUserOverride(domain.toLowerCase());
  }

  /**
   * Check if a domain has a user override
   */
  hasUserOverride(domain: string): boolean {
    return this.cache.hasUserOverride(domain.toLowerCase());
  }

  /**
   * Get classification metrics
   */
  getMetrics(): ClassificationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Get database statistics
   */
  getDatabaseStats(): { total: number; byCategory: Record<Category, number> } {
    return this.database.getStats();
  }

  /**
   * Clear the classification cache (preserves user overrides)
   */
  async clearCache(): Promise<void> {
    await this.cache.clearCache();
  }

  /**
   * Clear all data including user overrides
   */
  async clearAll(): Promise<void> {
    await this.cache.clearAll();
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Export all user overrides for backup
   */
  exportUserOverrides(): Record<string, DomainClassification> {
    const overrides: Record<string, DomainClassification> = {};
    this.cache.getUserOverrides().forEach((value, key) => {
      overrides[key] = value;
    });
    return overrides;
  }

  /**
   * Import user overrides from backup
   */
  async importUserOverrides(
    overrides: Record<string, DomainClassification>
  ): Promise<void> {
    await this.cache.import({ userOverrides: overrides });
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get a simple category string for legacy compatibility
   * Maps the new 4-category system to the old 3-category system
   */
  getLegacyCategory(domain: string): 'academic' | 'non-academic' | 'unknown' {
    const classification = this.classify(domain);

    switch (classification.category) {
      case 'academic':
        return 'academic';
      case 'productivity':
        // Productivity is treated as academic for legacy purposes
        return 'academic';
      case 'neutral':
        // Low confidence neutral -> unknown, high confidence -> based on context
        return classification.confidence < 0.7 ? 'unknown' : 'academic';
      case 'non_academic':
        return 'non-academic';
      default:
        return 'unknown';
    }
  }
}

// Singleton instance
let serviceInstance: ClassificationService | null = null;

/**
 * Get the singleton classification service instance
 */
export function getClassificationService(): ClassificationService {
  if (!serviceInstance) {
    serviceInstance = new ClassificationService();
  }
  return serviceInstance;
}

/**
 * Initialize the classification service
 */
export async function initializeClassificationService(): Promise<ClassificationService> {
  const service = getClassificationService();
  await service.initialize();
  return service;
}

/**
 * Convenience function to classify a domain
 * Initializes the service if needed
 */
export async function classifyDomain(domain: string): Promise<DomainClassification> {
  const service = getClassificationService();
  if (!service.isInitialized()) {
    await service.initialize();
  }
  return service.classify(domain);
}

/**
 * Convenience function to get legacy category
 * For backward compatibility with existing code
 */
export async function getLegacyCategory(
  domain: string
): Promise<'academic' | 'non-academic' | 'unknown'> {
  const service = getClassificationService();
  if (!service.isInitialized()) {
    await service.initialize();
  }
  return service.getLegacyCategory(domain);
}
