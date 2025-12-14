import { Settings } from '../types';

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

export function categorizeDomain(domain: string, settings: Settings): 'academic' | 'non-academic' | 'unknown' {
  // Check if domain matches academic domains
  if (settings.academicDomains.some(d => domain.includes(d) || d.includes(domain))) {
    return 'academic';
  }

  // Check if domain matches non-academic domains
  if (settings.nonAcademicDomains.some(d => domain.includes(d) || d.includes(domain))) {
    return 'non-academic';
  }

  return 'unknown';
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

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
