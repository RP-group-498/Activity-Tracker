# Automated Domain Classification System

## Overview

This document outlines the architecture for automatically classifying browsing activity as academic or non-academic. The system prioritizes **privacy** (data stays on device), **accuracy** (no unknown classifications), and **reliability** (consistent results for downstream ML components).

---

## Design Principles

1. **Privacy-First**: Raw user data never leaves the device
2. **Domain-Only External Calls**: Only public domain names can be sent externally
3. **No Unknown Category**: Every domain must be classified
4. **Cache Everything**: Classify each domain only once
5. **User Corrections**: Allow manual overrides that persist

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LOCAL (On Device)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ TIER 1: Pre-loaded Domain Database                          │   │
│  │ - Ships with extension                                      │   │
│  │ - Known academic & non-academic domains                     │   │
│  │ - Covers ~95% of common browsing                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼ Not found                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ TIER 2: Rule Engine                                         │   │
│  │ - TLD patterns (.edu, .ac.uk)                               │   │
│  │ - Keyword matching in domain                                │   │
│  │ - Subdomain analysis                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼ No rule match                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ TIER 3: Local Cache                                         │   │
│  │ - Previously classified domains                             │   │
│  │ - User corrections                                          │   │
│  │ - API results cache                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼ Cache miss (LOW confidence)          │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               │ Domain name only (e.g., "example.com")
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL (Domain-Only API)                      │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 4: External Classification Service                            │
│  - Input: domain name only                                          │
│  - Output: category + confidence score                              │
│  - Options: Self-hosted service / LLM API / Categorization service  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Classification Categories

### Primary Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `academic` | Directly educational, research, or learning-related | scholar.google.com, jstor.org, coursera.org |
| `productivity` | Tools that support work but aren't inherently academic | docs.google.com, notion.so, github.com |
| `neutral` | Context-dependent, could be either | google.com, stackoverflow.com |
| `non_academic` | Entertainment, social media, leisure | youtube.com, twitter.com, netflix.com |

### Classification Object Structure

```typescript
interface DomainClassification {
  domain: string;                    // The classified domain
  category: 'academic' | 'productivity' | 'neutral' | 'non_academic';
  confidence: number;                // 0.0 - 1.0
  source: 'database' | 'rule' | 'cache' | 'api' | 'user';
  timestamp: number;                 // When classification was made
  userOverride?: boolean;            // True if user manually corrected
}
```

### Confidence Levels

| Level | Score Range | Meaning |
|-------|-------------|---------|
| HIGH | 0.9 - 1.0 | Database match or strong rule |
| MEDIUM | 0.7 - 0.89 | Partial pattern match or API result |
| LOW | 0.5 - 0.69 | Weak signals, may need verification |

---

## Tier 1: Pre-loaded Domain Database

### Structure

```typescript
interface DomainDatabase {
  academic: DomainEntry[];
  productivity: DomainEntry[];
  neutral: DomainEntry[];
  nonAcademic: DomainEntry[];
}

interface DomainEntry {
  domain: string;          // Can be exact or pattern (*.edu)
  type: 'exact' | 'suffix' | 'contains';
  confidence: number;
  tags?: string[];         // Optional categorization tags
}
```

### Initial Database Sources

#### Academic Domains
- Educational TLDs: `.edu`, `.ac.uk`, `.edu.*` (country variants)
- Research platforms: `scholar.google.com`, `researchgate.net`, `academia.edu`
- Journal publishers: `jstor.org`, `sciencedirect.com`, `springer.com`, `ieee.org`
- Learning platforms: `coursera.org`, `edx.org`, `khanacademy.org`
- University domains: Major university domains worldwide
- Reference: `wikipedia.org`, `britannica.com`

#### Productivity Domains
- Document tools: `docs.google.com`, `notion.so`, `overleaf.com`
- Development: `github.com`, `gitlab.com`, `stackoverflow.com`
- Communication: `slack.com`, `zoom.us`, `teams.microsoft.com`
- Cloud storage: `drive.google.com`, `dropbox.com`

#### Non-Academic Domains
- Social media: `facebook.com`, `twitter.com`, `instagram.com`, `tiktok.com`
- Entertainment: `youtube.com`, `netflix.com`, `twitch.tv`, `spotify.com`
- News/Media: `reddit.com`, `buzzfeed.com`
- Shopping: `amazon.com`, `ebay.com`
- Gaming: `steam.com`, `epicgames.com`

#### Neutral Domains
- Search engines: `google.com`, `bing.com`, `duckduckgo.com`
- General tools: `translate.google.com`

### Database Updates

- Database ships with extension
- Updates delivered via extension updates
- User corrections stored separately and preserved across updates

---

## Tier 2: Rule Engine

### Rule Priority Order

Rules are evaluated in order; first match wins.

```typescript
interface ClassificationRule {
  id: string;
  name: string;
  priority: number;           // Lower = higher priority
  condition: RuleCondition;
  result: {
    category: Category;
    confidence: number;
  };
}

type RuleCondition =
  | { type: 'tld'; values: string[] }
  | { type: 'domain_contains'; values: string[] }
  | { type: 'domain_suffix'; value: string }
  | { type: 'subdomain'; parent: string; subdomains: string[] }
  | { type: 'regex'; pattern: string };
```

### Default Rules

#### Academic Rules (High Confidence: 0.95)

| Rule ID | Condition | Examples |
|---------|-----------|----------|
| `tld-edu` | TLD is `.edu` | `mit.edu`, `stanford.edu` |
| `tld-ac` | TLD matches `.ac.*` | `ox.ac.uk`, `u-tokyo.ac.jp` |
| `tld-edu-country` | TLD matches `.edu.*` | `usp.edu.br` |
| `domain-scholar` | Domain contains `scholar` | `scholar.google.com` |
| `domain-journal` | Domain contains `journal` | `journal.nature.com` |
| `domain-research` | Domain contains `research` | `research.microsoft.com` |
| `domain-university` | Domain contains `university` or `univ` | `university.edu` |
| `domain-learn` | Domain contains `learn` or `course` | `learn.microsoft.com` |

#### Non-Academic Rules (High Confidence: 0.95)

| Rule ID | Condition | Examples |
|---------|-----------|----------|
| `social-media` | Known social media domains | `facebook.com`, `twitter.com` |
| `streaming` | Known streaming platforms | `netflix.com`, `hulu.com` |
| `gaming` | Known gaming platforms | `steam.com`, `epicgames.com` |

#### Productivity Rules (Medium Confidence: 0.85)

| Rule ID | Condition | Examples |
|---------|-----------|----------|
| `dev-platforms` | Development platforms | `github.com`, `gitlab.com` |
| `doc-tools` | Document/productivity tools | `docs.google.com`, `notion.so` |

### Rule Engine Implementation

```typescript
class RuleEngine {
  private rules: ClassificationRule[];

  classify(domain: string): DomainClassification | null {
    const parsed = parseDomain(domain);

    for (const rule of this.rules) {
      if (this.matchesCondition(parsed, rule.condition)) {
        return {
          domain,
          category: rule.result.category,
          confidence: rule.result.confidence,
          source: 'rule',
          timestamp: Date.now()
        };
      }
    }

    return null; // No rule matched
  }
}
```

---

## Tier 3: Local Cache

### Cache Structure

```typescript
interface ClassificationCache {
  // Domain -> Classification mapping
  classifications: Map<string, DomainClassification>;

  // User overrides (preserved across updates)
  userOverrides: Map<string, DomainClassification>;

  // Statistics
  stats: {
    totalClassified: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
  };
}
```

### Cache Storage

- Stored in `chrome.storage.local`
- Key: `domainClassifications`
- Persists across browser sessions
- User overrides stored separately: `userClassificationOverrides`

### Cache Operations

```typescript
interface CacheOperations {
  get(domain: string): DomainClassification | null;
  set(domain: string, classification: DomainClassification): void;
  setUserOverride(domain: string, category: Category): void;
  clear(): void;
  export(): CacheExport;
  import(data: CacheExport): void;
}
```

---

## Tier 4: External Classification API

### Privacy Safeguards

**What is sent:**
- Domain name only (e.g., `example.com`)
- No full URLs
- No paths or query parameters
- No user identifiers
- No timestamps or patterns

**Why this is safe:**
- Domain names are public DNS records
- ISPs and DNS providers already see all domain lookups
- No behavioral pattern exposed
- Single domain, no context

### API Contract

#### Request
```typescript
interface ClassificationRequest {
  domain: string;  // Just the domain, nothing else
}
```

#### Response
```typescript
interface ClassificationResponse {
  domain: string;
  category: 'academic' | 'productivity' | 'neutral' | 'non_academic';
  confidence: number;
  reasoning?: string;  // Optional explanation
}
```

### Implementation Options

#### Option A: Self-Hosted Service (Recommended for Full Control)

```
Browser Extension → Your Backend Server → LLM API
                                       → Categorization DB
```

- You control what data is logged
- Can implement additional privacy measures
- Can cache results server-side for all users

#### Option B: Direct LLM API Call

```typescript
// Example prompt for domain classification
const prompt = `
Classify this domain into exactly one category:
- academic: educational, research, learning platforms
- productivity: work tools, development, documentation
- neutral: general purpose, context-dependent
- non_academic: entertainment, social media, leisure

Domain: ${domain}

Respond with JSON only: {"category": "...", "confidence": 0.XX}
`;
```

#### Option C: URL Categorization Service

- Services like Cloudflare, WebShrinker, or similar
- May need mapping from their categories to ours

### Rate Limiting & Batching

```typescript
interface APIConfig {
  maxRequestsPerMinute: number;
  batchSize: number;
  retryAttempts: number;
  retryDelayMs: number;
}

// Queue unknown domains and batch classify
class ClassificationQueue {
  private queue: string[] = [];

  async add(domain: string): Promise<DomainClassification> {
    // Add to queue, deduplicate, batch when ready
  }
}
```

---

## Handling Neutral/Ambiguous Sites

### Context-Aware Classification

Some domains (like `youtube.com` or `github.com`) can be academic or not depending on usage. Strategies:

#### 1. Page Title Analysis (Local Only)

```typescript
function refineClassification(
  domain: string,
  pageTitle: string,
  baseClassification: DomainClassification
): DomainClassification {
  if (baseClassification.category !== 'neutral') {
    return baseClassification;
  }

  // Analyze page title for academic signals
  const academicKeywords = ['tutorial', 'lecture', 'course', 'research', 'paper'];
  const nonAcademicKeywords = ['music', 'gaming', 'vlog', 'funny'];

  // Adjust classification based on title
  // ...
}
```

#### 2. Time-Based Heuristics

- Extended focused time during work hours → likely productive
- Short visits with many tab switches → likely distraction

#### 3. Let Downstream ML Decide

- Mark as `neutral` with confidence
- Downstream procrastination detection uses other signals (time patterns, app usage)

---

## User Correction Mechanism

### UI Components

1. **Quick Correction**: Click on category in popup to change
2. **Correction History**: View and manage past corrections
3. **Bulk Import/Export**: Share corrections across devices

### Correction Storage

```typescript
interface UserCorrection {
  domain: string;
  originalCategory: Category;
  correctedCategory: Category;
  timestamp: number;
  note?: string;
}
```

### Correction Priority

User corrections always override other sources:

```
Priority: User Override > Database > Rules > API > Default
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Define TypeScript interfaces for all data structures
- [ ] Create domain database JSON structure
- [ ] Implement basic rule engine
- [ ] Set up local cache with chrome.storage.local

### Phase 2: Core Classification
- [ ] Populate initial domain database (500+ domains)
- [ ] Implement all rule types
- [ ] Create ClassificationService class
- [ ] Integrate with existing TabTracker

### Phase 3: External API Integration
- [ ] Design API endpoint contract
- [ ] Implement queue and batching system
- [ ] Add rate limiting and retry logic
- [ ] Cache API results locally

### Phase 4: User Experience
- [ ] Add classification display to popup
- [ ] Implement user correction UI
- [ ] Add correction sync/export
- [ ] Create statistics dashboard

### Phase 5: Refinement
- [ ] Add page title analysis for neutral sites
- [ ] Implement confidence threshold settings
- [ ] Add domain database update mechanism
- [ ] Performance optimization

---

## File Structure

```
src/
├── classification/
│   ├── index.ts                 # Main ClassificationService
│   ├── database.ts              # Domain database loader
│   ├── rules.ts                 # Rule engine implementation
│   ├── cache.ts                 # Local cache management
│   ├── api.ts                   # External API client
│   └── types.ts                 # Classification type definitions
├── data/
│   └── domains/
│       ├── academic.json        # Academic domain list
│       ├── productivity.json    # Productivity domain list
│       ├── non-academic.json    # Non-academic domain list
│       └── neutral.json         # Neutral domain list
```

---

## Testing Strategy

### Unit Tests
- Rule engine pattern matching
- Cache operations
- Domain parsing

### Integration Tests
- Full classification pipeline
- Storage persistence
- API fallback behavior

### Test Cases

```typescript
// Example test cases
const testCases = [
  { domain: 'mit.edu', expected: 'academic' },
  { domain: 'scholar.google.com', expected: 'academic' },
  { domain: 'netflix.com', expected: 'non_academic' },
  { domain: 'github.com', expected: 'productivity' },
  { domain: 'random-unknown-site.io', expected: 'api_call' },
];
```

---

## Metrics & Monitoring

### Classification Metrics

```typescript
interface ClassificationMetrics {
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
```

---

## Security Considerations

1. **No PII in API calls**: Only domain names, never full URLs
2. **Local storage encryption**: Consider encrypting sensitive cache data
3. **API key protection**: If using external APIs, secure key storage
4. **Input validation**: Sanitize all domain inputs before processing

---

## Future Enhancements

1. **Federated learning**: Share anonymized model improvements across users
2. **Community database**: User-contributed domain classifications
3. **Browser history import**: One-time bulk classification of existing history
4. **Cross-device sync**: Sync user corrections via encrypted cloud storage
5. **ML refinement**: Local model that learns from user corrections
