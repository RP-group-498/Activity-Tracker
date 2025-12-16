# Classification Data Preparation

## Purpose
This file covers preparing activity data for the classification layer. Classification happens in the desktop app, but the extension needs to capture the right data. Use this when working on data enrichment features.

---

## Key Principle

> **The extension captures raw data. Classification happens in the desktop app.**

The extension should send rich, complete data so the desktop app can make accurate classification decisions.

---

## Data the Desktop App Needs for Classification

For each page visit, the desktop app's classifier will use:

| Field | Importance | Notes |
|-------|------------|-------|
| `domain` | HIGH | Primary lookup in rules database |
| `url` (full) | HIGH | Path analysis for ambiguous domains |
| `title` | HIGH | Text classification input |
| `path` | MEDIUM | Helps distinguish content type |
| `activeTime` | MEDIUM | Long time = likely engaged with content |
| `tabSwitches` | LOW | Frequent switching = possible distraction |

---

## Enriching Page Data

Before sending to desktop app, enrich with additional metadata:

```javascript
/**
 * Enrich activity event with additional classification-helpful data
 */
function enrichActivityEvent(event, tab) {
  return {
    ...event,
    
    // URL Components (parsed once here, not repeatedly in desktop)
    urlComponents: {
      protocol: new URL(event.url).protocol,
      domain: event.domain,
      subdomain: getSubdomain(event.url),
      path: event.path,
      pathSegments: event.path.split('/').filter(Boolean),
      queryParams: Object.fromEntries(new URL(event.url).searchParams),
      hash: new URL(event.url).hash
    },
    
    // Title analysis hints
    titleHints: {
      wordCount: event.title.split(/\s+/).length,
      hasNumbers: /\d/.test(event.title),
      // Simple keyword detection (desktop does real classification)
      possibleVideo: /watch|video|episode/i.test(event.title),
      possibleSearch: /search|results|query/i.test(event.path),
      possibleDocs: /docs|documentation|api|reference/i.test(event.url)
    },
    
    // Engagement signals
    engagement: {
      activeTime: event.activeTime,
      idleTime: event.idleTime,
      activeRatio: event.activeTime / (event.activeTime + event.idleTime) || 0,
      // True if user was mostly engaged (>70% active)
      wasEngaged: (event.activeTime / (event.activeTime + event.idleTime)) > 0.7
    }
  };
}

function getSubdomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) {
      return parts.slice(0, -2).join('.');
    }
    return '';
  } catch {
    return '';
  }
}
```

---

## Handling Ambiguous Domains

Some domains need extra context for classification:

### YouTube
```javascript
function enrichYouTubeData(event) {
  const url = new URL(event.url);
  
  return {
    ...event,
    youtubeContext: {
      isVideo: url.pathname === '/watch',
      videoId: url.searchParams.get('v'),
      isPlaylist: url.searchParams.has('list'),
      isChannel: url.pathname.startsWith('/@') || url.pathname.startsWith('/channel'),
      isSearch: url.pathname === '/results',
      searchQuery: url.searchParams.get('search_query'),
      // Title is crucial for YouTube classification
      titleForClassification: event.title.replace(' - YouTube', '').trim()
    }
  };
}
```

### Google Services
```javascript
function enrichGoogleData(event) {
  const domain = event.domain;
  
  return {
    ...event,
    googleContext: {
      service: identifyGoogleService(domain),
      isSearch: domain === 'google.com' && event.path.startsWith('/search'),
      searchQuery: new URL(event.url).searchParams.get('q'),
      isScholar: domain === 'scholar.google.com',
      isDocs: domain === 'docs.google.com',
      isDrive: domain === 'drive.google.com',
      isClassroom: domain === 'classroom.google.com'
    }
  };
}

function identifyGoogleService(domain) {
  const services = {
    'scholar.google.com': 'scholar',
    'docs.google.com': 'docs',
    'drive.google.com': 'drive',
    'classroom.google.com': 'classroom',
    'meet.google.com': 'meet',
    'mail.google.com': 'gmail',
    'calendar.google.com': 'calendar',
    'google.com': 'search'
  };
  return services[domain] || 'other';
}
```

### Social Media
```javascript
function enrichSocialMediaData(event) {
  const domain = event.domain;
  
  // Detect if viewing specific content vs browsing feed
  const isDirectContent = 
    event.path.includes('/status/') ||   // Twitter
    event.path.includes('/posts/') ||    // Facebook
    event.path.includes('/p/') ||        // Instagram
    event.path.includes('/reel/');       // Instagram/Facebook
    
  return {
    ...event,
    socialContext: {
      platform: identifySocialPlatform(domain),
      isDirectContent: isDirectContent,
      isFeed: event.path === '/' || event.path === '/home',
      isMessaging: event.path.includes('/messages') || event.path.includes('/direct'),
      // Important: some social content CAN be academic
      possibleAcademic: /research|study|paper|thesis|university/i.test(event.title)
    }
  };
}
```

---

## Batch Processing Before Sync

When preparing events for sync to desktop app:

```javascript
async function prepareBatchForSync(events) {
  return events.map(event => {
    // Base enrichment
    let enriched = enrichActivityEvent(event);
    
    // Domain-specific enrichment
    if (event.domain.includes('youtube')) {
      enriched = enrichYouTubeData(enriched);
    } else if (event.domain.includes('google')) {
      enriched = enrichGoogleData(enriched);
    } else if (isSocialMedia(event.domain)) {
      enriched = enrichSocialMediaData(enriched);
    }
    
    return enriched;
  });
}

function isSocialMedia(domain) {
  const socialDomains = [
    'facebook.com', 'twitter.com', 'x.com', 
    'instagram.com', 'tiktok.com', 'reddit.com',
    'linkedin.com', 'pinterest.com', 'snapchat.com'
  ];
  return socialDomains.some(d => domain.includes(d));
}
```

---

## What NOT to Include

For privacy and efficiency, exclude:

```javascript
function sanitizeForSync(event) {
  // Create a copy without sensitive data
  const sanitized = { ...event };
  
  // Remove potentially sensitive query params
  if (sanitized.urlComponents?.queryParams) {
    const sensitiveParams = ['password', 'token', 'key', 'secret', 'auth'];
    sensitiveParams.forEach(param => {
      delete sanitized.urlComponents.queryParams[param];
    });
  }
  
  // Don't send search queries for non-academic searches
  if (sanitized.googleContext?.searchQuery) {
    // Keep search query for classification but mark it
    sanitized.googleContext.hasSearchQuery = true;
    // Desktop app will use this for classification then discard
  }
  
  // Remove browser internals
  delete sanitized.tabId;
  delete sanitized.windowId;
  
  return sanitized;
}
```

---

## Pre-Classification Hints

Add simple hints the desktop app can use to prioritize classification approach:

```javascript
function addClassificationHints(event) {
  return {
    ...event,
    classificationHints: {
      // Suggest which layer might handle this
      suggestedLayer: getSuggestedLayer(event),
      
      // Confidence that this is a known domain
      isKnownDomain: isInCommonDomains(event.domain),
      
      // Flag if title analysis needed
      needsTitleAnalysis: isAmbiguousDomain(event.domain),
      
      // Flag if likely needs LLM
      mayNeedLLM: isComplexCase(event)
    }
  };
}

function getSuggestedLayer(event) {
  if (isInCommonDomains(event.domain)) return 'rules';
  if (isAmbiguousDomain(event.domain)) return 'path_analysis';
  return 'ml_classifier';
}

function isInCommonDomains(domain) {
  const common = [
    'google.com', 'facebook.com', 'youtube.com', 'twitter.com',
    'github.com', 'stackoverflow.com', 'reddit.com', 'amazon.com'
  ];
  return common.includes(domain);
}

function isAmbiguousDomain(domain) {
  // Domains where content can be academic OR non-academic
  const ambiguous = [
    'youtube.com', 'reddit.com', 'medium.com', 
    'twitter.com', 'linkedin.com'
  ];
  return ambiguous.includes(domain);
}

function isComplexCase(event) {
  // Cases where simple rules won't work
  return (
    isAmbiguousDomain(event.domain) &&
    event.titleHints?.wordCount > 3 &&
    !event.urlComponents?.path.includes('/watch')
  );
}
```

---

## Summary: Data Flow

```
1. Activity captured (URL, title, timestamps)
         ↓
2. Enriched with URL components, domain context
         ↓
3. Classification hints added
         ↓
4. Sanitized (remove sensitive data)
         ↓
5. Batched and sent to desktop app
         ↓
6. Desktop app classifies using hybrid system
         ↓
7. Classified data stored in MongoDB
```

The extension's job is steps 1-5. Keep it lightweight but provide rich data for accurate classification downstream.
