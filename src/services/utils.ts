/**
 * Utility functions for the activity tracking system
 */

/**
 * Generate unique event ID with prefix
 */
export function generateEventId(): string {
  return 'evt_' + crypto.randomUUID().slice(0, 12);
}

/**
 * Extract domain from URL (removes www. prefix)
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Extract path from URL (without query params)
 */
export function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/**
 * Extract subdomain from URL
 */
export function extractSubdomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) {
      // Remove TLD and domain, keep subdomain(s)
      return parts.slice(0, -2).join('.');
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Get current ISO timestamp
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Sanitize URL by removing query parameters and fragments for privacy
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Preserve essential parameters for classification and activity separation
    const paramsToKeep = new Set<string>();
    if (hostname.includes('youtube.com')) {
      paramsToKeep.add('v');
      paramsToKeep.add('list');
    } else if (hostname.includes('google.com')) {
      paramsToKeep.add('q');
    }
    
    const newSearchParams = new URLSearchParams();
    urlObj.searchParams.forEach((value, key) => {
      if (paramsToKeep.has(key)) {
        newSearchParams.set(key, value);
      }
    });
    
    const searchStr = newSearchParams.toString();
    const searchPart = searchStr ? `?${searchStr}` : '';
    
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}${searchPart}`;
  } catch {
    return url;
  }
}

/**
 * Parse URL into components
 */
export function parseUrl(url: string): {
  protocol: string;
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
  searchParams: Record<string, string>;
} | null {
  try {
    const urlObj = new URL(url);
    const searchParams: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      searchParams[key] = value;
    });

    return {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
      searchParams,
    };
  } catch {
    return null;
  }
}

/**
 * Format milliseconds to human-readable time
 */
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

/**
 * Format seconds to human-readable time
 */
export function formatSeconds(seconds: number): string {
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

/**
 * Format timestamp to locale date string
 */
export function formatDate(timestamp: number | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Check if URL is likely academic based on domain
 */
export function isLikelyAcademic(url: string): boolean {
  const academicIndicators = [
    'scholar.google',
    'coursera.org',
    'edx.org',
    'udemy.com',
    'khanacademy.org',
    'stackoverflow.com',
    'github.com',
    'docs.google.com',
    'notion.so',
    '.edu',
    '.ac.',
    'arxiv.org',
    'researchgate.net',
    'academia.edu',
  ];

  const lowerUrl = url.toLowerCase();
  return academicIndicators.some((indicator) => lowerUrl.includes(indicator));
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
