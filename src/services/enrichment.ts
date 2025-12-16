/**
 * Data Enrichment Utilities
 * Prepares activity data for the classification layer in the desktop app.
 *
 * The extension captures raw data; classification happens in the desktop app.
 * These utilities enrich events with additional metadata to help accurate classification.
 */

import {
  ActivityEvent,
  UrlComponents,
  TitleHints,
  EngagementMetrics,
  YouTubeContext,
  GoogleContext,
  SocialContext,
  ClassificationHints,
} from '../types';
import { extractDomain, extractSubdomain } from './utils';

// Social media domains
const SOCIAL_MEDIA_DOMAINS = [
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'linkedin.com',
  'pinterest.com',
  'snapchat.com',
  'tumblr.com',
  'discord.com',
];

// Known domains for quick classification
const COMMON_DOMAINS = [
  'google.com',
  'facebook.com',
  'youtube.com',
  'twitter.com',
  'github.com',
  'stackoverflow.com',
  'reddit.com',
  'amazon.com',
  'wikipedia.org',
];

// Ambiguous domains that need context for classification
const AMBIGUOUS_DOMAINS = [
  'youtube.com',
  'reddit.com',
  'medium.com',
  'twitter.com',
  'linkedin.com',
  'x.com',
];

/**
 * Parse URL into components
 */
function parseUrlComponents(url: string): UrlComponents | null {
  try {
    const urlObj = new URL(url);
    const searchParams: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      searchParams[key] = value;
    });

    return {
      protocol: urlObj.protocol,
      domain: extractDomain(url),
      subdomain: extractSubdomain(url),
      path: urlObj.pathname,
      pathSegments: urlObj.pathname.split('/').filter(Boolean),
      queryParams: searchParams,
      hash: urlObj.hash,
    };
  } catch {
    return null;
  }
}

/**
 * Generate title hints for classification
 */
function generateTitleHints(title: string, url: string): TitleHints {
  return {
    wordCount: title.split(/\s+/).filter(Boolean).length,
    hasNumbers: /\d/.test(title),
    possibleVideo: /watch|video|episode|stream|play/i.test(title),
    possibleSearch: /search|results|query/i.test(url),
    possibleDocs: /docs|documentation|api|reference|guide|tutorial/i.test(url),
  };
}

/**
 * Calculate engagement metrics
 */
function calculateEngagement(activeTime: number, idleTime: number): EngagementMetrics {
  const totalTime = activeTime + idleTime;
  const activeRatio = totalTime > 0 ? activeTime / totalTime : 0;

  return {
    activeTime,
    idleTime,
    activeRatio,
    wasEngaged: activeRatio > 0.7,
  };
}

/**
 * Enrich YouTube-specific data
 */
function enrichYouTubeData(event: ActivityEvent): YouTubeContext | null {
  if (!event.domain.includes('youtube')) return null;

  try {
    const url = new URL(event.url);
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    return {
      isVideo: pathname === '/watch',
      videoId: searchParams.get('v'),
      isPlaylist: searchParams.has('list'),
      isChannel: pathname.startsWith('/@') || pathname.startsWith('/channel'),
      isSearch: pathname === '/results',
      searchQuery: searchParams.get('search_query'),
      titleForClassification: event.title.replace(' - YouTube', '').trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Identify Google service from domain
 */
function identifyGoogleService(domain: string): string {
  const services: Record<string, string> = {
    'scholar.google.com': 'scholar',
    'docs.google.com': 'docs',
    'drive.google.com': 'drive',
    'classroom.google.com': 'classroom',
    'meet.google.com': 'meet',
    'mail.google.com': 'gmail',
    'calendar.google.com': 'calendar',
    'colab.research.google.com': 'colab',
    'google.com': 'search',
  };
  return services[domain] || 'other';
}

/**
 * Enrich Google-specific data
 */
function enrichGoogleData(event: ActivityEvent): GoogleContext | null {
  if (!event.domain.includes('google')) return null;

  try {
    const url = new URL(event.url);
    const searchParams = url.searchParams;

    return {
      service: identifyGoogleService(event.domain),
      isSearch: event.domain === 'google.com' && event.path.startsWith('/search'),
      searchQuery: searchParams.get('q'),
      isScholar: event.domain === 'scholar.google.com',
      isDocs: event.domain === 'docs.google.com',
      isDrive: event.domain === 'drive.google.com',
      isClassroom: event.domain === 'classroom.google.com',
    };
  } catch {
    return null;
  }
}

/**
 * Identify social media platform
 */
function identifySocialPlatform(domain: string): string {
  const platforms: Record<string, string> = {
    'facebook.com': 'facebook',
    'twitter.com': 'twitter',
    'x.com': 'twitter',
    'instagram.com': 'instagram',
    'tiktok.com': 'tiktok',
    'reddit.com': 'reddit',
    'linkedin.com': 'linkedin',
    'pinterest.com': 'pinterest',
    'snapchat.com': 'snapchat',
    'tumblr.com': 'tumblr',
    'discord.com': 'discord',
  };
  return platforms[domain] || 'unknown';
}

/**
 * Check if domain is social media
 */
function isSocialMedia(domain: string): boolean {
  return SOCIAL_MEDIA_DOMAINS.some((d) => domain.includes(d));
}

/**
 * Enrich social media-specific data
 */
function enrichSocialMediaData(event: ActivityEvent): SocialContext | null {
  if (!isSocialMedia(event.domain)) return null;

  const path = event.path;

  // Detect if viewing specific content vs browsing feed
  const isDirectContent =
    path.includes('/status/') || // Twitter
    path.includes('/posts/') || // Facebook
    path.includes('/p/') || // Instagram
    path.includes('/reel/') || // Instagram/Facebook
    path.includes('/comments/'); // Reddit

  return {
    platform: identifySocialPlatform(event.domain),
    isDirectContent,
    isFeed: path === '/' || path === '/home' || path === '/feed',
    isMessaging: path.includes('/messages') || path.includes('/direct'),
    possibleAcademic: /research|study|paper|thesis|university|academic|science/i.test(
      event.title
    ),
  };
}

/**
 * Get suggested classification layer
 */
function getSuggestedLayer(
  event: ActivityEvent
): 'rules' | 'path_analysis' | 'ml_classifier' {
  if (COMMON_DOMAINS.some((d) => event.domain.includes(d))) {
    return 'rules';
  }
  if (AMBIGUOUS_DOMAINS.some((d) => event.domain.includes(d))) {
    return 'path_analysis';
  }
  return 'ml_classifier';
}

/**
 * Generate classification hints
 */
function generateClassificationHints(event: ActivityEvent): ClassificationHints {
  const isKnownDomain = COMMON_DOMAINS.some((d) => event.domain.includes(d));
  const isAmbiguous = AMBIGUOUS_DOMAINS.some((d) => event.domain.includes(d));

  return {
    suggestedLayer: getSuggestedLayer(event),
    isKnownDomain,
    needsTitleAnalysis: isAmbiguous,
    mayNeedLLM:
      isAmbiguous &&
      (event.titleHints?.wordCount || 0) > 3 &&
      !event.path.includes('/watch'),
  };
}

/**
 * Enrich a single activity event with all classification-helpful data
 */
export function enrichActivityEvent(event: ActivityEvent): ActivityEvent {
  const enriched = { ...event };

  // Add URL components
  enriched.urlComponents = parseUrlComponents(event.url) || undefined;

  // Add title hints
  enriched.titleHints = generateTitleHints(event.title, event.url);

  // Add engagement metrics
  enriched.engagement = calculateEngagement(event.activeTime, event.idleTime);

  // Add domain-specific context
  if (event.domain.includes('youtube')) {
    enriched.youtubeContext = enrichYouTubeData(event) || undefined;
  } else if (event.domain.includes('google')) {
    enriched.googleContext = enrichGoogleData(event) || undefined;
  }

  if (isSocialMedia(event.domain)) {
    enriched.socialContext = enrichSocialMediaData(event) || undefined;
  }

  // Add classification hints
  enriched.classificationHints = generateClassificationHints(enriched);

  return enriched;
}

/**
 * Prepare a batch of events for sync to desktop app
 */
export function prepareBatchForSync(events: ActivityEvent[]): ActivityEvent[] {
  return events.map((event) => enrichActivityEvent(event));
}

/**
 * Sanitize event for sync (remove sensitive data)
 */
export function sanitizeForSync(event: ActivityEvent): ActivityEvent {
  const sanitized = { ...event };

  // Remove potentially sensitive query params
  if (sanitized.urlComponents?.queryParams) {
    const sensitiveParams = ['password', 'token', 'key', 'secret', 'auth', 'api_key'];
    sensitiveParams.forEach((param) => {
      if (sanitized.urlComponents?.queryParams[param]) {
        delete sanitized.urlComponents.queryParams[param];
      }
    });
  }

  // Mark search queries (keep for classification but note they exist)
  if (sanitized.googleContext?.searchQuery) {
    sanitized.googleContext = {
      ...sanitized.googleContext,
      // Search query kept for classification
    };
  }

  return sanitized;
}

/**
 * Prepare and sanitize batch for sync
 */
export function prepareAndSanitizeBatch(events: ActivityEvent[]): ActivityEvent[] {
  return prepareBatchForSync(events).map((e) => sanitizeForSync(e));
}
