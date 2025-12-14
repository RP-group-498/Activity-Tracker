/**
 * Domain Classification System Types
 *
 * This module defines all types for the automated domain classification system.
 * The system uses a 4-tier approach: Database -> Rules -> Cache -> API
 */

// ============================================================================
// Core Classification Types
// ============================================================================

/**
 * Classification categories for domains
 */
export type Category = 'academic' | 'productivity' | 'neutral' | 'non_academic';

/**
 * Source of the classification decision
 */
export type ClassificationSource = 'database' | 'rule' | 'cache' | 'api' | 'user';

/**
 * Result of classifying a domain
 */
export interface DomainClassification {
  domain: string;
  category: Category;
  confidence: number; // 0.0 - 1.0
  source: ClassificationSource;
  timestamp: number;
  userOverride?: boolean;
}

// ============================================================================
// Domain Database Types
// ============================================================================

/**
 * How to match the domain entry
 */
export type DomainMatchType = 'exact' | 'suffix' | 'contains';

/**
 * Single entry in the domain database
 */
export interface DomainEntry {
  domain: string; // The domain pattern to match
  type: DomainMatchType;
  confidence: number;
  tags?: string[]; // Optional categorization tags
}

/**
 * The complete domain database structure
 */
export interface DomainDatabase {
  academic: DomainEntry[];
  productivity: DomainEntry[];
  neutral: DomainEntry[];
  nonAcademic: DomainEntry[];
}

// ============================================================================
// Rule Engine Types
// ============================================================================

/**
 * Types of conditions a rule can have
 */
export type RuleConditionType =
  | 'tld'
  | 'domain_contains'
  | 'domain_suffix'
  | 'subdomain'
  | 'regex';

/**
 * TLD-based condition (e.g., .edu, .ac.uk)
 */
export interface TldCondition {
  type: 'tld';
  values: string[];
}

/**
 * Domain contains keyword condition
 */
export interface DomainContainsCondition {
  type: 'domain_contains';
  values: string[];
}

/**
 * Domain suffix condition
 */
export interface DomainSuffixCondition {
  type: 'domain_suffix';
  value: string;
}

/**
 * Subdomain-based condition
 */
export interface SubdomainCondition {
  type: 'subdomain';
  parent: string;
  subdomains: string[];
}

/**
 * Regex-based condition
 */
export interface RegexCondition {
  type: 'regex';
  pattern: string;
}

/**
 * Union of all possible rule conditions
 */
export type RuleCondition =
  | TldCondition
  | DomainContainsCondition
  | DomainSuffixCondition
  | SubdomainCondition
  | RegexCondition;

/**
 * A classification rule
 */
export interface ClassificationRule {
  id: string;
  name: string;
  priority: number; // Lower = higher priority
  condition: RuleCondition;
  result: {
    category: Category;
    confidence: number;
  };
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  totalClassified: number;
  bySource: Record<ClassificationSource, number>;
  byCategory: Record<Category, number>;
}

/**
 * Structure for cached classifications
 */
export interface ClassificationCacheData {
  classifications: Record<string, DomainClassification>;
  userOverrides: Record<string, DomainClassification>;
  stats: CacheStats;
}

// ============================================================================
// User Correction Types
// ============================================================================

/**
 * Record of a user correction
 */
export interface UserCorrection {
  domain: string;
  originalCategory: Category;
  correctedCategory: Category;
  timestamp: number;
  note?: string;
}

// ============================================================================
// API Types (for future external classification service)
// ============================================================================

/**
 * Request to external classification API
 */
export interface ClassificationRequest {
  domain: string;
}

/**
 * Response from external classification API
 */
export interface ClassificationResponse {
  domain: string;
  category: Category;
  confidence: number;
  reasoning?: string;
}

/**
 * API configuration
 */
export interface APIConfig {
  maxRequestsPerMinute: number;
  batchSize: number;
  retryAttempts: number;
  retryDelayMs: number;
}

// ============================================================================
// Classification Metrics
// ============================================================================

/**
 * Metrics for monitoring classification system
 */
export interface ClassificationMetrics {
  totalClassifications: number;
  bySource: {
    database: number;
    rule: number;
    cache: number;
    api: number;
    user: number;
  };
  byCategory: {
    academic: number;
    productivity: number;
    neutral: number;
    nonAcademic: number;
  };
  apiCalls: {
    total: number;
    successful: number;
    failed: number;
    avgLatencyMs: number;
  };
  cacheHitRate: number;
}

// ============================================================================
// Parsed Domain Types
// ============================================================================

/**
 * Parsed domain structure for rule matching
 */
export interface ParsedDomain {
  full: string;           // e.g., "scholar.google.com"
  tld: string;            // e.g., "com"
  sld: string;            // e.g., "google"
  subdomain: string | null; // e.g., "scholar"
  registrable: string;    // e.g., "google.com"
}

// ============================================================================
// Confidence Levels
// ============================================================================

export const CONFIDENCE_LEVELS = {
  HIGH: { min: 0.9, max: 1.0 },
  MEDIUM: { min: 0.7, max: 0.89 },
  LOW: { min: 0.5, max: 0.69 },
} as const;

export const DEFAULT_CONFIDENCE = {
  DATABASE: 0.95,
  RULE_STRONG: 0.95,
  RULE_WEAK: 0.85,
  CACHE: 1.0, // Cached results maintain their original confidence
  API: 0.8,
  USER: 1.0, // User overrides are absolute
} as const;
