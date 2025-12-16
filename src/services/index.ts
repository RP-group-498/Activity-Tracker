/**
 * Services Index
 * Export all services for easy import
 */

export { getNativeMessagingService } from './nativeMessaging';
export type {
  ConnectionChangeCallback,
  SessionUpdateCallback,
  ErrorCallback,
  CommandCallback,
} from './nativeMessaging';

export { getConsentManager } from './consentManager';

export { getExclusionManager } from './exclusionManager';

export { getActivityTracker } from './activityTracker';

export { getEventStorageManager } from './eventStorage';

export {
  enrichActivityEvent,
  prepareBatchForSync,
  sanitizeForSync,
  prepareAndSanitizeBatch,
} from './enrichment';

export {
  generateEventId,
  extractDomain,
  extractPath,
  extractSubdomain,
  getTimestamp,
  sanitizeUrl,
  parseUrl,
  formatTime,
  formatSeconds,
  formatDate,
  isLikelyAcademic,
  debounce,
  throttle,
} from './utils';
