/**
 * Domain Database Loader
 *
 * Loads and manages the pre-loaded domain database that ships with the extension.
 * This is Tier 1 of the classification system - covers ~95% of common browsing.
 */

import {
  Category,
  DomainEntry,
  DomainDatabase,
  DomainClassification,
  DomainMatchType,
} from './types';

// Import domain data
import academicDomains from '../data/domains/academic.json';
import productivityDomains from '../data/domains/productivity.json';
import neutralDomains from '../data/domains/neutral.json';
import nonAcademicDomains from '../data/domains/non-academic.json';

/**
 * Manages the pre-loaded domain database
 */
export class DomainDatabaseManager {
  private database: DomainDatabase;
  private initialized: boolean = false;

  constructor() {
    this.database = {
      academic: [],
      productivity: [],
      neutral: [],
      nonAcademic: [],
    };
  }

  /**
   * Initialize the database by loading domain data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.database = {
        academic: this.parseEntries(academicDomains.domains),
        productivity: this.parseEntries(productivityDomains.domains),
        neutral: this.parseEntries(neutralDomains.domains),
        nonAcademic: this.parseEntries(nonAcademicDomains.domains),
      };

      this.initialized = true;
      console.log(
        `Domain database initialized: ${this.getTotalDomainCount()} domains loaded`
      );
    } catch (error) {
      console.error('Failed to initialize domain database:', error);
      throw error;
    }
  }

  /**
   * Parse raw domain entries from JSON
   */
  private parseEntries(
    entries: Array<{
      domain: string;
      type: string;
      confidence: number;
      tags?: string[];
    }>
  ): DomainEntry[] {
    return entries.map((entry) => ({
      domain: entry.domain.toLowerCase(),
      type: entry.type as DomainMatchType,
      confidence: entry.confidence,
      tags: entry.tags,
    }));
  }

  /**
   * Get total number of domains in database
   */
  getTotalDomainCount(): number {
    return (
      this.database.academic.length +
      this.database.productivity.length +
      this.database.neutral.length +
      this.database.nonAcademic.length
    );
  }

  /**
   * Classify a domain using the database
   * Returns null if domain is not found in database
   */
  classify(domain: string): DomainClassification | null {
    if (!this.initialized) {
      console.warn('Domain database not initialized');
      return null;
    }

    const normalizedDomain = domain.toLowerCase();

    // Check each category in priority order
    const categories: { category: Category; entries: DomainEntry[] }[] = [
      { category: 'academic', entries: this.database.academic },
      { category: 'productivity', entries: this.database.productivity },
      { category: 'non_academic', entries: this.database.nonAcademic },
      { category: 'neutral', entries: this.database.neutral },
    ];

    for (const { category, entries } of categories) {
      const match = this.findMatch(normalizedDomain, entries);
      if (match) {
        return {
          domain: normalizedDomain,
          category,
          confidence: match.confidence,
          source: 'database',
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Find a matching entry for a domain
   */
  private findMatch(domain: string, entries: DomainEntry[]): DomainEntry | null {
    for (const entry of entries) {
      if (this.matches(domain, entry)) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Check if a domain matches an entry based on match type
   */
  private matches(domain: string, entry: DomainEntry): boolean {
    switch (entry.type) {
      case 'exact':
        return domain === entry.domain || domain === `www.${entry.domain}`;

      case 'suffix':
        // For suffix matches like .edu, .ac.uk
        return domain.endsWith(entry.domain);

      case 'contains':
        return domain.includes(entry.domain);

      default:
        return false;
    }
  }

  /**
   * Get database statistics
   */
  getStats(): {
    total: number;
    byCategory: Record<Category, number>;
  } {
    return {
      total: this.getTotalDomainCount(),
      byCategory: {
        academic: this.database.academic.length,
        productivity: this.database.productivity.length,
        neutral: this.database.neutral.length,
        non_academic: this.database.nonAcademic.length,
      },
    };
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get all domains in a specific category
   */
  getDomainsByCategory(category: Category): DomainEntry[] {
    switch (category) {
      case 'academic':
        return [...this.database.academic];
      case 'productivity':
        return [...this.database.productivity];
      case 'neutral':
        return [...this.database.neutral];
      case 'non_academic':
        return [...this.database.nonAcademic];
      default:
        return [];
    }
  }
}

// Singleton instance
let databaseInstance: DomainDatabaseManager | null = null;

/**
 * Get the singleton database instance
 */
export function getDomainDatabase(): DomainDatabaseManager {
  if (!databaseInstance) {
    databaseInstance = new DomainDatabaseManager();
  }
  return databaseInstance;
}

/**
 * Initialize the domain database
 */
export async function initializeDomainDatabase(): Promise<DomainDatabaseManager> {
  const db = getDomainDatabase();
  await db.initialize();
  return db;
}
