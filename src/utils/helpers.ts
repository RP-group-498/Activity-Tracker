import { Settings, LegacyCategory, ClassificationInfo } from '../types';
import {
  getClassificationService,
  Category,
} from '../classification';

export function generateUUID(): string {
  return crypto.randomUUID();
}

export function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '';
  }
}

/**
 * Map detailed category to legacy category for backward compatibility
 */
function mapToLegacyCategory(detailedCategory: Category): LegacyCategory {
  switch (detailedCategory) {
    case 'academic':
      return 'academic';
    case 'productivity':
      return 'academic'; // Productivity is considered academic for legacy
    case 'neutral':
      return 'unknown';
    case 'non_academic':
      return 'non-academic';
    default:
      return 'unknown';
  }
}

/**
 * Categorize a domain using the new classification service
 * Falls back to settings-based categorization if service not initialized
 *
 * @param domain - The domain to categorize
 * @param settings - User settings (used as fallback and for user-defined domains)
 * @returns Legacy category for backward compatibility
 */
export function categorizeDomain(
  domain: string,
  settings: Settings
): LegacyCategory {
  // First, check user-defined domains in settings (highest priority)
  if (settings.academicDomains.some(d => domain.includes(d) || d.includes(domain))) {
    return 'academic';
  }
  if (settings.nonAcademicDomains.some(d => domain.includes(d) || d.includes(domain))) {
    return 'non-academic';
  }

  // Use the classification service
  try {
    const service = getClassificationService();
    if (service.isInitialized()) {
      const classification = service.classify(domain);
      return mapToLegacyCategory(classification.category);
    }
  } catch (error) {
    console.warn('Classification service not available, using fallback');
  }

  return 'unknown';
}

/**
 * Get detailed classification info for a domain
 * Returns full classification with confidence and source
 *
 * @param domain - The domain to classify
 * @param settings - User settings for user-defined domains
 * @returns Detailed classification info or null if not available
 */
export function getDetailedClassification(
  domain: string,
  settings: Settings
): ClassificationInfo | null {
  // Check user-defined domains first
  if (settings.academicDomains.some(d => domain.includes(d) || d.includes(domain))) {
    return {
      detailedCategory: 'academic',
      confidence: 1.0,
      source: 'user',
      userOverride: true,
    };
  }
  if (settings.nonAcademicDomains.some(d => domain.includes(d) || d.includes(domain))) {
    return {
      detailedCategory: 'non_academic',
      confidence: 1.0,
      source: 'user',
      userOverride: true,
    };
  }

  // Use the classification service
  try {
    const service = getClassificationService();
    if (service.isInitialized()) {
      const classification = service.classify(domain);
      return {
        detailedCategory: classification.category,
        confidence: classification.confidence,
        source: classification.source,
        userOverride: classification.userOverride,
      };
    }
  } catch (error) {
    console.warn('Classification service not available');
  }

  return null;
}

export function isSensitiveUrl(url: string): boolean {
  const sensitivePatterns = [
    'password',
    'login',
    'auth',
    'bank',
    'payment',
    'checkout',
    'account',
    'private',
  ];

  const lowerUrl = url.toLowerCase();
  return sensitivePatterns.some(pattern => lowerUrl.includes(pattern));
}

export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query parameters for privacy
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch (error) {
    return url;
  }
}

export function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function formatDate(timestamp: number | string): string {
  return new Date(timestamp).toLocaleString();
}
