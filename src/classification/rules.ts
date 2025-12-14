/**
 * Rule Engine for Domain Classification
 *
 * This is Tier 2 of the classification system.
 * Rules are evaluated in priority order; first match wins.
 */

import {
  ClassificationRule,
  RuleCondition,
  DomainClassification,
  ParsedDomain,
} from './types';

/**
 * Parse a domain into its components
 */
export function parseDomain(domain: string): ParsedDomain {
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  const parts = normalized.split('.');

  // Handle special TLDs like .co.uk, .ac.uk, .edu.au
  const specialTLDs = [
    'co.uk', 'ac.uk', 'org.uk', 'gov.uk',
    'edu.au', 'com.au', 'org.au',
    'ac.jp', 'co.jp',
    'edu.cn', 'com.cn',
    'edu.br', 'com.br',
    'edu.in', 'co.in',
    'ac.nz', 'co.nz',
    'ac.za', 'co.za',
  ];

  let tld = parts[parts.length - 1];
  let sld = parts.length > 1 ? parts[parts.length - 2] : '';
  let subdomain: string | null = null;

  // Check for special two-part TLDs
  if (parts.length >= 2) {
    const possibleSpecialTLD = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (specialTLDs.includes(possibleSpecialTLD)) {
      tld = possibleSpecialTLD;
      sld = parts.length > 2 ? parts[parts.length - 3] : '';
      subdomain = parts.length > 3 ? parts.slice(0, parts.length - 3).join('.') : null;
    } else {
      subdomain = parts.length > 2 ? parts.slice(0, parts.length - 2).join('.') : null;
    }
  }

  const registrable = sld ? `${sld}.${tld}` : tld;

  return {
    full: normalized,
    tld,
    sld,
    subdomain,
    registrable,
  };
}

/**
 * Default classification rules
 */
const DEFAULT_RULES: ClassificationRule[] = [
  // Academic TLD rules (highest priority)
  {
    id: 'tld-edu',
    name: 'Educational TLD (.edu)',
    priority: 1,
    condition: { type: 'tld', values: ['edu'] },
    result: { category: 'academic', confidence: 0.95 },
  },
  {
    id: 'tld-ac-uk',
    name: 'UK Academic TLD (.ac.uk)',
    priority: 1,
    condition: { type: 'tld', values: ['ac.uk'] },
    result: { category: 'academic', confidence: 0.95 },
  },
  {
    id: 'tld-ac-jp',
    name: 'Japan Academic TLD (.ac.jp)',
    priority: 1,
    condition: { type: 'tld', values: ['ac.jp'] },
    result: { category: 'academic', confidence: 0.95 },
  },
  {
    id: 'tld-edu-au',
    name: 'Australia Educational TLD (.edu.au)',
    priority: 1,
    condition: { type: 'tld', values: ['edu.au'] },
    result: { category: 'academic', confidence: 0.95 },
  },
  {
    id: 'tld-edu-cn',
    name: 'China Educational TLD (.edu.cn)',
    priority: 1,
    condition: { type: 'tld', values: ['edu.cn'] },
    result: { category: 'academic', confidence: 0.95 },
  },
  {
    id: 'tld-edu-br',
    name: 'Brazil Educational TLD (.edu.br)',
    priority: 1,
    condition: { type: 'tld', values: ['edu.br'] },
    result: { category: 'academic', confidence: 0.95 },
  },
  {
    id: 'tld-edu-in',
    name: 'India Educational TLD (.edu.in)',
    priority: 1,
    condition: { type: 'tld', values: ['edu.in'] },
    result: { category: 'academic', confidence: 0.95 },
  },

  // Academic keyword rules
  {
    id: 'keyword-scholar',
    name: 'Scholar keyword',
    priority: 10,
    condition: { type: 'domain_contains', values: ['scholar'] },
    result: { category: 'academic', confidence: 0.90 },
  },
  {
    id: 'keyword-journal',
    name: 'Journal keyword',
    priority: 10,
    condition: { type: 'domain_contains', values: ['journal'] },
    result: { category: 'academic', confidence: 0.90 },
  },
  {
    id: 'keyword-research',
    name: 'Research keyword',
    priority: 15,
    condition: { type: 'domain_contains', values: ['research'] },
    result: { category: 'academic', confidence: 0.85 },
  },
  {
    id: 'keyword-university',
    name: 'University keyword',
    priority: 10,
    condition: { type: 'domain_contains', values: ['university', 'univ'] },
    result: { category: 'academic', confidence: 0.90 },
  },
  {
    id: 'keyword-college',
    name: 'College keyword',
    priority: 12,
    condition: { type: 'domain_contains', values: ['college'] },
    result: { category: 'academic', confidence: 0.85 },
  },
  {
    id: 'keyword-academic',
    name: 'Academic keyword',
    priority: 10,
    condition: { type: 'domain_contains', values: ['academic'] },
    result: { category: 'academic', confidence: 0.90 },
  },
  {
    id: 'keyword-library',
    name: 'Library keyword',
    priority: 15,
    condition: { type: 'domain_contains', values: ['library'] },
    result: { category: 'academic', confidence: 0.85 },
  },
  {
    id: 'keyword-learn',
    name: 'Learning keywords',
    priority: 20,
    condition: { type: 'domain_contains', values: ['learn', 'course', 'tutorial', 'lecture'] },
    result: { category: 'academic', confidence: 0.80 },
  },

  // Productivity subdomain rules (Google services)
  {
    id: 'google-docs',
    name: 'Google Docs subdomain',
    priority: 5,
    condition: { type: 'subdomain', parent: 'google.com', subdomains: ['docs', 'sheets', 'slides', 'drive', 'calendar'] },
    result: { category: 'productivity', confidence: 0.90 },
  },

  // Non-academic patterns
  {
    id: 'keyword-gaming',
    name: 'Gaming keywords',
    priority: 20,
    condition: { type: 'domain_contains', values: ['game', 'gaming', 'play'] },
    result: { category: 'non_academic', confidence: 0.80 },
  },
  {
    id: 'keyword-stream',
    name: 'Streaming keywords',
    priority: 20,
    condition: { type: 'domain_contains', values: ['stream', 'watch', 'movie'] },
    result: { category: 'non_academic', confidence: 0.75 },
  },
  {
    id: 'keyword-social',
    name: 'Social keywords',
    priority: 25,
    condition: { type: 'domain_contains', values: ['social', 'chat', 'dating'] },
    result: { category: 'non_academic', confidence: 0.75 },
  },
  {
    id: 'keyword-shop',
    name: 'Shopping keywords',
    priority: 25,
    condition: { type: 'domain_contains', values: ['shop', 'store', 'buy', 'deal'] },
    result: { category: 'non_academic', confidence: 0.80 },
  },
];

/**
 * Rule Engine for domain classification
 */
export class RuleEngine {
  private rules: ClassificationRule[];

  constructor(customRules?: ClassificationRule[]) {
    this.rules = customRules || [...DEFAULT_RULES];
    // Sort by priority (lower = higher priority)
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Classify a domain using the rule engine
   * Returns null if no rule matches
   */
  classify(domain: string): DomainClassification | null {
    const parsed = parseDomain(domain);

    for (const rule of this.rules) {
      if (this.matchesCondition(parsed, rule.condition)) {
        return {
          domain: parsed.full,
          category: rule.result.category,
          confidence: rule.result.confidence,
          source: 'rule',
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Check if a parsed domain matches a rule condition
   */
  private matchesCondition(parsed: ParsedDomain, condition: RuleCondition): boolean {
    switch (condition.type) {
      case 'tld':
        return condition.values.some(
          (tld) => parsed.tld === tld || parsed.tld.endsWith(`.${tld}`)
        );

      case 'domain_contains':
        return condition.values.some((keyword) =>
          parsed.full.includes(keyword.toLowerCase())
        );

      case 'domain_suffix':
        return parsed.full.endsWith(condition.value.toLowerCase());

      case 'subdomain':
        return (
          parsed.registrable === condition.parent.toLowerCase() &&
          parsed.subdomain !== null &&
          condition.subdomains.some(
            (sub) => parsed.subdomain === sub || parsed.subdomain?.startsWith(`${sub}.`)
          )
        );

      case 'regex':
        try {
          const regex = new RegExp(condition.pattern, 'i');
          return regex.test(parsed.full);
        } catch {
          console.warn(`Invalid regex pattern: ${condition.pattern}`);
          return false;
        }

      default:
        return false;
    }
  }

  /**
   * Add a custom rule
   */
  addRule(rule: ClassificationRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): ClassificationRule[] {
    return [...this.rules];
  }

  /**
   * Get rule count
   */
  getRuleCount(): number {
    return this.rules.length;
  }
}

// Singleton instance
let ruleEngineInstance: RuleEngine | null = null;

/**
 * Get the singleton rule engine instance
 */
export function getRuleEngine(): RuleEngine {
  if (!ruleEngineInstance) {
    ruleEngineInstance = new RuleEngine();
  }
  return ruleEngineInstance;
}
